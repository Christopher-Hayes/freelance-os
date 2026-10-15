import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import type { AiProvider } from "@freelance-os/types";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// Helper to mask sensitive values
const MASK_VALUE = "••••••••";
const OPENAI_KEY_REGEX = /^(sk|rk)-/;

function maskIfPresent(value: string | null): string {
  return value ? MASK_VALUE : "";
}

function openaiModelFields(setting: any) {
  return {
    openaiModel: setting.openaiModel ?? null,
    openaiFastModel: setting.openaiFastModel ?? null,
    openaiInputPrice: setting.openaiInputPrice ?? null,
    openaiOutputPrice: setting.openaiOutputPrice ?? null,
    openaiFastInputPrice: setting.openaiFastInputPrice ?? null,
    openaiFastOutputPrice: setting.openaiFastOutputPrice ?? null,
  };
}

// Accepts a number or numeric string; empty/null clears; undefined = not provided.
// Returns NaN-free value or the string "invalid".
function parsePrice(value: unknown): number | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

function normalizeAppTitleRenames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function normalizeHiddenAppClasses(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  return [];
}

// GET /api/settings/all - Get all settings with structured fields
// Sensitive fields (API keys, tokens) are masked to prevent exposure to client
export async function GET() {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "read:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: read:settings" }, { status: 403 });
    }

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
      githubToken: maskIfPresent(setting.githubToken),
      gitlabToken: maskIfPresent(setting.gitlabToken),
      codebergToken: maskIfPresent(setting.codebergToken),
      
      // Non-sensitive fields - safe to expose
    aiProvider: setting.aiProvider || "openai",
      ...openaiModelFields(setting),
    appTitleRenames: setting.appTitleRenames || [],
    hiddenAppClasses: setting.hiddenAppClasses || [],
      canReadMailbox: setting.canReadMailbox || false,
      jmapAllowedMailboxes: setting.jmapAllowedMailboxes || [],
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
      canReadCalendar: setting.canReadCalendar || false,
      githubUsername: setting.githubUsername || "",
      gitlabUsername: setting.gitlabUsername || "",
      gitlabUrl: setting.gitlabUrl || "",
      codebergUsername: setting.codebergUsername || "",
      companyName: setting.companyName || "",
      freelancerName: setting.freelancerName || "",
      freelancerEmail: setting.freelancerEmail || "",
      address: setting.address || "",
      phone: setting.phone || "",
      website: setting.website || "",
  mcpEnabled: setting.mcpEnabled ?? true,
      codingStatsEnabled: (setting as any).codingStatsEnabled ?? false,
      
      // Metadata to help client know which fields are set
      hasRescuetimeKey: !!setting.rescuetimeKey,
      hasOpenaiKey: !!setting.openaiKey,
      hasGoogleApiKey: !!setting.googleApiKey,
      hasJmapToken: !!setting.jmapToken,
      hasGithubToken: !!setting.githubToken,
      hasGitlabToken: !!setting.gitlabToken,
      hasCodebergToken: !!setting.codebergToken,
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
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "write:settings")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: write:settings" }, { status: 403 });
    }

    const body = await request.json();
    const { 
      rescuetimeKey,
      openaiKey, 
      googleApiKey, 
    aiProvider,
    openaiModel,
    openaiFastModel,
    appTitleRenames,
    hiddenAppClasses,
      canReadMailbox,
      jmapAllowedMailboxes,
      jmapToken, 
      jmapUsername, 
      jmapHostname,
      canReadCalendar,
      githubToken,
      githubUsername,
      gitlabToken,
      gitlabUsername,
      gitlabUrl,
      codebergToken,
      codebergUsername,
      companyName,
      freelancerName,
      freelancerEmail,
      address,
      phone,
      website,
      mcpEnabled,
      codingStatsEnabled,
    } = body;

    const priceFields = {
      openaiInputPrice: parsePrice(body.openaiInputPrice),
      openaiOutputPrice: parsePrice(body.openaiOutputPrice),
      openaiFastInputPrice: parsePrice(body.openaiFastInputPrice),
      openaiFastOutputPrice: parsePrice(body.openaiFastOutputPrice),
    };
    for (const [name, value] of Object.entries(priceFields)) {
      if (value === "invalid") {
        return NextResponse.json(
          { error: `Invalid ${name}: must be a non-negative number` },
          { status: 400 }
        );
      }
    }
    for (const [name, value] of Object.entries({ openaiModel, openaiFastModel })) {
      if (value !== undefined && value !== null && typeof value !== "string") {
        return NextResponse.json({ error: `Invalid ${name}` }, { status: 400 });
      }
    }

    // Validate AI provider if provided
    if (aiProvider !== undefined && !["openai", "gemini"].includes(aiProvider)) {
      return NextResponse.json(
        { error: "Invalid AI provider" },
        { status: 400 }
      );
    }

    if (
      openaiKey !== undefined &&
      openaiKey !== MASK_VALUE &&
      openaiKey &&
      !OPENAI_KEY_REGEX.test(openaiKey)
    ) {
      return NextResponse.json(
        {
          error:
            "OpenAI API key looks invalid. It should start with 'sk-' or 'rk-'.",
        },
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
    if (githubToken !== undefined && githubToken !== MASK_VALUE) {
      updateData.githubToken = githubToken || null;
    }
    if (gitlabToken !== undefined && gitlabToken !== MASK_VALUE) {
      updateData.gitlabToken = gitlabToken || null;
    }
    if (codebergToken !== undefined && codebergToken !== MASK_VALUE) {
      updateData.codebergToken = codebergToken || null;
    }
    
    // Non-sensitive fields can be updated normally
    if (aiProvider !== undefined) updateData.aiProvider = aiProvider as AiProvider;
    if (openaiModel !== undefined) updateData.openaiModel = openaiModel?.trim() || null;
    if (openaiFastModel !== undefined) updateData.openaiFastModel = openaiFastModel?.trim() || null;
    for (const [name, value] of Object.entries(priceFields)) {
      if (value !== undefined) updateData[name] = value;
    }
    if (appTitleRenames !== undefined) {
      updateData.appTitleRenames = normalizeAppTitleRenames(appTitleRenames);
    }
    if (hiddenAppClasses !== undefined) {
      updateData.hiddenAppClasses = normalizeHiddenAppClasses(hiddenAppClasses);
    }
    if (canReadMailbox !== undefined) updateData.canReadMailbox = canReadMailbox === "true" || canReadMailbox === true;
    if (jmapAllowedMailboxes !== undefined) {
      // Parse if it's a JSON string, otherwise use as-is
      updateData.jmapAllowedMailboxes = typeof jmapAllowedMailboxes === 'string' 
        ? JSON.parse(jmapAllowedMailboxes) 
        : (jmapAllowedMailboxes || []);
    }
    if (jmapUsername !== undefined) updateData.jmapUsername = jmapUsername || null;
    if (jmapHostname !== undefined) updateData.jmapHostname = jmapHostname || null;
    if (canReadCalendar !== undefined) updateData.canReadCalendar = canReadCalendar === "true" || canReadCalendar === true;
    if (githubUsername !== undefined) updateData.githubUsername = githubUsername || null;
    if (gitlabUsername !== undefined) updateData.gitlabUsername = gitlabUsername || null;
    if (gitlabUrl !== undefined) updateData.gitlabUrl = gitlabUrl || null;
    if (codebergUsername !== undefined) updateData.codebergUsername = codebergUsername || null;
    if (companyName !== undefined) updateData.companyName = companyName || null;
    if (freelancerName !== undefined) updateData.freelancerName = freelancerName || null;
    if (freelancerEmail !== undefined) updateData.freelancerEmail = freelancerEmail || null;
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (website !== undefined) updateData.website = website || null;
    if (mcpEnabled !== undefined) updateData.mcpEnabled = mcpEnabled === "true" || mcpEnabled === true;
    if (codingStatsEnabled !== undefined) updateData.codingStatsEnabled = codingStatsEnabled === "true" || codingStatsEnabled === true;

    // Upsert the settings
    const setting = await prisma.setting.upsert({
      where: { key: "main" },
      update: updateData,
      create: ({
        key: "main",
        value: "",
        rescuetimeKey: rescuetimeKey && rescuetimeKey !== MASK_VALUE ? rescuetimeKey : null,
        openaiKey: openaiKey && openaiKey !== MASK_VALUE ? openaiKey : null,
        googleApiKey: googleApiKey && googleApiKey !== MASK_VALUE ? googleApiKey : null,
        aiProvider: (aiProvider as AiProvider) || "openai",
        openaiModel: openaiModel?.trim() || null,
        openaiFastModel: openaiFastModel?.trim() || null,
        ...Object.fromEntries(
          Object.entries(priceFields).map(([k, v]) => [k, v ?? null])
        ),
        appTitleRenames: normalizeAppTitleRenames(appTitleRenames),
  hiddenAppClasses: normalizeHiddenAppClasses(hiddenAppClasses),
        canReadMailbox: canReadMailbox === "true" || canReadMailbox === true || false,
        jmapAllowedMailboxes: typeof jmapAllowedMailboxes === 'string' 
          ? JSON.parse(jmapAllowedMailboxes) 
          : (jmapAllowedMailboxes || []),
        jmapToken: jmapToken && jmapToken !== MASK_VALUE ? jmapToken : null,
        jmapUsername: jmapUsername || null,
        jmapHostname: jmapHostname || null,
        canReadCalendar: canReadCalendar === "true" || canReadCalendar === true || false,
        githubToken: githubToken && githubToken !== MASK_VALUE ? githubToken : null,
        githubUsername: githubUsername || null,
        gitlabToken: gitlabToken && gitlabToken !== MASK_VALUE ? gitlabToken : null,
        gitlabUsername: gitlabUsername || null,
        gitlabUrl: gitlabUrl || null,
        codebergToken: codebergToken && codebergToken !== MASK_VALUE ? codebergToken : null,
        codebergUsername: codebergUsername || null,
        companyName: companyName || null,
        freelancerName: freelancerName || null,
        freelancerEmail: freelancerEmail || null,
        address: address || null,
        phone: phone || null,
        website: website || null,
        mcpEnabled: mcpEnabled === undefined ? true : mcpEnabled === "true" || mcpEnabled === true,
        codingStatsEnabled: codingStatsEnabled === "true" || codingStatsEnabled === true || false,
      }) as any,
    });

    // Return masked values like GET does
    return NextResponse.json({
      rescuetimeKey: maskIfPresent(setting.rescuetimeKey),
      openaiKey: maskIfPresent(setting.openaiKey),
      googleApiKey: maskIfPresent(setting.googleApiKey),
      jmapToken: maskIfPresent(setting.jmapToken),
      githubToken: maskIfPresent(setting.githubToken),
      gitlabToken: maskIfPresent(setting.gitlabToken),
      codebergToken: maskIfPresent(setting.codebergToken),
    aiProvider: setting.aiProvider || "openai",
      ...openaiModelFields(setting),
    appTitleRenames: setting.appTitleRenames || [],
    hiddenAppClasses: setting.hiddenAppClasses || [],
      canReadMailbox: setting.canReadMailbox || false,
      jmapAllowedMailboxes: setting.jmapAllowedMailboxes || [],
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
      canReadCalendar: setting.canReadCalendar || false,
      githubUsername: setting.githubUsername || "",
      gitlabUsername: setting.gitlabUsername || "",
      gitlabUrl: setting.gitlabUrl || "",
      codebergUsername: setting.codebergUsername || "",
      companyName: setting.companyName || "",
      freelancerName: setting.freelancerName || "",
      freelancerEmail: setting.freelancerEmail || "",
      address: setting.address || "",
      phone: setting.phone || "",
      website: setting.website || "",
  mcpEnabled: setting.mcpEnabled ?? true,
      codingStatsEnabled: (setting as any).codingStatsEnabled ?? false,
      hasRescuetimeKey: !!setting.rescuetimeKey,
      hasOpenaiKey: !!setting.openaiKey,
      hasGoogleApiKey: !!setting.googleApiKey,
      hasJmapToken: !!setting.jmapToken,
      hasGithubToken: !!setting.githubToken,
      hasGitlabToken: !!setting.gitlabToken,
      hasCodebergToken: !!setting.codebergToken,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
