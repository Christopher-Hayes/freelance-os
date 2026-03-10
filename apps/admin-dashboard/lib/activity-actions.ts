"use server";

import { prisma } from "@freelance-os/database";
import { Temporal } from "@js-temporal/polyfill";

interface RescueTimeResponse {
  notes: string;
  row_headers: string[];
  rows: (string | number)[][];
}

async function getHiddenAppClasses(): Promise<Set<string>> {
  const settings = await prisma.setting.findUnique({
    where: { key: 'main' },
    select: { hiddenAppClasses: true },
  });

  return new Set((settings?.hiddenAppClasses || []).map((app) => app.toLowerCase()));
}

/**
 * Import activity data from RescueTime API
 */
export async function importRescueTimeData(date: string) {
  if (!date) {
    throw new Error("Date parameter is required (YYYY-MM-DD)");
  }

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
  rescueTimeUrl.searchParams.set("restrict_kind", "document"); // Use 'document' for file-level detail
  rescueTimeUrl.searchParams.set("interval", "minute"); // 5-minute granularity
  rescueTimeUrl.searchParams.set("restrict_begin", date);
  rescueTimeUrl.searchParams.set("restrict_end", date);
  rescueTimeUrl.searchParams.set("format", "json");

  console.log("Fetching from RescueTime:", rescueTimeUrl.toString().replace(apiKey, "***"));

  // Fetch data from RescueTime
  const response = await fetch(rescueTimeUrl.toString());

  if (!response.ok) {
    const errorText = await response.text();
    console.error("RescueTime API error:", response.status, errorText);
    throw new Error(`RescueTime API error: ${response.status}`);
  }

  const data: RescueTimeResponse = await response.json();

  // Log the response structure for debugging
  console.log("RescueTime API response headers:", data.row_headers);
  console.log("Sample row (first):", data.rows[0]);

  if (!data.rows || data.rows.length === 0) {
    return {
      message: "No activity data found in RescueTime for this date",
      sessionsImported: 0,
    };
  }

  // Transform RescueTime data to our activity sessions format
  // RescueTime document-level rows format based on actual API response:
  // [Date, Time Spent (seconds), Number of People, Activity, Document, Category, Productivity]
  // Example: ["2025-10-30T18:00:00", 300, 1, "Visual Studio Code", "operatormenu.cs", "Editing & IDEs", 2]
  // The row_headers tell us the exact order:
  // - Index 0: Date
  // - Index 1: Time Spent (seconds)
  // - Index 2: Number of People
  // - Index 3: Activity (the application name)
  // - Index 4: Document (the specific file, page, or "No Details")
  // - Index 5: Category
  // - Index 6: Productivity
  
  const sessions = data.rows.map((row) => {
    const dateTime = row[0] as string; // ISO timestamp
    const durationSeconds = row[1] as number;
    
    // Row structure: Activity is at index 3, Document is at index 4
    const activity = row[3] as string; // Application name (e.g., "Visual Studio Code")
    const document = row[4] as string; // Document/file name (e.g., "operatormenu.cs" or "No Details")
    const category = row[5] as string; // Category (e.g., "Editing & IDEs")

    // Use document name as window title if it's meaningful (not "No Details"), otherwise use category
    const windowTitle = document && document !== "No Details" ? document : category;

    // Parse the start time
    const startTime = new Date(dateTime);
    
    // Calculate end time
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    return {
      startTime,
      endTime,
      appClass: activity, // The application name (e.g., "Visual Studio Code")
      windowTitle, // The document/file name or category
      durationSeconds,
    };
  });

  // Check if we already have data for this date to avoid duplicates
  const [year, month, day] = date.split('-').map(Number);
  const dayStart = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999));

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
export async function getMostUsedApp(startDate: Temporal.PlainDate, endDate: Temporal.PlainDate) {
  // Convert PlainDate to UTC Instant at start/end of day
  const startInstant = startDate.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('00:00:00') }).toInstant();
  const endInstant = endDate.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant();
  
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
export async function getTopProject(startDate: Temporal.PlainDate, endDate: Temporal.PlainDate) {
  // Convert PlainDate to UTC Instant at start/end of day
  const startInstant = startDate.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('00:00:00') }).toInstant();
  const endInstant = endDate.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant();
  
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
export async function getHoursInRange(startDate: Temporal.PlainDate, endDate: Temporal.PlainDate) {
  // Convert PlainDate to UTC Instant at start/end of day
  const startInstant = startDate.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('00:00:00') }).toInstant();
  const endInstant = endDate.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant();
  
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
