import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

type RouteContext = {
  params: Promise<{ appClass: string }>;
};

// GET /api/apps/[appClass] - Get a single app record
export async function GET(_request: NextRequest, context: RouteContext) {
  const { appClass } = await context.params;

  const app = await prisma.app.findUnique({
    where: { appClass },
  });

  if (!app) {
    return NextResponse.json({ app: null });
  }

  return NextResponse.json({ app });
}

// PUT /api/apps/[appClass] - Create or update an app record
export async function PUT(request: NextRequest, context: RouteContext) {
  const { appClass } = await context.params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (typeof body.displayName === "string") {
    data.displayName = body.displayName.trim() || null;
  } else if (body.displayName === null) {
    data.displayName = null;
  }

  if (typeof body.hidden === "boolean") {
    data.hidden = body.hidden;
  }

  if (typeof body.suggestedName === "string") {
    data.suggestedName = body.suggestedName.trim() || null;
  } else if (body.suggestedName === null) {
    data.suggestedName = null;
  }

  if (typeof body.suggestNameDismissed === "boolean") {
    data.suggestNameDismissed = body.suggestNameDismissed;
  }

  const app = await prisma.app.upsert({
    where: { appClass },
    create: {
      appClass,
      ...data,
    },
    update: data,
  });

  return NextResponse.json({ app });
}
