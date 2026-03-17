import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "@freelance-os/database";
import { sendVerificationRequest } from "./jmap-provider";
import { headers } from "next/headers";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";

// Wrap the Prisma adapter to handle missing session gracefully
const baseAdapter = PrismaAdapter(prisma);
const customAdapter: Adapter = {
  ...baseAdapter,
  deleteSession: async (sessionToken: string) => {
    try {
      const result = await baseAdapter.deleteSession!(sessionToken);
      return result as any;
    } catch (error: any) {
      if (error?.code === "P2025") {
        console.log("[Auth] Session not found for deletion (this is normal during login)");
        return undefined as any;
      }
      throw error;
    }
  },
};

/**
 * Check if a specific provider is enabled in the database
 */
async function isProviderEnabled(provider: string): Promise<boolean> {
  const config = await prisma.authProviderConfig.findUnique({
    where: { provider },
  });
  if (provider === "credentials") return config?.enabled ?? true;
  return config?.enabled ?? false;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customAdapter,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
      sendVerificationRequest,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Gate non-credentials providers based on DB config
      if (account?.provider && account.provider !== "credentials") {
        const enabled = await isProviderEnabled(account.provider);
        if (!enabled) {
          return false;
        }
      }

      // Client portal: only allow non-admin users (users with a clientId)
      if (user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, clientId: true },
        });

        // Admin users should use the admin dashboard
        if (dbUser?.role === "admin") {
          return "/auth/error?error=UseAdminDashboard";
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role ?? "user";
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

/**
 * Verify API key from Authorization header and return associated client/user info
 */
export async function verifyApiKey(token: string) {
  try {
    const hashedKey = createHash("sha256").update(token).digest("hex");
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        user: {
          select: { id: true, email: true, clientId: true },
        },
        client: {
          select: { id: true, name: true },
        },
      },
    });

    if (!apiKey) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch((err: any) => console.error("Failed to update API key lastUsedAt:", err));

    const clientId = apiKey.clientId ?? apiKey.user.clientId;

    return {
      userId: apiKey.user.id,
      userEmail: apiKey.user.email,
      clientId,
      permissions: apiKey.permissions,
      apiKeyId: apiKey.id,
    };
  } catch (error) {
    console.error("Error verifying API key:", error);
    return null;
  }
}

/**
 * Extract bearer token from Authorization header
 */
export async function getBearerToken(): Promise<string | null> {
  const headersList = await headers();
  const authorization = headersList.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Get authenticated client ID from either bearer token or session
 * Primary authentication helper for client portal API routes
 */
export async function getClientAuth(): Promise<{
  clientId: number;
  userId: string;
  userEmail: string | null;
  apiKeyId?: string;
} | null> {
  // First, check for bearer token authentication
  const bearerToken = await getBearerToken();
  if (bearerToken) {
    const apiKeyData = await verifyApiKey(bearerToken);
    if (!apiKeyData || !apiKeyData.clientId) return null;
    return {
      clientId: apiKeyData.clientId,
      userId: apiKeyData.userId,
      userEmail: apiKeyData.userEmail,
      apiKeyId: apiKeyData.apiKeyId,
    };
  }

  // Fall back to session-based authentication
  const session = await auth();
  if (!session?.user?.clientId || !session.user.id) return null;

  return {
    clientId: session.user.clientId,
    userId: session.user.id,
    userEmail: session.user.email ?? null,
  };
}
