"use server";

import { prisma } from "@freelance-os/database";
import { Temporal } from "@js-temporal/polyfill";
import { generateObject } from "ai";
import { z } from "zod";
import { getAiModel, isAiConfigured } from "@/lib/ai-provider";

interface RescueTimeResponse {
  notes: string;
  row_headers: string[];
  rows: (string | number)[][];
}

async function getHiddenAppClasses(): Promise<Set<string>> {
  const hiddenApps = await prisma.app.findMany({
    where: { hidden: true },
    select: { appClass: true },
  });

  return new Set(hiddenApps.map((app) => app.appClass.toLowerCase()));
}

/**
 * Shared: fetch and transform RescueTime API data into session-like objects.
 */
async function fetchRescueTimeSessions(date: string) {
  // Get RescueTime API key from settings
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  const apiKey = settings?.rescuetimeKey || settings?.value || null;

  if (!apiKey) {
    throw new Error("RescueTime API key not configured. Please add it in Settings.");
  }

  // Build RescueTime API URL
  // We want document-level data (shows individual files/pages) with 5-minute granularity
  const rescueTimeUrl = new URL("https://www.rescuetime.com/anapi/data");
  rescueTimeUrl.searchParams.set("key", apiKey);
  rescueTimeUrl.searchParams.set("perspective", "interval");
  rescueTimeUrl.searchParams.set("restrict_kind", "document");
  rescueTimeUrl.searchParams.set("interval", "minute");
  rescueTimeUrl.searchParams.set("restrict_begin", date);
  rescueTimeUrl.searchParams.set("restrict_end", date);
  rescueTimeUrl.searchParams.set("format", "json");

  console.log("Fetching from RescueTime:", rescueTimeUrl.toString().replace(apiKey, "***"));

  const response = await fetch(rescueTimeUrl.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error("RescueTime API error:", response.status, errorText);
    throw new Error(`RescueTime API error: ${response.status}`);
  }

  const data: RescueTimeResponse = await response.json();

  console.log("RescueTime API response headers:", data.row_headers);
  console.log("Sample row (first):", data.rows[0]);

  if (!data.rows || data.rows.length === 0) {
    return [];
  }

  return data.rows.map((row) => {
    const dateTime = row[0] as string;
    const durationSeconds = row[1] as number;
    const activity = row[3] as string;
    const document = row[4] as string;
    const category = row[5] as string;
    const windowTitle = document && document !== "No Details" ? document : category;

    // RescueTime returns timestamps in the user's local timezone (no TZ info).
    // Interpret them in the server's local timezone so they convert to the
    // correct UTC instants for storage.
    const localTz = Temporal.Now.timeZoneId();
    const startInstant = Temporal.PlainDateTime.from(dateTime).toZonedDateTime(localTz).toInstant();
    const endInstant = startInstant.add({ seconds: durationSeconds });

    return {
      startTime: new Date(startInstant.epochMilliseconds),
      endTime: new Date(endInstant.epochMilliseconds),
      appClass: activity,
      windowTitle,
      durationSeconds,
    };
  });
}

/**
 * Import activity data from RescueTime API
 */
