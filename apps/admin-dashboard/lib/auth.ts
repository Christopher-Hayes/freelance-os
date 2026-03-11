import { headers, cookies } from "next/headers";
import { prisma } from "@freelance-os/database";
import { createHash } from "crypto";
import { sessions } from "./sessions";

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

/**
 * Verify session token from cookie
 */
async function verifySessionToken(token: string): Promise<boolean> {
  const session = sessions.get(token);
  if (!session) {
    return false;
  }

  const now = Date.now();
  if (session.expiresAt < now) {
    sessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Get session from cookie
 */
async function getSessionFromCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('admin-session')?.value;
  
  if (!sessionToken) {
    return false;
  }

  return verifySessionToken(sessionToken);
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
 * Verify API key from Authorization header and return associated user/permissions
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
            name: true,
            clientId: true,
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

    // For admin dashboard, we only allow keys from users without clientId (admin users)
    // or keys that don't have a clientId restriction
    if (apiKey.user.clientId !== null) {
      return null; // This is a client portal key, not allowed for admin access
    }

    // Update last used timestamp (don't await to avoid blocking)
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => console.error("Failed to update API key lastUsedAt:", err));

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

/**
 * Verify admin password from Authorization header
 * Format: "Authorization: Bearer admin:password"
 */
export async function verifyAdminPassword(token: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    console.warn("ADMIN_PASSWORD not set in environment variables");
    return false;
  }

  // Check if token matches the admin password
  // You can also support "admin:password" format
  if (token === adminPassword) {
    return true;
  }

  // Support "admin:password" format
  const match = token.match(/^admin:(.+)$/);
  if (match && match[1] === adminPassword) {
    return true;
  }

  return false;
}

/**
 * Get authenticated admin context from either bearer token (API key or password) or session
 * This is the primary authentication helper for admin dashboard API routes
 * 
 * @returns Object with user info and permissions, or null if not authenticated
 */
export async function getAdminAuth(): Promise<{
  userId: string;
  userEmail: string | null;
  userName: string | null;
  permissions: string[];
  isPasswordAuth?: boolean;
  apiKeyId?: string;
} | null> {
  // Check for bearer token authentication first
  const bearerToken = await getBearerToken();
  if (bearerToken) {
    // First, try password authentication
    if (await verifyAdminPassword(bearerToken)) {
      return {
        userId: "admin",
        userEmail: null,
        userName: "Admin",
        permissions: ["*"], // Full access with password
        isPasswordAuth: true,
      };
    }

    // Then try API key authentication
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

    // Invalid token
    return null;
  }

  // Check for session-based authentication (cookie)
  const hasValidSession = await getSessionFromCookie();
  if (hasValidSession) {
    return {
      userId: "admin",
      userEmail: null,
      userName: "Admin",
      permissions: ["*"], // Full access with session
      isPasswordAuth: true,
    };
  }

  // No valid authentication found
  return null;
}

/**
 * Check if the authenticated user has a specific permission
 */
export function hasPermission(authData: { permissions: string[] }, permission: string): boolean {
  // Wildcard "*" grants all permissions
  if (authData.permissions.includes("*")) {
    return true;
  }

  // Check for exact permission
  if (authData.permissions.includes(permission)) {
    return true;
  }

  // Check for wildcard permission (e.g., "write:*" matches "write:clients")
  const [action, resource] = permission.split(":");
  if (action && resource) {
    const wildcardPermission = `${action}:*`;
    if (authData.permissions.includes(wildcardPermission)) {
      return true;
    }
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
        // Delete operations are covered by write scopes in the current app.
        normalized.add("write:*");
        break;
      default:
        normalized.add(permission);
    }
  }

  return Array.from(normalized);
}

export function isValidAdminPermission(permission: string): boolean {
  return permission === "*" || ADMIN_PERMISSION_SCOPES.includes(permission as AdminPermissionScope);
}

/**
 * Require specific permission or return 403 error
 */
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
      JSON.stringify({ error: `Forbidden - Missing permission: ${permission}` }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return authData;
}
