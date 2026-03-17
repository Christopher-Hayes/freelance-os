import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

/**
 * GET /api/auth/providers - Get enabled auth provider configurations
 * Public endpoint (used by login page to know which providers to show)
 */
export async function GET() {
  try {
    const configs = await prisma.authProviderConfig.findMany({
      orderBy: { provider: "asc" },
      select: {
        provider: true,
        enabled: true,
      },
    });

    // Ensure "credentials" always appears
    const hasCredentials = configs.some((c) => c.provider === "credentials");
    if (!hasCredentials) {
      configs.unshift({ provider: "credentials", enabled: true });
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
