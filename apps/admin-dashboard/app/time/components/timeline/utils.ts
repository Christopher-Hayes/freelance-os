import { Temporal } from "@/lib/temporal-polyfill";

/**
 * Format a Temporal.PlainDate as "YYYY-MM-DD" for API calls
 */
export function formatDateStr(date: Temporal.PlainDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/**
 * Snap a ZonedDateTime's minutes to the nearest 15-minute boundary,
 * zeroing seconds and sub-seconds.
 */
export function snapTo15Min(time: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  const snappedMinutes = Math.round(time.minute / 15) * 15;
  return time.with({
    minute: snappedMinutes,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });
}

export const PIXELS_PER_HOUR = 60;
export const HOUR_HEIGHT = PIXELS_PER_HOUR;
export const TIMELINE_PADDING_TOP = 16;
export const TIMELINE_DRAG_OFFSET = -8;
export const MIN_DISPLAY_DURATION_MINUTES = 15;
export const MERGE_GAP_MINUTES = 10;
export const MERGE_THRESHOLD_MINUTES = 15; // Show merge button when entries are this close

export const APP_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#A855F7', // violet
  '#F43F5E', // rose
  '#22C55E', // green
  '#FBBF24', // yellow
  '#0EA5E9', // sky
];

export interface SubSession {
  startTime: string;
  endTime: string;
  windowTitle: string | null;
  durationSeconds: number;
}

export interface ActivitySession {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
  /** Original sub-sessions before merging. Present when multiple sessions were merged. */
  subSessions?: SubSession[];
}

export interface IntervalBreakdown {
  /** The start of this 15-minute interval as an ISO string */
  intervalStart: string;
  /** Formatted time label, e.g. "5:45 PM" */
  timeLabel: string;
  /** The dominant window title in this interval */
  title: string;
}

export interface TimeEntry {
  id: number;
  projectId: number;
  description: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  billable: boolean;
  project: {
    id: number;
    name: string;
    color: string;
    client: {
      name: string;
    };
  };
}

export interface Project {
  id: number;
  name: string;
  color: string;
  clientId: number;
  billable: boolean;
  client: {
    name: string;
  };
}

/**
 * Convert a Temporal.ZonedDateTime to Y position in pixels (0 = midnight)
 */
export function timeToY(time: Temporal.ZonedDateTime): number {
  const startOfDay = time.withPlainTime(Temporal.PlainTime.from("00:00"));
  const diffNs = time.epochNanoseconds - startOfDay.epochNanoseconds;
  const diffMs = Number(diffNs / 1_000_000n);
  const totalHours = diffMs / (1000 * 60 * 60);
  return totalHours * PIXELS_PER_HOUR;
}

/**
 * Convert Y position to Temporal.ZonedDateTime
 */
export function yToTime(y: number, baseDate: Temporal.PlainDate): Temporal.ZonedDateTime {
  const hours = y / PIXELS_PER_HOUR;
  const timeZone = Temporal.Now.timeZoneId();
  const plainDateTime = baseDate.toPlainDateTime(Temporal.PlainTime.from("00:00:00"));
  const startOfDay = plainDateTime.toZonedDateTime(timeZone);
  const totalSeconds = Math.floor(hours * 3600);
  return startOfDay.add({ seconds: totalSeconds });
}

/**
 * Build a color mapping for apps based on their total usage duration.
 * Most used apps get assigned colors first (linearly through the color list).
 * This prevents adjacent high-usage apps from having similar colors.
 */
export function buildAppColorMap(sessions: ActivitySession[]): Map<string, string> {
  // Calculate total duration for each app
  const appDurations = new Map<string, number>();
  
  for (const session of sessions) {
    const current = appDurations.get(session.appClass) || 0;
    appDurations.set(session.appClass, current + session.durationSeconds);
  }
  
  // Sort apps by total duration (descending - most used first)
  const sortedApps = Array.from(appDurations.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([appClass]) => appClass);
  
  // Assign colors linearly through the list
  const colorMap = new Map<string, string>();
  sortedApps.forEach((appClass, index) => {
    colorMap.set(appClass, APP_COLORS[index % APP_COLORS.length]!);
  });
  
  return colorMap;
}

/**
 * Get consistent color for an app based on its name (legacy hash-based method)
 * @deprecated Use buildAppColorMap and pass the map to components instead
 */
export function getAppColor(appClass: string): string {
  let hash = 0;
  for (let i = 0; i < appClass.length; i++) {
    hash = appClass.charCodeAt(i) + ((hash << 5) - hash);
  }
  return APP_COLORS[Math.abs(hash) % APP_COLORS.length]!;
}

/**
 * Clamp sessions to not extend past midnight (end of day boundary)
 * This prevents rendering issues in the 24-hour timeline view
 */
