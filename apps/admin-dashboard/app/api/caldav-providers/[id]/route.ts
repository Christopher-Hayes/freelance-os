import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

const MASK_VALUE = "••••••••";

function maskProvider(provider: {
  id: number;
  name: string;
  url: string;
  username: string;
  password: string;
  enabled: boolean;
  allowedCalendars: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: provider.id,
    name: provider.name,
    url: provider.url,
    username: provider.username,
    password: MASK_VALUE,
    hasPassword: !!provider.password,
    enabled: provider.enabled,
    allowedCalendars: provider.allowedCalendars,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

// PUT /api/caldav-providers/[id] — update a CalDAV provider
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(authData, "write:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: write:settings" }, { status: 403 });
    }

    const { id } = await params;
    const providerId = parseInt(id, 10);
    if (isNaN(providerId)) {
      return NextResponse.json({ error: "Invalid provider ID" }, { status: 400 });
    }

    const existing = await prisma.calDavProvider.findUnique({ where: { id: providerId } });
    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, url, username, password, enabled, allowedCalendars } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (url !== undefined) updateData.url = url.trim();
    if (username !== undefined) updateData.username = username.trim();
    if (password !== undefined && password !== MASK_VALUE) {
      updateData.password = password;
    }
    if (enabled !== undefined) updateData.enabled = enabled === true || enabled === "true";
    if (allowedCalendars !== undefined) {
      updateData.allowedCalendars = Array.isArray(allowedCalendars) ? allowedCalendars : [];
    }

    const provider = await prisma.calDavProvider.update({
      where: { id: providerId },
      data: updateData,
    });

    return NextResponse.json({ provider: maskProvider(provider) });
  } catch (error) {
    console.error("Error updating CalDAV provider:", error);
    return NextResponse.json({ error: "Failed to update CalDAV provider" }, { status: 500 });
  }
}

// DELETE /api/caldav-providers/[id] — delete a CalDAV provider
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(authData, "write:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: write:settings" }, { status: 403 });
    }

    const { id } = await params;
    const providerId = parseInt(id, 10);
    if (isNaN(providerId)) {
      return NextResponse.json({ error: "Invalid provider ID" }, { status: 400 });
    }

    await prisma.calDavProvider.delete({ where: { id: providerId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CalDAV provider:", error);
    return NextResponse.json({ error: "Failed to delete CalDAV provider" }, { status: 500 });
  }
}
