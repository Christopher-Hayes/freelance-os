import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import type { AiProvider } from "@freelance-os/types";

// Helper to mask sensitive values
const MASK_VALUE = "••••••••";

function maskIfPresent(value: string | null): string {
  return value ? MASK_VALUE : "";
}

// GET /api/settings/all - Get all settings with structured fields
// Sensitive fields (API keys, tokens) are masked to prevent exposure to client
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
      // Sensitive fields - masked to prevent client-side exposure
      rescuetimeKey: maskIfPresent(setting.rescuetimeKey),
      openaiKey: maskIfPresent(setting.openaiKey),
      googleApiKey: maskIfPresent(setting.googleApiKey),
      jmapToken: maskIfPresent(setting.jmapToken),
      
      // Non-sensitive fields - safe to expose
      aiProvider: setting.aiProvider || "openai",
      canReadMailbox: setting.canReadMailbox || false,
      jmapAllowedMailboxes: setting.jmapAllowedMailboxes || [],
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
      companyName: setting.companyName || "",
      freelancerName: setting.freelancerName || "",
      freelancerEmail: setting.freelancerEmail || "",
      address: setting.address || "",
      phone: setting.phone || "",
      website: setting.website || "",
      
      // Metadata to help client know which fields are set
      hasRescuetimeKey: !!setting.rescuetimeKey,
      hasOpenaiKey: !!setting.openaiKey,
      hasGoogleApiKey: !!setting.googleApiKey,
      hasJmapToken: !!setting.jmapToken,
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
// Ignores masked placeholder values to prevent overwriting actual credentials
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { 
      rescuetimeKey, 
      openaiKey, 
      googleApiKey, 
      aiProvider,
      canReadMailbox,
      jmapAllowedMailboxes,
      jmapToken, 
      jmapUsername, 
      jmapHostname,
      companyName,
      freelancerName,
      freelancerEmail,
      address,
      phone,
      website,
    } = body;

    // Validate AI provider if provided
    if (aiProvider !== undefined && !["openai", "gemini"].includes(aiProvider)) {
      return NextResponse.json(
        { error: "Invalid AI provider" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    // IMPORTANT: Ignore masked placeholder values to prevent overwriting actual credentials
    const updateData: any = {};
    
    // Only update sensitive fields if they're not the mask value and not empty
    if (rescuetimeKey !== undefined && rescuetimeKey !== MASK_VALUE) {
      updateData.rescuetimeKey = rescuetimeKey || null;
    }
    if (openaiKey !== undefined && openaiKey !== MASK_VALUE) {
      updateData.openaiKey = openaiKey || null;
    }
    if (googleApiKey !== undefined && googleApiKey !== MASK_VALUE) {
      updateData.googleApiKey = googleApiKey || null;
    }
    if (jmapToken !== undefined && jmapToken !== MASK_VALUE) {
      updateData.jmapToken = jmapToken || null;
    }
    
    // Non-sensitive fields can be updated normally
    if (aiProvider !== undefined) updateData.aiProvider = aiProvider as AiProvider;
    if (canReadMailbox !== undefined) updateData.canReadMailbox = canReadMailbox === "true" || canReadMailbox === true;
    if (jmapAllowedMailboxes !== undefined) {
      // Parse if it's a JSON string, otherwise use as-is
      updateData.jmapAllowedMailboxes = typeof jmapAllowedMailboxes === 'string' 
        ? JSON.parse(jmapAllowedMailboxes) 
        : (jmapAllowedMailboxes || []);
    }
    if (jmapUsername !== undefined) updateData.jmapUsername = jmapUsername || null;
    if (jmapHostname !== undefined) updateData.jmapHostname = jmapHostname || null;
    if (companyName !== undefined) updateData.companyName = companyName || null;
    if (freelancerName !== undefined) updateData.freelancerName = freelancerName || null;
    if (freelancerEmail !== undefined) updateData.freelancerEmail = freelancerEmail || null;
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (website !== undefined) updateData.website = website || null;

    // Upsert the settings
    const setting = await prisma.setting.upsert({
      where: { key: "main" },
      update: updateData,
      create: {
        key: "main",
        value: "",
        rescuetimeKey: rescuetimeKey && rescuetimeKey !== MASK_VALUE ? rescuetimeKey : null,
        openaiKey: openaiKey && openaiKey !== MASK_VALUE ? openaiKey : null,
        googleApiKey: googleApiKey && googleApiKey !== MASK_VALUE ? googleApiKey : null,
        aiProvider: (aiProvider as AiProvider) || "openai",
        canReadMailbox: canReadMailbox === "true" || canReadMailbox === true || false,
        jmapAllowedMailboxes: typeof jmapAllowedMailboxes === 'string' 
          ? JSON.parse(jmapAllowedMailboxes) 
          : (jmapAllowedMailboxes || []),
        jmapToken: jmapToken && jmapToken !== MASK_VALUE ? jmapToken : null,
        jmapUsername: jmapUsername || null,
        jmapHostname: jmapHostname || null,
        companyName: companyName || null,
        freelancerName: freelancerName || null,
        freelancerEmail: freelancerEmail || null,
        address: address || null,
        phone: phone || null,
        website: website || null,
      },
    });

    // Return masked values like GET does
    return NextResponse.json({
      rescuetimeKey: maskIfPresent(setting.rescuetimeKey),
      openaiKey: maskIfPresent(setting.openaiKey),
      googleApiKey: maskIfPresent(setting.googleApiKey),
      jmapToken: maskIfPresent(setting.jmapToken),
      aiProvider: setting.aiProvider || "openai",
      canReadMailbox: setting.canReadMailbox || false,
      jmapAllowedMailboxes: setting.jmapAllowedMailboxes || [],
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
      companyName: setting.companyName || "",
      freelancerName: setting.freelancerName || "",
      freelancerEmail: setting.freelancerEmail || "",
      address: setting.address || "",
      phone: setting.phone || "",
      website: setting.website || "",
      hasRescuetimeKey: !!setting.rescuetimeKey,
      hasOpenaiKey: !!setting.openaiKey,
      hasGoogleApiKey: !!setting.googleApiKey,
      hasJmapToken: !!setting.jmapToken,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
