import { Temporal } from "@js-temporal/polyfill";
import { prisma } from "@freelance-os/database";

type DateRangeInput = {
  startDate?: string | null;
  endDate?: string | null;
};

type RangeResult = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
};

export type AppAnalyticsDailyPoint = {
  date: string;
  hours: number;
  sessions: number;
};

export type AppAnalyticsHourPoint = {
  hour: number;
  label: string;
  seconds: number;
};

export type AppAnalyticsWindowInsight = {
  title: string;
  sessions: number;
  totalSeconds: number;
  avgSeconds: number;
};

export type AppAnalyticsClientInsight = {
  clientId: number;
  clientName: string;
  color: string;
  minutes: number;
  entryCount: number;
  share: number;
};

export type AppAnalyticsProjectInsight = {
  projectId: number;
  projectName: string;
  clientId: number;
  clientName: string;
  color: string;
  minutes: number;
  entryCount: number;
  share: number;
};

export type AppAnalyticsSummary = {
  appClass: string;
  totalSessions: number;
  totalHours: number;
  avgSessionMinutes: number;
  avgDailyHours: number;
  activeDays: number;
  longestSessionMinutes: number;
  firstSeen: string | null;
  lastSeen: string | null;
  busiestDay: { date: string; hours: number; sessions: number } | null;
  mostCommonHour: { hour: number; label: string; seconds: number } | null;
  topWindowTitle: AppAnalyticsWindowInsight | null;
  focusScore: number;
  coverageScore: number;
  timerange: RangeResult;
};

export type AppAnalyticsResult = {
  summary: AppAnalyticsSummary;
  dailyUsage: AppAnalyticsDailyPoint[];
  hourlyUsage: AppAnalyticsHourPoint[];
  topWindowTitles: AppAnalyticsWindowInsight[];
  clientUsage: AppAnalyticsClientInsight[];
  projectUsage: AppAnalyticsProjectInsight[];
  insights: string[];
};

export async function getHiddenAppClasses(): Promise<Set<string>> {
  const hiddenApps = await prisma.app.findMany({
    where: { hidden: true },
    select: { appClass: true },
  });

  return new Set(hiddenApps.map((app) => app.appClass.toLowerCase()));
}

export async function getAppRenameMap(): Promise<Map<string, string>> {
  const renamedApps = await prisma.app.findMany({
    where: {
      displayName: { not: null },
    },
    select: { appClass: true, displayName: true },
  });
  const map = new Map<string, string>();
  for (const app of renamedApps) {
    if (app.displayName) {
      map.set(app.appClass.toLowerCase(), app.displayName);
    }
  }

  return map;
}

/**
 * Get the App record for a given appClass, or null if none exists.
 */
export async function getAppRecord(appClass: string) {
  return prisma.app.findUnique({
    where: { appClass },
  });
}

/**
 * Returns the earliest and latest session dates for an appClass, ignoring the
 * default date window. Used to fall back to an all-time range when no sessions
 * exist within the requested window (e.g. older RescueTime imports).
 */
export async function getAppSessionBounds(appClass: string, timeZone: string = Temporal.Now.timeZoneId()): Promise<{ startDate: string; endDate: string } | null> {
  const bounds = await prisma.activitySession.aggregate({
    where: { appClass, ignored: false },
    _min: { startTime: true },
    _max: { startTime: true },
  });
  if (!bounds._min.startTime || !bounds._max.startTime) return null;
  // Convert to local dates so getAppAnalytics query boundaries align correctly.
  // Using UTC dates here causes timezone-edge sessions to fall outside the query range.
  const toLocalDate = (d: Date) =>
    Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(timeZone).toPlainDate().toString();
  return {
    startDate: toLocalDate(bounds._min.startTime),
    endDate: toLocalDate(bounds._max.startTime),
  };
}

/**
 * Get or create an App record for a given appClass.
 * The record is lazily created the first time the app detail page is visited.
 */
export async function getOrCreateApp(appClass: string) {
  return prisma.app.upsert({
    where: { appClass },
    create: { appClass },
    update: {},
  });
}

