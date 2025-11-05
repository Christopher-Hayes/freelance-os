import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { randomBytes, createHash } from "crypto";
import { getAdminAuth } from "@/lib/auth";

export async function GET() {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all API keys
    // Note: Admin dashboard shows all keys since it's a single-admin system
    // If you need multi-admin support, filter by authData.userId here
    const apiKeys = await prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(apiKeys);
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, permissions, expiresAt, userId } = await request.json();

    // Validate inputs
    if (!name || !permissions) {
      return NextResponse.json(
        { error: "Name and permissions are required" },
        { status: 400 }
      );
    }

    // Validate name length
    if (name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less" },
        { status: 400 }
      );
    }

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { error: "At least one permission is required" },
        { status: 400 }
      );
    }

    // Validate permission values
    const validPermissions = ['read', 'write', 'delete', 'admin'];
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        { error: `Invalid permissions: ${invalidPermissions.join(', ')}. Valid permissions are: ${validPermissions.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate expiresAt if provided
    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      if (isNaN(expiryDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid expiry date format" },
          { status: 400 }
        );
      }
      if (expiryDate < new Date()) {
        return NextResponse.json(
          { error: "Expiry date must be in the future" },
          { status: 400 }
        );
      }
    }

    // API keys require a userId in the database
    // Admin session auth doesn't have a real userId (it's just "admin")
    // So we create/use a system user for API keys
    let actualUserId = userId;
    if (!actualUserId) {
      // Check if a system admin user exists
      let systemUser = await prisma.user.findFirst({
        where: { email: "admin@system.local" },
      });

      // Create system user if it doesn't exist
      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            email: "admin@system.local",
            name: "System Admin",
          },
        });
      }

      actualUserId = systemUser.id;
    }

    // Generate a secure random API key
    const rawKey = randomBytes(32).toString("hex");
    
    // Hash the key for storage (we never store the raw key)
    const hashedKey = createHash("sha256").update(rawKey).digest("hex");

    // Create the API key record
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key: hashedKey,
        userId: actualUserId,
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return the raw key ONLY on creation (this is the only time the user will see it)
    return NextResponse.json({
      id: apiKey.id,
      key: rawKey, // Only returned once!
      name: apiKey.name,
      permissions: apiKey.permissions,
      createdAt: apiKey.createdAt,
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
