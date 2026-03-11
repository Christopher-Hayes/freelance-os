import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// GET /api/settings - Get all settings or a specific setting by key
export async function GET(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, "read:settings")) {
			return NextResponse.json({ error: "Forbidden - Missing permission: read:settings" }, { status: 403 });
		}

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (key) {
      // Get a specific setting
      const setting = await prisma.setting.findUnique({
        where: { key },
      });

      if (!setting) {
        return NextResponse.json(
          { error: "Setting not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ key: setting.key, value: setting.value });
    }

    // Get all settings
    const settings = await prisma.setting.findMany({
      orderBy: { key: "asc" },
    });

    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json(settingsMap);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// PUT /api/settings - Update or create a setting
export async function PUT(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, "write:settings")) {
			return NextResponse.json({ error: "Forbidden - Missing permission: write:settings" }, { status: 403 });
		}

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "Key and value are required" },
        { status: 400 }
      );
    }

    // Validate key format (alphanumeric, dots, underscores, hyphens)
    const keyRegex = /^[a-zA-Z0-9._-]+$/;
    if (!keyRegex.test(key)) {
      return NextResponse.json(
        { error: 'Invalid key format. Use only alphanumeric characters, dots, underscores, and hyphens' },
        { status: 400 }
      );
    }

    // Validate value is a string
    if (typeof value !== 'string') {
      return NextResponse.json(
        { error: 'Value must be a string' },
        { status: 400 }
      );
    }

    // Upsert the setting
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error("Error updating setting:", error);
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}
