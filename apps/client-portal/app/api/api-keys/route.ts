import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { randomBytes, createHash } from "crypto";
import { getClientAuth } from "@/lib/auth";

export async function GET() {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch API keys for the current user only
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: authData.userId,
      },
      select: {
        id: true,
        name: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
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
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, permissions, expiresAt } = await request.json();

    // Validate inputs
    if (!name || !permissions) {
      return NextResponse.json(
        { error: "Name and permissions are required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { error: "At least one permission is required" },
        { status: 400 }
      );
    }

    // Generate a secure random API key
    const rawKey = randomBytes(32).toString("hex");
    
    // Hash the key for storage
    const hashedKey = createHash("sha256").update(rawKey).digest("hex");

    // Create the API key record
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key: hashedKey,
        userId: authData.userId,
        clientId: authData.clientId || null, // Link to client
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Return the raw key ONLY on creation
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
