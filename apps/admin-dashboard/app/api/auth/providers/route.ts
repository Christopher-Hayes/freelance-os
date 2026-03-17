import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

/**
 * GET /api/auth/providers - Get all auth provider configurations
 * Public endpoint (used by login page to know which providers to show)
 */
export async function GET() {
  try {
    const configs = await prisma.authProviderConfig.findMany({
      orderBy: { provider: "asc" },
      select: {
        id: true,
        provider: true,
        enabled: true,
        // Don't expose config (may contain secrets) to unauthenticated users
      },
    });

    // Ensure "credentials" always appears as enabled
    const hasCredentials = configs.some((c) => c.provider === "credentials");
    if (!hasCredentials) {
      configs.unshift({
        id: "default-credentials",
        provider: "credentials",
        enabled: true,
      });
    }

    return NextResponse.json(configs);
  } catch (error) {
    console.error("Error fetching auth providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch auth providers" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/providers - Update auth provider configuration
 * Admin only - enable/disable providers and update their config
 */
export async function PUT(request: Request) {
  const authData = await getAdminAuth();
  if (!authData) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(authData, "write:settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { provider, enabled, config } = body;

    if (!provider || typeof provider !== "string") {
      return NextResponse.json(
        { error: "Provider name is required" },
        { status: 400 }
      );
    }

    // Don't allow disabling credentials (it's the default)
    if (provider === "credentials" && enabled === false) {
      return NextResponse.json(
        { error: "Credentials provider cannot be disabled" },
        { status: 400 }
      );
    }

    const result = await prisma.authProviderConfig.upsert({
      where: { provider },
      update: {
        enabled: enabled ?? undefined,
        config: config !== undefined ? config : undefined,
      },
      create: {
        provider,
        enabled: enabled ?? false,
        config: config ?? null,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating auth provider:", error);
    return NextResponse.json(
      { error: "Failed to update auth provider" },
      { status: 500 }
    );
  }
}