function clampSessionsToDay(sessions: ActivitySession[]): ActivitySession[] {
  return sessions.map(session => {
    const start = Temporal.Instant.from(session.startTime);
    const end = Temporal.Instant.from(session.endTime);
    
    // Get the start of the day for this session
    const tz = Temporal.Now.timeZoneId();
    const startZoned = start.toZonedDateTimeISO(tz);
    const endZoned = end.toZonedDateTimeISO(tz);
    
    // Calculate end of day (23:59:59.999)
    const endOfDay = startZoned
      .withPlainTime(Temporal.PlainTime.from("23:59:59.999"));
    
    // If the session extends past midnight, clamp it to end of day
    if (Temporal.ZonedDateTime.compare(endZoned, endOfDay) > 0) {
      const clampedEnd = endOfDay.toInstant();
      const newDurationNs = clampedEnd.epochNanoseconds - start.epochNanoseconds;
      const newDurationSeconds = Math.floor(Number(newDurationNs) / 1_000_000_000);
      
      return {
        ...session,
        endTime: clampedEnd.toString(),
        durationSeconds: newDurationSeconds,
      };
    }
    
    return session;
  });
}

/**
 * Merge adjacent sessions for the same app within a time gap
 */
export function mergeAdjacentSessions(sessions: ActivitySession[]): ActivitySession[] {
  // Step 0: Clamp sessions to day boundaries to prevent rendering issues
  const clampedSessions = clampSessionsToDay(sessions);
  
  // Step 1: Apply minimum display duration
  const sessionsWithMinDuration = clampedSessions.map(session => {
    const start = Temporal.Instant.from(session.startTime);
    const end = Temporal.Instant.from(session.endTime);
    let newEnd = end;
    const durationNs = end.epochNanoseconds - start.epochNanoseconds;
    const durationMinutes = Number(durationNs) / (1_000_000_000 * 60);
    
    if (durationMinutes < MIN_DISPLAY_DURATION_MINUTES) {
      newEnd = start.add({ minutes: MIN_DISPLAY_DURATION_MINUTES });
    }

    // If newEnd goes past current time or end of day, clamp it
    const now = Temporal.Now.instant();
    const tz = Temporal.Now.timeZoneId();
    const startZoned = start.toZonedDateTimeISO(tz);
    const endOfDay = startZoned.withPlainTime(Temporal.PlainTime.from("23:59:59.999")).toInstant();
    
    if (Temporal.Instant.compare(newEnd, now) > 0) {
      newEnd = now;
    }
    
    if (Temporal.Instant.compare(newEnd, endOfDay) > 0) {
      newEnd = endOfDay;
    }

    if (Temporal.Instant.compare(newEnd, end) > 0) {
      return {
        ...session,
        endTime: newEnd.toString(),
        durationSeconds: Math.floor(Number(newEnd.epochNanoseconds - start.epochNanoseconds) / 1_000_000_000),
      };
    }
    
    return { ...session };
  });

  // Step 2: Sort by start time
  const sortedSessions = [...sessionsWithMinDuration].sort((a, b) => {
    const aInstant = Temporal.Instant.from(a.startTime);
    const bInstant = Temporal.Instant.from(b.startTime);
    return Temporal.Instant.compare(aInstant, bInstant);
  });

  // Step 3: Merge overlapping sessions of the same app
  const merged: ActivitySession[] = [];
  
  for (const session of sortedSessions) {
    const currentStart = Temporal.Instant.from(session.startTime);
    const currentEnd = Temporal.Instant.from(session.endTime);

    // Build a sub-session entry for this individual session
    const thisSubSession: SubSession = {
      startTime: session.startTime,
      endTime: session.endTime,
      windowTitle: session.windowTitle,
      durationSeconds: session.durationSeconds,
    };
    
    // Find the most recent session of the same app to merge with
    // Search backwards to find the closest match in time
    let existingIndex = -1;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i]!;
      if (m.appClass !== session.appClass) continue;
      
      const mEnd = Temporal.Instant.from(m.endTime);
      const gapNs = currentStart.epochNanoseconds - mEnd.epochNanoseconds;
      const gapMinutes = Number(gapNs) / (1_000_000_000 * 60);
      
      // Merge if gap is within threshold (handles both overlaps and small gaps)
      if (gapMinutes <= MERGE_GAP_MINUTES) {
        existingIndex = i;
        break; // Found the most recent matching session
      }
    }
    
    if (existingIndex >= 0) {
      const existing = merged[existingIndex]!;
      const existingEnd = Temporal.Instant.from(existing.endTime);
      
      if (Temporal.Instant.compare(currentEnd, existingEnd) > 0) {
        existing.endTime = session.endTime;
      }
      
      const existingStart = Temporal.Instant.from(existing.startTime);
      const existingEndInstant = Temporal.Instant.from(existing.endTime);
      const newDurationNs = existingEndInstant.epochNanoseconds - existingStart.epochNanoseconds;
      existing.durationSeconds = Math.floor(Number(newDurationNs) / 1_000_000_000);

      // Accumulate sub-sessions
      if (!existing.subSessions) {
        existing.subSessions = [];
      }
      existing.subSessions.push(thisSubSession);
      
      // Still update the combined windowTitle for tooltip/fallback
      if (session.windowTitle && session.windowTitle !== existing.windowTitle) {
        const currentTitle = existing.windowTitle || '';
        const newTitle = session.windowTitle;
        if (!currentTitle.includes(newTitle)) {
          const combined = currentTitle ? `${currentTitle} / ${newTitle}` : newTitle;
          existing.windowTitle = combined;
        }
      }
    } else {
      merged.push({ ...session, subSessions: [thisSubSession] });
    }
  }
  
  return merged;
}

