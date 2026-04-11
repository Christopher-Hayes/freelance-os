import { NextResponse } from "next/server";
import { getAdminAuth, hasPermission } from "@/lib/auth";
import {
  getCachedCodingStats,
  regenerateCodingStatsCache,
} from "@/lib/coding-stats";
import { prisma } from "@freelance-os/database";

/**
 * GET /api/coding-stats/json
 * Returns the raw JSON data used to generate the coding stats card.
 * Requires admin auth.
 */
export async function GET() {
  const authData = await getAdminAuth();
  if (!authData) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(authData, "read:settings")) {
    return NextResponse.json(
      { error: "Forbidden - Missing permission: read:settings" },
      { status: 403 }
    );
  }

  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });
  const s = settings as any;

  if (!s?.codingStatsEnabled) {
    return NextResponse.json(
      {
        enabled: false,
        message: "Coding stats card is not enabled. Enable it in Settings.",
      },
      { status: 200 }
    );
  }

  const stats = await getCachedCodingStats();

  return NextResponse.json({
    enabled: true,
    cachedAt: s.codingStatsCachedAt?.toISOString() ?? null,
    stats,
  });
}

/**
 * POST /api/coding-stats/json
 * Force regenerate the coding stats cache.
 * Requires admin auth with write:settings.
 */
export async function POST() {
  const authData = await getAdminAuth();
  if (!authData) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(authData, "write:settings")) {
    return NextResponse.json(
      { error: "Forbidden - Missing permission: write:settings" },
      { status: 403 }
    );
  }

  const settings2 = await prisma.setting.findUnique({
    where: { key: "main" },
  });
  const s2 = settings2 as any;

  if (!s2?.codingStatsEnabled) {
    return NextResponse.json(
      {
        error:
          "Coding stats card is not enabled. Enable it in Settings first.",
      },
      { status: 400 }
    );
  }

  const stats = await regenerateCodingStatsCache();

  return NextResponse.json({
    success: true,
    message: "Coding stats cache regenerated successfully",
    stats,
  });
}
