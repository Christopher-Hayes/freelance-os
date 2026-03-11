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
      webdavPassword: maskIfPresent(setting.webdavPassword),
      githubToken: maskIfPresent(setting.githubToken),
      gitlabToken: maskIfPresent(setting.gitlabToken),
      codebergToken: maskIfPresent(setting.codebergToken),
      
      // Non-sensitive fields - safe to expose
    aiProvider: setting.aiProvider || "openai",
    appTitleRenames: setting.appTitleRenames || [],
    hiddenAppClasses: setting.hiddenAppClasses || [],
      canReadMailbox: setting.canReadMailbox || false,
      jmapAllowedMailboxes: setting.jmapAllowedMailboxes || [],
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
      webdavUrl: setting.webdavUrl || "",
      webdavUsername: setting.webdavUsername || "",
      canReadCalendar: setting.canReadCalendar || false,
      webdavAllowedCalendars: setting.webdavAllowedCalendars || [],
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
      
      // Metadata to help client know which fields are set
      hasRescuetimeKey: !!setting.rescuetimeKey,
      hasOpenaiKey: !!setting.openaiKey,
      hasGoogleApiKey: !!setting.googleApiKey,
      hasJmapToken: !!setting.jmapToken,
      hasWebdavPassword: !!setting.webdavPassword,
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
    appTitleRenames,
    hiddenAppClasses,
      canReadMailbox,
      jmapAllowedMailboxes,
      jmapToken, 
      jmapUsername, 
      jmapHostname,
      webdavUrl,
      webdavUsername,
      webdavPassword,
      canReadCalendar,
      webdavAllowedCalendars,
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
    } = body;

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
    if (webdavUrl !== undefined) updateData.webdavUrl = webdavUrl || null;
    if (webdavUsername !== undefined) updateData.webdavUsername = webdavUsername || null;
    if (webdavPassword !== undefined && webdavPassword !== MASK_VALUE) {
      updateData.webdavPassword = webdavPassword || null;
    }
    if (canReadCalendar !== undefined) updateData.canReadCalendar = canReadCalendar === "true" || canReadCalendar === true;
    if (webdavAllowedCalendars !== undefined) {
      updateData.webdavAllowedCalendars = typeof webdavAllowedCalendars === 'string'
        ? JSON.parse(webdavAllowedCalendars)
        : (webdavAllowedCalendars || []);
    }
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
        appTitleRenames: normalizeAppTitleRenames(appTitleRenames),
  hiddenAppClasses: normalizeHiddenAppClasses(hiddenAppClasses),
        canReadMailbox: canReadMailbox === "true" || canReadMailbox === true || false,
        jmapAllowedMailboxes: typeof jmapAllowedMailboxes === 'string' 
          ? JSON.parse(jmapAllowedMailboxes) 
          : (jmapAllowedMailboxes || []),
        jmapToken: jmapToken && jmapToken !== MASK_VALUE ? jmapToken : null,
        jmapUsername: jmapUsername || null,
        jmapHostname: jmapHostname || null,
        webdavUrl: webdavUrl || null,
        webdavUsername: webdavUsername || null,
        webdavPassword: webdavPassword && webdavPassword !== MASK_VALUE ? webdavPassword : null,
        canReadCalendar: canReadCalendar === "true" || canReadCalendar === true || false,
        webdavAllowedCalendars: typeof webdavAllowedCalendars === 'string'
          ? JSON.parse(webdavAllowedCalendars)
          : (webdavAllowedCalendars || []),
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
      },
    });

    // Return masked values like GET does
    return NextResponse.json({
      rescuetimeKey: maskIfPresent(setting.rescuetimeKey),
      openaiKey: maskIfPresent(setting.openaiKey),
      googleApiKey: maskIfPresent(setting.googleApiKey),
      jmapToken: maskIfPresent(setting.jmapToken),
      webdavPassword: maskIfPresent(setting.webdavPassword),
      githubToken: maskIfPresent(setting.githubToken),
      gitlabToken: maskIfPresent(setting.gitlabToken),
      codebergToken: maskIfPresent(setting.codebergToken),
    aiProvider: setting.aiProvider || "openai",
    appTitleRenames: setting.appTitleRenames || [],
    hiddenAppClasses: setting.hiddenAppClasses || [],
      canReadMailbox: setting.canReadMailbox || false,
      jmapAllowedMailboxes: setting.jmapAllowedMailboxes || [],
      jmapUsername: setting.jmapUsername || "",
      jmapHostname: setting.jmapHostname || "",
      webdavUrl: setting.webdavUrl || "",
      webdavUsername: setting.webdavUsername || "",
      canReadCalendar: setting.canReadCalendar || false,
      webdavAllowedCalendars: setting.webdavAllowedCalendars || [],
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
      hasRescuetimeKey: !!setting.rescuetimeKey,
      hasOpenaiKey: !!setting.openaiKey,
      hasGoogleApiKey: !!setting.googleApiKey,
      hasJmapToken: !!setting.jmapToken,
      hasWebdavPassword: !!setting.webdavPassword,
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