export function resolveDateRange(input: DateRangeInput = {}, timeZone: string = Temporal.Now.timeZoneId()): RangeResult {
  const today = Temporal.Now.plainDateISO(timeZone);
  const endPlainDate = input.endDate ? Temporal.PlainDate.from(input.endDate) : today;
  const startPlainDate = input.startDate ? Temporal.PlainDate.from(input.startDate) : endPlainDate.subtract({ days: 29 });

  const start = new Date(
    startPlainDate
      .toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from("00:00:00") })
      .toInstant().epochMilliseconds
  );
  const end = new Date(
    endPlainDate
      .toZonedDateTime({ timeZone, plainTime: Temporal.PlainTime.from("23:59:59.999") })
      .toInstant().epochMilliseconds
  );

  return {
    start,
    end,
    startDate: startPlainDate.toString(),
    endDate: endPlainDate.toString(),
  };
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toHourLabel(hour: number) {
  const period = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 || 12;
  return `${normalized} ${period}`;
}

export async function getAppAnalytics(appClass: string, input: DateRangeInput = {}, timeZone: string = Temporal.Now.timeZoneId()): Promise<AppAnalyticsResult | null> {
  const trimmedAppClass = appClass.trim();
  if (!trimmedAppClass) {
    return null;
  }

  const hiddenAppClasses = await getHiddenAppClasses();
  if (hiddenAppClasses.has(trimmedAppClass.toLowerCase())) {
    return null;
  }

  const timerange = resolveDateRange(input, timeZone);
  const sessions = await prisma.activitySession.findMany({
    where: {
      appClass: trimmedAppClass,
      startTime: {
        gte: timerange.start,
        lte: timerange.end,
      },
      ignored: false,
    },
    orderBy: { startTime: "asc" },
  });

  if (sessions.length === 0) {
    return null;
  }

  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const dayUsage = new Map<string, { seconds: number; sessions: number }>();
  const hourUsage = Array.from({ length: 24 }, (_, hour) => ({ hour, label: toHourLabel(hour), seconds: 0 }));
  const windowUsage = new Map<string, { seconds: number; sessions: number }>();

  for (const session of sessions) {
    const instant = Temporal.Instant.from(session.startTime.toISOString());
    const localDateTime = instant.toZonedDateTimeISO(timeZone);
    const dateKey = localDateTime.toPlainDate().toString();
    const currentDay = dayUsage.get(dateKey) ?? { seconds: 0, sessions: 0 };
    currentDay.seconds += session.durationSeconds;
    currentDay.sessions += 1;
    dayUsage.set(dateKey, currentDay);

    hourUsage[localDateTime.hour]!.seconds += session.durationSeconds;

    const windowKey = session.windowTitle?.trim() || "Untitled / no window title";
    const currentWindow = windowUsage.get(windowKey) ?? { seconds: 0, sessions: 0 };
    currentWindow.seconds += session.durationSeconds;
    currentWindow.sessions += 1;
    windowUsage.set(windowKey, currentWindow);
  }

  const dailyUsage = Array.from(dayUsage.entries())
    .map(([date, value]) => ({ date, hours: round(value.seconds / 3600, 2), sessions: value.sessions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topWindowTitles = Array.from(windowUsage.entries())
    .map(([title, value]) => ({
      title,
      sessions: value.sessions,
      totalSeconds: value.seconds,
      avgSeconds: Math.round(value.seconds / value.sessions),
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 8);

  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      description: {
        contains: trimmedAppClass,
        mode: "insensitive",
      },
      startTime: {
        gte: timerange.start,
        lte: timerange.end,
      },
    },
    include: {
      project: {
        include: {
          client: true,
        },
      },
    },
  });

  const totalMappedMinutes = timeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const clientMap = new Map<number, AppAnalyticsClientInsight>();
  const projectMap = new Map<number, AppAnalyticsProjectInsight>();

  for (const entry of timeEntries) {
    const { project } = entry;
    const { client } = project;

    const clientEntry = clientMap.get(client.id) ?? {
      clientId: client.id,
      clientName: client.name,
  color: "#06B6D4",
      minutes: 0,
      entryCount: 0,
      share: 0,
    };
    clientEntry.minutes += entry.durationMinutes;
    clientEntry.entryCount += 1;
    clientMap.set(client.id, clientEntry);

    const projectEntry = projectMap.get(project.id) ?? {
      projectId: project.id,
      projectName: project.name,
      clientId: client.id,
      clientName: client.name,
      color: project.color,
      minutes: 0,
      entryCount: 0,
      share: 0,
    };
    projectEntry.minutes += entry.durationMinutes;
    projectEntry.entryCount += 1;
    projectMap.set(project.id, projectEntry);
  }

  const clientUsage = Array.from(clientMap.values())
    .map((entry) => ({ ...entry, share: totalMappedMinutes > 0 ? round((entry.minutes / totalMappedMinutes) * 100, 1) : 0 }))
    .sort((a, b) => b.minutes - a.minutes);
  const projectUsage = Array.from(projectMap.values())
    .map((entry) => ({ ...entry, share: totalMappedMinutes > 0 ? round((entry.minutes / totalMappedMinutes) * 100, 1) : 0 }))
    .sort((a, b) => b.minutes - a.minutes);

  const busiestDay = dailyUsage.reduce<AppAnalyticsSummary["busiestDay"]>((best, current) => {
    if (!best || current.hours > best.hours) return current;
    return best;
  }, null);
  const mostCommonHour = hourUsage.reduce<AppAnalyticsSummary["mostCommonHour"]>((best, current) => {
    if (!best || current.seconds > best.seconds) return current;
    return best;
  }, null);
  const topWindowTitle = topWindowTitles[0] ?? null;
  const activeDays = dayUsage.size;
  const startDate = Temporal.PlainDate.from(timerange.startDate);
  const endDate = Temporal.PlainDate.from(timerange.endDate);
  const rangeDayCount = Math.max(1, Math.round(endDate.since(startDate, { largestUnit: "days" }).total({ unit: "days" })) + 1);
  const avgSessionMinutes = totalSeconds / sessions.length / 60;
  const avgDailyHours = totalSeconds / 3600 / rangeDayCount;
  const longestSessionMinutes = Math.max(...sessions.map((session) => session.durationSeconds)) / 60;
  const focusScore = Math.min(100, round((avgSessionMinutes / 45) * 60 + (activeDays / rangeDayCount) * 40, 0));
  const coverageScore = Math.min(100, round(totalMappedMinutes > 0 ? (totalMappedMinutes * 60 / totalSeconds) * 100 : 0, 0));

  const insights: string[] = [];
  if (busiestDay) {
    insights.push(`${busiestDay.date} was the busiest day, with ${busiestDay.hours.toFixed(1)} hours across ${busiestDay.sessions} sessions.`);
  }
  if (mostCommonHour && mostCommonHour.seconds > 0) {
    insights.push(`Usage clusters most around ${mostCommonHour.label}, which looks like the app’s primary working window.`);
  }
  if (topWindowTitle) {
    insights.push(`“${topWindowTitle.title}” is the strongest recurring context, accounting for ${round((topWindowTitle.totalSeconds / totalSeconds) * 100, 0)}% of captured time.`);
  }
  if (clientUsage[0]) {
    insights.push(`${clientUsage[0].clientName} leads mapped usage with ${clientUsage[0].share.toFixed(1)}% of time-entry minutes connected to this app.`);
  } else {
    insights.push(`No time-entry descriptions reference this app yet, so client and project attribution is still sparse.`);
  }
  if (coverageScore > 0) {
    insights.push(`${coverageScore}% of captured app time is currently represented in matching time entries.`);
  }

  return {
    summary: {
      appClass: trimmedAppClass,
      totalSessions: sessions.length,
      totalHours: round(totalSeconds / 3600, 2),
      avgSessionMinutes: round(avgSessionMinutes, 1),
      avgDailyHours: round(avgDailyHours, 2),
      activeDays,
      longestSessionMinutes: round(longestSessionMinutes, 1),
      firstSeen: sessions[0]?.startTime.toISOString() ?? null,
      lastSeen: sessions[sessions.length - 1]?.endTime.toISOString() ?? null,
      busiestDay,
      mostCommonHour,
      topWindowTitle,
      focusScore,
      coverageScore,
      timerange,
    },
    dailyUsage,
    hourlyUsage: hourUsage,
    topWindowTitles,
    clientUsage,
    projectUsage,
    insights,
  };
}