import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@freelance-os/database";
import { sendVerificationRequest } from "./jmap-provider";
import { headers } from "next/headers";
import { createHash } from "crypto";

// Wrap the Prisma adapter to handle missing session gracefully
const baseAdapter = PrismaAdapter(prisma);
const customAdapter: Adapter = {
  ...baseAdapter,
  deleteSession: async (sessionToken: string) => {
    try {
      const result = await baseAdapter.deleteSession!(sessionToken);
      return result as any;
    } catch (error: any) {
      // Ignore "record not found" errors during session deletion
      // Prisma error code P2025 = "Record to delete does not exist"
      if (error?.code === 'P2025') {
        console.log('[Auth] Session not found for deletion (this is normal during login)');
        return undefined as any;
      }
      throw error;
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customAdapter,
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: process.env.JMAP_FROM || process.env.JMAP_USERNAME || "noreply@example.com",
      maxAge: 24 * 60 * 60, // 24 hours for magic link validity
      sendVerificationRequest,
    },
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update session every 24 hours (extends expiry)
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify-request",
  },
  callbacks: {
    async session({ session, user }) {
      // Add clientId to session for easy access in components and API routes
      if (session.user) {
        session.user.id = user.id;
        
        // Fetch the user's clientId from the database
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { clientId: true },
        });
        
        session.user.clientId = dbUser?.clientId ?? null;
      }
      return session;
    },
  },
});

/**
 * Verify API key from Authorization header and return associated client/user info
 * For use in API routes that support bearer token authentication
 */
export async function verifyApiKey(token: string) {
  try {
    // Hash the incoming token to match what's stored in the database
    // API keys are stored as SHA-256 hashes for security
    const hashedKey = createHash("sha256").update(token).digest("hex");
    
    // Find the API key in the database
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            clientId: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!apiKey) {
      return null;
    }

    // Check if the key is expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp (don't await to avoid blocking)
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => console.error("Failed to update API key lastUsedAt:", err));

    // Return client ID (either from the key's clientId or user's clientId)
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
  
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Get authenticated client ID from either bearer token or session
 * This is the primary authentication helper for client portal API routes
 * 
 * @returns Object with clientId and userId, or null if not authenticated
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
    if (!apiKeyData || !apiKeyData.clientId) {
      return null;
    }
    return {
      clientId: apiKeyData.clientId,
      userId: apiKeyData.userId,
      userEmail: apiKeyData.userEmail,
      apiKeyId: apiKeyData.apiKeyId,
    };
  }

  // Fall back to session-based authentication
  const session = await auth();
  if (!session?.user?.clientId || !session.user.id) {
    return null;
  }

  return {
    clientId: session.user.clientId,
    userId: session.user.id,
    userEmail: session.user.email ?? null,
  };
}