/** Minimum duration (in minutes) for a merged session to use the interval breakdown UI */
export const INTERVAL_BREAKDOWN_THRESHOLD_MINUTES = 30;
/** Size of each interval chunk in minutes */
export const INTERVAL_CHUNK_MINUTES = 15;
/** Minimum space (in minutes) to reserve at the top for the app title header */
export const INTERVAL_HEADER_RESERVE_MINUTES = 20;

/**
 * Strip the trailing app name from a window title.
 * e.g. "Discord | #general-chat - Firefox" → "Discord | #general-chat"
 */
function stripTrailingAppName(title: string): string {
  const lastDash = title.lastIndexOf(' - ');
  if (lastDash > 0) {
    return title.slice(0, lastDash);
  }
  return title;
}

/**
 * Compute 15-minute interval breakdowns for a merged session.
 * For each interval, finds the sub-session with the highest overlap duration
 * and returns its window title.
 *
 * Skips the first ~20 minutes to leave room for the app title header.
 */
export function computeIntervalBreakdown(
  sessionStartISO: string,
  sessionEndISO: string,
  subSessions: SubSession[],
): IntervalBreakdown[] {
  const tz = Temporal.Now.timeZoneId();
  const sessionStart = Temporal.Instant.from(sessionStartISO).toZonedDateTimeISO(tz);
  const sessionEnd = Temporal.Instant.from(sessionEndISO).toZonedDateTimeISO(tz);

  // Find the first 15-minute-aligned boundary that is at least INTERVAL_HEADER_RESERVE_MINUTES
  // into the session (to leave room for the app title).
  const startPlusReserve = sessionStart.add({ minutes: INTERVAL_HEADER_RESERVE_MINUTES });

  // Align to next 15-minute boundary
  const reserveMinute = startPlusReserve.minute;
  const nextAlignedMinute = Math.ceil(reserveMinute / INTERVAL_CHUNK_MINUTES) * INTERVAL_CHUNK_MINUTES;
  let firstInterval: Temporal.ZonedDateTime;
  if (nextAlignedMinute >= 60) {
    // Roll to the next hour
    firstInterval = startPlusReserve
      .add({ hours: 1 })
      .with({ minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
  } else {
    firstInterval = startPlusReserve
      .with({ minute: nextAlignedMinute, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
  }

  const intervals: IntervalBreakdown[] = [];
  let current = firstInterval;

  while (Temporal.ZonedDateTime.compare(current, sessionEnd) < 0) {
    const intervalEnd = current.add({ minutes: INTERVAL_CHUNK_MINUTES });

    // Clamp interval end to session end
    const effectiveEnd = Temporal.ZonedDateTime.compare(intervalEnd, sessionEnd) > 0
      ? sessionEnd
      : intervalEnd;

    // Find the sub-session with the most overlap in this interval
    let bestTitle = '';
    let bestOverlap = 0;

    for (const sub of subSessions) {
      const subStart = Temporal.Instant.from(sub.startTime).toZonedDateTimeISO(tz);
      const subEnd = Temporal.Instant.from(sub.endTime).toZonedDateTimeISO(tz);

      // Calculate overlap between [current, effectiveEnd] and [subStart, subEnd]
      const overlapStart = Temporal.ZonedDateTime.compare(current, subStart) > 0 ? current : subStart;
      const overlapEnd = Temporal.ZonedDateTime.compare(effectiveEnd, subEnd) < 0 ? effectiveEnd : subEnd;

      if (Temporal.ZonedDateTime.compare(overlapStart, overlapEnd) < 0) {
        const overlapNs = overlapEnd.epochNanoseconds - overlapStart.epochNanoseconds;
        const overlapSeconds = Number(overlapNs / 1_000_000_000n);

        if (overlapSeconds > bestOverlap) {
          bestOverlap = overlapSeconds;
          bestTitle = sub.windowTitle ? stripTrailingAppName(sub.windowTitle) : '';
        }
      }
    }

    if (bestTitle) {
      // Format time label, e.g. "5:45 PM"
      const hour = current.hour;
      const minute = current.minute;
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const displayMinute = minute.toString().padStart(2, '0');
      const timeLabel = `${displayHour}:${displayMinute} ${period}`;

      intervals.push({
        intervalStart: current.toString(),
        timeLabel,
        title: bestTitle,
      });
    }

    current = intervalEnd;
  }

  return intervals;
}