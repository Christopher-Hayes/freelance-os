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
const CALENDAR_EVENTS_CACHE_MAX_ENTRIES = 100;

interface CalendarEventsCacheEntry {
  events: CalendarEvent[];
  fetchedAt: number;
}

// Stored on globalThis so the caches survive dev-mode HMR module reloads.
// Shared across requests on this server instance.
const calendarEventsCache: Map<string, CalendarEventsCacheEntry> =
  ((globalThis as any).__calendarEventsCache ??= new Map());
// Dedupes concurrent requests for the same range (e.g. prefetch + navigation).
const inFlightRequests: Map<string, Promise<CalendarEvent[]>> =
  ((globalThis as any).__calendarEventsInFlight ??= new Map());

/**
 * Server action to fetch calendar events overlapping [startIso, endIso).
 * The client passes week boundaries computed in the browser's timezone, so
 * the server's timezone never matters. A CalDAV query costs about the same for
 * a week as for a day (it's dominated by round trips), so fetch a week at a
 * time and let the client slice it into days.
 *
 * Results are cached in-memory per range for CALENDAR_EVENTS_CACHE_TTL_MS;
 * pass forceRefresh to bypass the cache (also re-runs CalDAV discovery).
 */
export async function fetchCalendarEventsForRange(
  startIso: string,
  endIso: string,
  options?: { forceRefresh?: boolean }
): Promise<CalendarEvent[]> {
  const key = `${startIso}|${endIso}`;
  const cached = calendarEventsCache.get(key);
  if (
    !options?.forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < CALENDAR_EVENTS_CACHE_TTL_MS
  ) {
    return cached.events;
  }

  const inFlight = inFlightRequests.get(key);
  if (inFlight && !options?.forceRefresh) return inFlight;

  const request = (async () => {
    try {
      const events = await searchEventsByDateRange(
        Temporal.Instant.from(startIso),
        Temporal.Instant.from(endIso),
        { refreshProviders: options?.forceRefresh }
      );
      // Re-insert so Map order tracks recency, then evict the oldest entries.
      calendarEventsCache.delete(key);
      calendarEventsCache.set(key, { events, fetchedAt: Date.now() });
      while (calendarEventsCache.size > CALENDAR_EVENTS_CACHE_MAX_ENTRIES) {
        calendarEventsCache.delete(calendarEventsCache.keys().next().value!);
      }
      return events;
    } catch (error) {
      console.error("Error fetching calendar events for range:", error);
      // Prefer stale cached data over nothing if a refresh attempt fails.
      return cached?.events ?? [];
    }
  })().finally(() => {
    // A forced refresh may have replaced this entry; only clear our own.
    if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, request);
  return request;
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
