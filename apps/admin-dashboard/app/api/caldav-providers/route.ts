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

// GET /api/caldav-providers — list all CalDAV providers (passwords masked)
export async function GET() {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(authData, "read:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: read:settings" }, { status: 403 });
    }

    const providers = await prisma.calDavProvider.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ providers: providers.map(maskProvider) });
  } catch (error) {
    console.error("Error fetching CalDAV providers:", error);
    return NextResponse.json({ error: "Failed to fetch CalDAV providers" }, { status: 500 });
  }
}

// POST /api/caldav-providers — create a new CalDAV provider
export async function POST(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(authData, "write:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: write:settings" }, { status: 403 });
    }

    const body = await request.json();
    const { name, url, username, password, enabled, allowedCalendars } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!url?.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    if (!username?.trim()) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (!password?.trim()) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const provider = await prisma.calDavProvider.create({
      data: {
        name: name.trim(),
        url: url.trim(),
        username: username.trim(),
        password,
        enabled: enabled !== false,
        allowedCalendars: Array.isArray(allowedCalendars) ? allowedCalendars : [],
      },
    });

    return NextResponse.json({ provider: maskProvider(provider) }, { status: 201 });
  } catch (error) {
    console.error("Error creating CalDAV provider:", error);
    return NextResponse.json({ error: "Failed to create CalDAV provider" }, { status: 500 });
  }
}
