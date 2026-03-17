import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "@freelance-os/database";
import { headers } from "next/headers";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { ensureAdminUser, ensureDefaultProviderConfigs, isProviderEnabled } from "./auth-setup";

// ── Permission scopes ───────────────────────────────────────

export const ADMIN_PERMISSION_SCOPES = [
  "mcp:use",
  "read:*",
  "write:*",
  "read:clients",
  "write:clients",
  "read:projects",
  "write:projects",
  "read:invoices",
  "write:invoices",
  "read:time",
  "write:time",
  "read:activity",
  "read:settings",
  "write:settings",
  "read:jobs",
  "write:jobs",
  "read:api-keys",
  "write:api-keys",
] as const;

export type AdminPermissionScope = (typeof ADMIN_PERMISSION_SCOPES)[number];

// ── NextAuth configuration ──────────────────────────────────

const baseAdapter = PrismaAdapter(prisma);
const customAdapter: Adapter = {
  ...baseAdapter,
  deleteSession: async (sessionToken: string) => {
    try {
      const result = await baseAdapter.deleteSession!(sessionToken);
      return result as any;
    } catch (error: any) {
      if (error?.code === "P2025") {
        return undefined as any;
      }
      throw error;
    }
  },
};

let _initialized = false;
async function initializeAuth() {
  if (_initialized) return;
  _initialized = true;
  try {
    await ensureAdminUser();
    await ensureDefaultProviderConfigs();
  } catch (err) {
    console.error("[Auth] Failed to initialize:", err);
    _initialized = false;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customAdapter,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        await initializeAuth();

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clientId: user.clientId,
        };
      },
    }),
    EmailProvider({
      id: "email",
      name: "Email",
      server: { host: "localhost", port: 25, auth: { user: "", pass: "" } }, // dummy – we use custom sendVerificationRequest via JMAP
      from: process.env.JMAP_FROM || process.env.JMAP_USERNAME || "noreply@example.com",
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        try {
          const { sendVerificationRequest } = await import("./auth-email");
          await sendVerificationRequest({
            identifier,
            url,
            provider: {
              from: process.env.JMAP_FROM || process.env.JMAP_USERNAME || "noreply@example.com",
            },
          });
        } catch (err) {
          console.error("[Auth] Failed to send verification email:", err);
          throw new Error("Failed to send verification email. Make sure JMAP is configured.");
        }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      await initializeAuth();

      if (account?.provider && account.provider !== "credentials") {
        const enabled = await isProviderEnabled(account.provider);
        if (!enabled) {
          return false;
        }
      }

      if (user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        if (dbUser?.role !== "admin") {
          return "/login?error=AccessDenied";
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.userId = user.id;
        token.clientId = (user as any).clientId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) ?? "user";
        session.user.clientId = (token.clientId as number | null) ?? null;
      }
      return session;
    },
  },
});

// ── Bearer token / API key helpers ──────────────────────────

export async function getBearerToken(): Promise<string | null> {
  const headersList = await headers();
  const authorization = headersList.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function verifyApiKey(token: string) {
  try {
    const hashedKey = createHash("sha256").update(token).digest("hex");
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        user: {
          select: { id: true, email: true, name: true, clientId: true },
        },
      },
    });

    if (!apiKey) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;
    if (apiKey.user.clientId !== null) return null;

    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch((err: any) => console.error("Failed to update API key lastUsedAt:", err));

    return {
      userId: apiKey.user.id,
      userEmail: apiKey.user.email,
      userName: apiKey.user.name,
      permissions: apiKey.permissions,
      apiKeyId: apiKey.id,
    };
  } catch (error) {
    console.error("Error verifying API key:", error);
    return null;
  }
}

// ── Primary auth helpers (used by API routes) ───────────────

export async function getAdminAuth(): Promise<{
  userId: string;
  userEmail: string | null;
  userName: string | null;
  permissions: string[];
  isPasswordAuth?: boolean;
  apiKeyId?: string;
} | null> {
  const bearerToken = await getBearerToken();
  if (bearerToken) {
    const apiKeyData = await verifyApiKey(bearerToken);
    if (apiKeyData) {
      return {
        userId: apiKeyData.userId,
        userEmail: apiKeyData.userEmail,
        userName: apiKeyData.userName,
        permissions: apiKeyData.permissions,
        apiKeyId: apiKeyData.apiKeyId,
      };
    }
    return null;
  }

  const session = await auth();
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      userName: session.user.name ?? null,
      permissions: ["*"],
    };
  }

  return null;
}

// ── Permission helpers ──────────────────────────────────────

export function hasPermission(authData: { permissions: string[] }, permission: string): boolean {
  if (authData.permissions.includes("*")) return true;
  if (authData.permissions.includes(permission)) return true;
  const [action, resource] = permission.split(":");
  if (action && resource) {
    if (authData.permissions.includes(`${action}:*`)) return true;
  }
  return false;
}

export function normalizeAdminPermissions(inputPermissions: string[]): string[] {
  const normalized = new Set<string>();
  for (const permission of inputPermissions) {
    switch (permission) {
      case "admin":
        normalized.add("*");
        break;
      case "read":
        normalized.add("read:*");
        break;
      case "write":
        normalized.add("write:*");
        break;
      case "delete":
        normalized.add("write:*");
        break;
      default:
        normalized.add(permission);
    }
  }
  return Array.from(normalized);
}

export function isValidAdminPermission(permission: string): boolean {
  return (
    permission === "*" ||
    ADMIN_PERMISSION_SCOPES.includes(permission as AdminPermissionScope)
  );
}

export function requirePermission(
  authData: { permissions: string[] } | null,
  permission: string
): { permissions: string[] } | Response {
  if (!authData) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!hasPermission(authData, permission)) {
    return new Response(
      JSON.stringify({
        error: `Forbidden - Missing permission: ${permission}`,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return authData;
}