export async function importRescueTimeData(date: string) {
  if (!date) {
    throw new Error("Date parameter is required (YYYY-MM-DD)");
  }

  const sessions = await fetchRescueTimeSessions(date);

  if (sessions.length === 0) {
    return {
      message: "No activity data found in RescueTime for this date",
      sessionsImported: 0,
    };
  }

  // Check if we already have data for this date to avoid duplicates
  const plainDate = Temporal.PlainDate.from(date);
  const localTz = Temporal.Now.timeZoneId();
  const dayStart = new Date(plainDate.toZonedDateTime(localTz).toInstant().epochMilliseconds);
  const dayEnd = new Date(
    plainDate.toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant().epochMilliseconds
  );

  const existingCount = await prisma.activitySession.count({
    where: {
      startTime: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
  });

  if (existingCount > 0) {
    return {
      message: `Already have ${existingCount} activity sessions for this date. Delete existing sessions first if you want to re-import.`,
      sessionsImported: 0,
    };
  }

  // Bulk insert sessions
  await prisma.activitySession.createMany({
    data: sessions,
    skipDuplicates: true,
  });

  console.log(`Imported ${sessions.length} activity sessions from RescueTime for ${date}`);

  return {
    message: `Successfully imported ${sessions.length} activity sessions from RescueTime`,
    sessionsImported: sessions.length,
  };
}

/**
 * Get the most used app for a date range
 * @param startDate Temporal.PlainDate for the start of the range
 * @param endDate Temporal.PlainDate for the end of the range (inclusive)
 */
export async function getMostUsedApp(startDate: Temporal.PlainDate, endDate: Temporal.PlainDate, timeZone: string = Temporal.Now.timeZoneId()) {
  // Convert PlainDate to local-timezone Instant at start/end of day
  const startInstant = startDate.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('00:00:00') }).toInstant();
  const endInstant = endDate.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant();
  
  const hiddenAppClasses = await getHiddenAppClasses();

  const sessions = await prisma.activitySession.findMany({
    where: {
      startTime: {
        gte: new Date(startInstant.epochMilliseconds),
        lte: new Date(endInstant.epochMilliseconds),
      },
    },
  });

  if (sessions.length === 0) {
    return null;
  }

  const visibleSessions = sessions.filter(
    (session) => !hiddenAppClasses.has((session.appClass || 'Unknown').toLowerCase())
  );

  if (visibleSessions.length === 0) {
    return null;
  }

  // Group by app and sum duration
  const appCounts: Record<string, number> = {};
  visibleSessions.forEach((session) => {
    const app = session.appClass || 'Unknown';
    appCounts[app] = (appCounts[app] || 0) + session.durationSeconds;
  });

  // Find the app with most time
  const topApp = Object.entries(appCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (!topApp) {
    return null;
  }

  return {
    appClass: topApp[0],
    hours: parseFloat((topApp[1] / 3600).toFixed(1)),
  };
}

/**
 * Get the project with most time spent in a date range
 * @param startDate Temporal.PlainDate for the start of the range
 * @param endDate Temporal.PlainDate for the end of the range (inclusive)
 */
export async function getTopProject(startDate: Temporal.PlainDate, endDate: Temporal.PlainDate, timeZone: string = Temporal.Now.timeZoneId()) {
  // Convert PlainDate to local-timezone Instant at start/end of day
  const startInstant = startDate.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('00:00:00') }).toInstant();
  const endInstant = endDate.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant();
  
  const projectTimes = await prisma.timeEntry.groupBy({
    by: ['projectId'],
    where: {
      startTime: {
        gte: new Date(startInstant.epochMilliseconds),
        lte: new Date(endInstant.epochMilliseconds),
      },
    },
    _sum: {
      durationMinutes: true,
    },
    orderBy: {
      _sum: {
        durationMinutes: 'desc',
      },
    },
    take: 1,
  });

  const firstProject = projectTimes[0];
  if (!firstProject || !firstProject._sum.durationMinutes) {
    return null;
  }

  const topProject = await prisma.project.findUnique({
    where: { id: firstProject.projectId },
    select: { name: true },
  });

  if (!topProject) {
    return null;
  }

  return {
    projectName: topProject.name,
    hours: parseFloat((firstProject._sum.durationMinutes / 60).toFixed(1)),
  };
}

/**
 * Get total hours for time entries in a date range
 * @param startDate Temporal.PlainDate for the start of the range
 * @param endDate Temporal.PlainDate for the end of the range (inclusive)
 */
export async function getHoursInRange(startDate: Temporal.PlainDate, endDate: Temporal.PlainDate, timeZone: string = Temporal.Now.timeZoneId()) {
  // Convert PlainDate to local-timezone Instant at start/end of day
  const startInstant = startDate.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('00:00:00') }).toInstant();
  const endInstant = endDate.toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant();
  
  const entries = await prisma.timeEntry.aggregate({
    where: {
      startTime: {
        gte: new Date(startInstant.epochMilliseconds),
        lte: new Date(endInstant.epochMilliseconds),
      },
    },
    _sum: {
      durationMinutes: true,
    },
  });

  if (!entries._sum.durationMinutes) {
    return 0;
  }

  return parseFloat((entries._sum.durationMinutes / 60).toFixed(1));
}

/**
 * Merge RescueTime app activity data into existing activity sessions for a date.
 * Uses AI to intelligently deduplicate and decide which RT sessions to add.
 */
