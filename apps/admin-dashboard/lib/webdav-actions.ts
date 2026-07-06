"use server";

import { tool } from "ai";
import { z } from "zod";
import { Temporal } from "@/lib/temporal-polyfill";
import {
  getCalendars as getCalendarsFromProvider,
  isWebdavEnabled,
  searchEventsByDateRange,
  type CalendarInfo,
  type CalendarEvent,
} from "@/lib/webdav-provider";

/**
 * Server action to check if CalDAV is enabled and configured.
 */
export async function checkCalDavEnabled(): Promise<boolean> {
  try {
    return await isWebdavEnabled();
  } catch (error) {
    console.error("Error checking CalDAV status:", error);
    return false;
  }
}

const CALENDAR_EVENTS_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface CalendarEventsCacheEntry {
  events: CalendarEvent[];
  fetchedAt: number;
}

// Module-level cache, shared across requests on this server instance.
const calendarEventsCache = new Map<string, CalendarEventsCacheEntry>();

/**
 * Server action to fetch calendar events for a specific day.
 * Returns empty array if CalDAV is not configured or no events found.
 * Results are cached in-memory per day for CALENDAR_EVENTS_CACHE_TTL_MS;
 * pass forceRefresh to bypass the cache.
 */
export async function fetchCalendarEventsForDay(
  dateStr: string,
  options?: { forceRefresh?: boolean }
): Promise<CalendarEvent[]> {
  const cached = calendarEventsCache.get(dateStr);
  if (
    !options?.forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < CALENDAR_EVENTS_CACHE_TTL_MS
  ) {
    return cached.events;
  }

  try {
    const date = Temporal.PlainDate.from(dateStr);
    const timeZone = Temporal.Now.timeZoneId();
    const startOfDay = date
      .toPlainDateTime(Temporal.PlainTime.from("00:00:00"))
      .toZonedDateTime(timeZone);
    const endOfDay = date
      .add({ days: 1 })
      .toPlainDateTime(Temporal.PlainTime.from("00:00:00"))
      .toZonedDateTime(timeZone);

    const events = await searchEventsByDateRange(
      startOfDay.toInstant(),
      endOfDay.toInstant()
    );
    calendarEventsCache.set(dateStr, { events, fetchedAt: Date.now() });
    return events;
  } catch (error) {
    console.error("Error fetching calendar events for day:", error);
    // Prefer stale cached data over nothing if a refresh attempt fails.
    return cached?.events ?? [];
  }
}

/**
 * Server action to fetch available CalDAV calendars.
 * This wraps the WebDAV provider function for use in client components.
 */
export async function fetchCalendars(): Promise<CalendarInfo[]> {
  try {
    const calendars = await getCalendarsFromProvider();
    return calendars;
  } catch (error) {
    console.error("Error fetching calendars:", error);
    return [];
  }
}

// ──────────────────────────────────────────────────
// Reusable AI tool factories
// ──────────────────────────────────────────────────

/**
 * Create calendar search tools scoped to a specific date range.
 * Used by AI agents in generateAutofillSuggestions, generateWeeklySummary, etc.
 */
export async function createCalendarSearchTools(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
) {
  return {
    searchCalendarEvents: tool({
      description:
        "Search for calendar events within the time period. " +
        "Returns meetings, appointments, and scheduled events. " +
        "Use this to discover client meetings, project discussions, and scheduled work blocks " +
        "that indicate time spent on specific projects.",
      inputSchema: z.object({
        keyword: z
          .string()
          .optional()
          .describe(
            "Optional keyword to filter events by (searches summary, description, attendees). " +
            "Leave empty to get all events in the time period."
          ),
      }),
      execute: async ({ keyword }: { keyword?: string }) => {
        const events = await searchEventsByDateRange(startInstant, endInstant);

        if (events.length === 0) {
          return {
            count: 0,
            message: "No calendar events found in the time period",
          };
        }

        // Filter by keyword if provided
        let filtered = events;
        if (keyword) {
          const lower = keyword.toLowerCase();
          filtered = events.filter(
            (e) =>
              e.summary.toLowerCase().includes(lower) ||
              (e.description && e.description.toLowerCase().includes(lower)) ||
              e.attendees.some((a) => a.toLowerCase().includes(lower)) ||
              (e.organizer && e.organizer.toLowerCase().includes(lower)) ||
              (e.location && e.location.toLowerCase().includes(lower))
          );
        }

        if (filtered.length === 0) {
          return {
            count: 0,
            message: keyword
              ? `No calendar events found matching "${keyword}"`
              : "No calendar events found in the time period",
          };
        }

        console.log(
          `searchCalendarEvents: ${filtered.length} events` +
            (keyword ? ` matching "${keyword}"` : "")
        );

        return {
          count: filtered.length,
          events: filtered.map((e) => ({
            summary: e.summary,
            startTime: e.startTime,
            endTime: e.endTime,
            durationMinutes: e.durationMinutes,
            calendarName: e.calendarName,
            location: e.location,
            attendees: e.attendees.slice(0, 10), // cap attendees
            organizer: e.organizer,
            description: e.description
              ? e.description.substring(0, 200)
              : null,
          })),
        };
      },
    }),
  };
}
