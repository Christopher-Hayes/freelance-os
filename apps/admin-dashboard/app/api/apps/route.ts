import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

// GET /api/apps - List all app records (optionally filter by hidden)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const hidden = searchParams.get("hidden");

  const where: Record<string, unknown> = {};
  if (hidden === "true") where.hidden = true;
  if (hidden === "false") where.hidden = false;

  const apps = await prisma.app.findMany({
    where,
    orderBy: { appClass: "asc" },
  });

  return NextResponse.json({ apps });
}