export async function mergeRescueTimeAppActivity(date: string) {
  if (!date) {
    throw new Error("Date parameter is required (YYYY-MM-DD)");
  }

  if (!(await isAiConfigured())) {
    throw new Error(
      "AI is not configured. Merging requires AI to intelligently deduplicate data. Please configure an AI provider in Settings."
    );
  }

  const rtSessions = await fetchRescueTimeSessions(date);

  if (rtSessions.length === 0) {
    return {
      message: "No activity data found in RescueTime for this date",
      sessionsMerged: 0,
    };
  }

  // Fetch existing activity sessions for the day
  const plainDate = Temporal.PlainDate.from(date);
  const localTz = Temporal.Now.timeZoneId();
  const dayStart = new Date(plainDate.toZonedDateTime(localTz).toInstant().epochMilliseconds);
  const dayEnd = new Date(
    plainDate
      .toZonedDateTime({
        timeZone: localTz,
        plainTime: Temporal.PlainTime.from("23:59:59.999"),
      })
      .toInstant().epochMilliseconds
  );

  const existingSessions = await prisma.activitySession.findMany({
    where: {
      startTime: { gte: dayStart, lte: dayEnd },
    },
    orderBy: { startTime: "asc" },
  });

  // Summarise existing sessions for the AI (compact representation)
  const existingSummary = existingSessions.map((s) => ({
    start: s.startTime.toISOString(),
    end: s.endTime.toISOString(),
    app: s.appClass,
    title: s.windowTitle,
    dur: s.durationSeconds,
  }));

  // Summarise incoming RT sessions
  const rtSummary = rtSessions.map((s, i) => ({
    idx: i,
    start: s.startTime.toISOString(),
    end: s.endTime.toISOString(),
    app: s.appClass,
    title: s.windowTitle,
    dur: s.durationSeconds,
  }));

  const aiModel = await getAiModel();

  const mergeSchema = z.object({
    sessionsToAdd: z
      .array(z.number())
      .describe(
        "Array of RescueTime session indices (idx) that should be ADDED because they represent genuinely new activity not already covered by existing sessions"
      ),
    reasoning: z
      .string()
      .describe("Brief summary of the merge decision"),
  });

  const { object: mergeDecision } = await generateObject({
    model: aiModel,
    schema: mergeSchema,
    prompt: `You are merging RescueTime activity data into existing app activity sessions for ${date}.

EXISTING activity sessions (${existingSessions.length} total):
${JSON.stringify(existingSummary, null, 2)}

INCOMING RescueTime sessions (${rtSessions.length} total):
${JSON.stringify(rtSummary, null, 2)}

Rules:
- A RescueTime session is a DUPLICATE if an existing session covers roughly the same time window (within a few minutes) for the same app.
- A RescueTime session is NEW if it covers a time period or app not represented in existing sessions.
- When in doubt, include the session (better to have slightly redundant data than miss activity).
- Return the "idx" values of RT sessions that should be added.

Return the indices of RescueTime sessions to ADD (not duplicates of existing data).`,
  });

  const indicesToAdd = new Set(mergeDecision.sessionsToAdd);
  const sessionsToInsert = rtSessions.filter((_, i) => indicesToAdd.has(i));

  if (sessionsToInsert.length === 0) {
    return {
      message: `All ${rtSessions.length} RescueTime sessions already covered by existing data. Nothing to merge.`,
      sessionsMerged: 0,
      reasoning: mergeDecision.reasoning,
    };
  }

  await prisma.activitySession.createMany({
    data: sessionsToInsert,
    skipDuplicates: true,
  });

  console.log(
    `Merged ${sessionsToInsert.length} new activity sessions from RescueTime for ${date} (${rtSessions.length - sessionsToInsert.length} duplicates skipped)`
  );

  return {
    message: `Merged ${sessionsToInsert.length} new session${sessionsToInsert.length === 1 ? "" : "s"} from RescueTime (${rtSessions.length - sessionsToInsert.length} duplicate${rtSessions.length - sessionsToInsert.length === 1 ? "" : "s"} skipped)`,
    sessionsMerged: sessionsToInsert.length,
    reasoning: mergeDecision.reasoning,
  };
}

/**
 * Delete all activity sessions for a given date.
 */
export async function deleteActivitySessionsForDate(date: string) {
  if (!date) {
    throw new Error("Date parameter is required (YYYY-MM-DD)");
  }

  const plainDate = Temporal.PlainDate.from(date);
  const localTz = Temporal.Now.timeZoneId();
  const dayStart = new Date(plainDate.toZonedDateTime(localTz).toInstant().epochMilliseconds);
  const dayEnd = new Date(
    plainDate
      .toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from("23:59:59.999") })
      .toInstant().epochMilliseconds
  );

  const result = await prisma.activitySession.deleteMany({
    where: {
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });

  console.log(`Deleted ${result.count} activity sessions for ${date}`);

  return {
    message: `Deleted ${result.count} activity session${result.count === 1 ? "" : "s"}`,
    sessionsDeleted: result.count,
  };
}
