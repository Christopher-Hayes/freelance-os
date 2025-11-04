import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import type { AiProvider } from "@freelance-os/types";

// GET /api/settings/all - Get all settings with structured fields
export async function GET() {
  try {
    // Try to find the main settings record (we'll use key 'main' for the single settings row)
    let setting = await prisma.setting.findUnique({
      where: { key: "main" },
    });

    // If no settings exist yet, create a default one
    if (!setting) {
      setting = await prisma.setting.create({
        data: {
          key: "main",
          value: "",
          aiProvider: "openai",
        },
      });
    }

    return NextResponse.json({
      rescuetimeKey: setting.rescuetimeKey || "",
      openaiKey: setting.openaiKey || "",
      googleApiKey: setting.googleApiKey || "",
      aiProvider: setting.aiProvider || "openai",
      jmapToken: setting.jmapToken || "",
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// PUT /api/settings/all - Update settings (partial updates supported)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { rescuetimeKey, openaiKey, googleApiKey, aiProvider, jmapToken, jmapUsername, jmapHostname } = body;

    // Validate AI provider if provided
    if (aiProvider !== undefined && !["openai", "gemini"].includes(aiProvider)) {
      return NextResponse.json(
        { error: "Invalid AI provider" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updateData: any = {};
    if (rescuetimeKey !== undefined) updateData.rescuetimeKey = rescuetimeKey || null;
    if (openaiKey !== undefined) updateData.openaiKey = openaiKey || null;
    if (googleApiKey !== undefined) updateData.googleApiKey = googleApiKey || null;
    if (aiProvider !== undefined) updateData.aiProvider = aiProvider as AiProvider;
    if (jmapToken !== undefined) updateData.jmapToken = jmapToken || null;
    if (jmapUsername !== undefined) updateData.jmapUsername = jmapUsername || null;
    if (jmapHostname !== undefined) updateData.jmapHostname = jmapHostname || null;

    // Upsert the settings
    const setting = await prisma.setting.upsert({
      where: { key: "main" },
      update: updateData,
      create: {
        key: "main",
        value: "",
        rescuetimeKey: rescuetimeKey || null,
        openaiKey: openaiKey || null,
        googleApiKey: googleApiKey || null,
        aiProvider: (aiProvider as AiProvider) || "openai",
        jmapToken: jmapToken || null,
        jmapUsername: jmapUsername || null,
        jmapHostname: jmapHostname || null,
      },
    });

    return NextResponse.json({
      rescuetimeKey: setting.rescuetimeKey || "",
      openaiKey: setting.openaiKey || "",
      googleApiKey: setting.googleApiKey || "",
      aiProvider: setting.aiProvider || "openai",
      jmapToken: setting.jmapToken || "",
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
