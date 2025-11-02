import { Temporal } from "@/lib/temporal-polyfill";

export const PIXELS_PER_HOUR = 60;
export const HOUR_HEIGHT = PIXELS_PER_HOUR;
export const TIMELINE_PADDING_TOP = 16;
export const TIMELINE_DRAG_OFFSET = -8;
export const MIN_DISPLAY_DURATION_MINUTES = 15;
export const MERGE_GAP_MINUTES = 60;

export const APP_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#06B6D4', // cyan
];

export interface ActivitySession {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
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
 * Get consistent color for an app based on its name
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
    const durationNs = end.epochNanoseconds - start.epochNanoseconds;
    const durationMinutes = Number(durationNs) / (1_000_000_000 * 60);
    
    if (durationMinutes < MIN_DISPLAY_DURATION_MINUTES) {
      const newEnd = start.add({ minutes: MIN_DISPLAY_DURATION_MINUTES });
      return {
        ...session,
        endTime: newEnd.toString(),
        durationSeconds: MIN_DISPLAY_DURATION_MINUTES * 60,
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
      
      if (session.windowTitle && session.windowTitle !== existing.windowTitle) {
        const currentTitle = existing.windowTitle || '';
        const newTitle = session.windowTitle;
        if (!currentTitle.includes(newTitle)) {
          const combined = currentTitle ? `${currentTitle} / ${newTitle}` : newTitle;
          existing.windowTitle = combined;
        }
      }
    } else {
      merged.push({ ...session });
    }
  }
  
  return merged;
}
