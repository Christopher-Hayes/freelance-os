"use server";

import { createDAVClient, DAVCalendar, DAVObject } from "tsdav";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface CalendarInfo {
  url: string;
  displayName: string;
  description: string | null;
  color: string | null;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
  durationMinutes: number;
  calendarName: string;
  attendees: string[];
  organizer: string | null;
}

// ──────────────────────────────────────────────────
// Client helpers
// ──────────────────────────────────────────────────

/**
 * Get a CalDAV client configured from settings.
 * Returns null if CalDAV is not enabled or not configured.
 */
async function getCalDavClient() {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  if (
    !settings?.canReadCalendar ||
    !settings.webdavUrl ||
    !settings.webdavUsername ||
    !settings.webdavPassword
  ) {
    return null;
  }

  try {
    const client = await createDAVClient({
      serverUrl: settings.webdavUrl,
      credentials: {
        username: settings.webdavUsername,
        password: settings.webdavPassword,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    return client;
  } catch (error) {
    console.error("Error creating CalDAV client:", error);
    return null;
  }
}

/**
 * Get allowed calendar URLs from settings.
 * Returns null if all calendars are allowed (default behaviour).
 */
async function getAllowedCalendars(): Promise<string[] | null> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  if (
    !settings?.webdavAllowedCalendars ||
    settings.webdavAllowedCalendars.length === 0
  ) {
    return null;
  }

  return settings.webdavAllowedCalendars;
}

// ──────────────────────────────────────────────────
// iCalendar (ICS) parsing helpers
// ──────────────────────────────────────────────────

/**
 * Unfold long lines per RFC 5545 §3.1:
 * A CRLF followed by a single whitespace character is a line continuation.
 */
function unfoldIcs(raw: string): string {
  return raw.replace(/\r?\n[ \t]/g, "");
}

/**
 * Extract a simple property value from an unfolded ICS string.
 * Handles properties with parameters (e.g. DTSTART;TZID=...:20250101T090000).
 */
function icsProperty(ics: string, property: string): string | null {
  // Match PROPERTY or PROPERTY;params then : then value
  const re = new RegExp(`^${property}(?:;[^:]*)?:(.+)$`, "im");
  const m = ics.match(re);
  return m?.[1]?.trim() ?? null;
}

/**
 * Extract all values for a repeatable property (e.g. ATTENDEE).
 */
function icsPropertyAll(ics: string, property: string): string[] {
  const re = new RegExp(`^${property}(?:;[^:]*)?:(.+)$`, "gim");
  const results: string[] = [];
  let m;
  while ((m = re.exec(ics)) !== null) {
    results.push(m[1]!.trim());
  }
  return results;
}

/**
 * Parse a DTSTART/DTEND value into an ISO-8601 timestamp.
 * Handles:
 *  - 20250311T090000Z          (UTC)
 *  - 20250311T090000           (floating / local)
 *  - 2025-03-11T09:00:00Z     (already ISO)
 *  - 20250311                  (all-day date)
 *
 * For TZID-bearing properties the raw ICS line is inspected separately.
 */
function parseIcsDateTime(value: string, ics: string, property: string): string | null {
  if (!value) return null;

  // Already looks like ISO
  if (value.includes("-")) {
    return value.endsWith("Z") ? value : value + "Z";
  }

  // Try to extract TZID from the property line for conversion
  const tzidRe = new RegExp(`^${property};[^:]*TZID=([^;:]+)`, "im");
  const tzidMatch = ics.match(tzidRe);
  const tzid = tzidMatch?.[1];

  // All-day date (8 digits)
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const mo = value.slice(4, 6);
    const d = value.slice(6, 8);
    return `${y}-${mo}-${d}T00:00:00Z`;
  }

  // Basic format: 20250311T090000 or 20250311T090000Z
  const basicMatch = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  );
  if (basicMatch) {
    const [, y, mo, d, h, mi, s, z] = basicMatch;
    const isoLocal = `${y}-${mo}-${d}T${h}:${mi}:${s}`;

    if (z) {
      return isoLocal + "Z";
    }

    // If we have a TZID, convert via Temporal
    if (tzid) {
      try {
        const pdt = Temporal.PlainDateTime.from(isoLocal);
        const zdt = pdt.toZonedDateTime(tzid);
        return zdt.toInstant().toString();
      } catch {
        // Fall back to treating as UTC
        return isoLocal + "Z";
      }
    }

    // No timezone info — assume UTC
    return isoLocal + "Z";
  }

  return null;
}

/**
 * Extract a display name from a mailto: URI or return as-is.
 */
function cleanAttendee(raw: string): string {
  const mailto = raw.match(/mailto:(.+)/i);
  return mailto ? mailto[1]! : raw;
}

// ──────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────

/**
 * Check if CalDAV is enabled and configured.
 */
export async function isWebdavEnabled(): Promise<boolean> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  return !!(
    settings?.canReadCalendar &&
    settings.webdavUrl &&
    settings.webdavUsername &&
    settings.webdavPassword
  );
}

/**
 * Get all available calendars from the CalDAV server.
 * Returns empty array if CalDAV is not configured or disabled.
 */
export async function getCalendars(): Promise<CalendarInfo[]> {
  const client = await getCalDavClient();

  if (!client) {
    console.log("CalDAV not enabled or configured, skipping getCalendars");
    return [];
  }

  try {
    const calendars: DAVCalendar[] = await client.fetchCalendars();

    const results: CalendarInfo[] = calendars.map((cal) => ({
      url: cal.url,
      displayName: String(cal.displayName || "(Unnamed Calendar)"),
      description: cal.description ? String(cal.description) : null,
      color: (cal as any).calendarColor || null,
    }));

    console.log(`CalDAV - found ${results.length} calendars`);
    return results;
  } catch (error) {
    console.error("Error fetching calendars via CalDAV:", error);
    return [];
  }
}

/**
 * Search calendar events within a date range.
 * Returns empty array if CalDAV is not configured or disabled.
 */
export async function searchEventsByDateRange(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
): Promise<CalendarEvent[]> {
  const client = await getCalDavClient();

  if (!client) {
    console.log("CalDAV not enabled or configured, skipping event search");
    return [];
  }

  try {
    const calendars: DAVCalendar[] = await client.fetchCalendars();
    const allowedCalendars = await getAllowedCalendars();

    // Filter calendars if restrictions are set
    const filteredCalendars = allowedCalendars
      ? calendars.filter((cal) => allowedCalendars.includes(cal.url))
      : calendars;

    if (filteredCalendars.length === 0) {
      console.log("CalDAV - no calendars to search (all filtered out)");
      return [];
    }

    const startIso = new Date(startInstant.epochMilliseconds).toISOString();
    const endIso = new Date(endInstant.epochMilliseconds).toISOString();

    const allEvents: CalendarEvent[] = [];

    for (const calendar of filteredCalendars) {
      try {
        const objects: DAVObject[] = await client.fetchCalendarObjects({
          calendar,
          timeRange: {
            start: startIso,
            end: endIso,
          },
        });

        for (const obj of objects) {
          if (!obj.data) continue;

          const ics = unfoldIcs(typeof obj.data === "string" ? obj.data : "");
          if (!ics) continue;

          // Extract VEVENT blocks (there could be multiple, e.g. recurrences)
          const veventBlocks = ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi);
          if (!veventBlocks) continue;

          for (const block of veventBlocks) {
            const uid = icsProperty(block, "UID") || obj.url || "";
            const summary = icsProperty(block, "SUMMARY") || "(No title)";
            const description = icsProperty(block, "DESCRIPTION");
            const location = icsProperty(block, "LOCATION");

            const dtStartRaw = icsProperty(block, "DTSTART");
            const dtEndRaw = icsProperty(block, "DTEND");

            const startTime = dtStartRaw
              ? parseIcsDateTime(dtStartRaw, block, "DTSTART")
              : null;
            const endTime = dtEndRaw
              ? parseIcsDateTime(dtEndRaw, block, "DTEND")
              : null;

            if (!startTime) continue;

            // Check the event actually falls within range
            const eventStart = new Date(startTime).getTime();
            const eventEnd = endTime
              ? new Date(endTime).getTime()
              : eventStart + 3600000; // default 1h if no end
            const rangeStart = startInstant.epochMilliseconds;
            const rangeEnd = endInstant.epochMilliseconds;

            if (eventEnd < rangeStart || eventStart > rangeEnd) continue;

            // Calculate duration
            const durationMs = eventEnd - eventStart;
            const durationMinutes = Math.round(durationMs / 60000);

            // Attendees
            const attendeesRaw = icsPropertyAll(block, "ATTENDEE");
            const attendees = attendeesRaw.map(cleanAttendee);

            // Organizer
            const organizerRaw = icsProperty(block, "ORGANIZER");
            const organizer = organizerRaw
              ? cleanAttendee(organizerRaw)
              : null;

            allEvents.push({
              uid,
              summary,
              description,
              location,
              startTime,
              endTime: endTime || new Date(eventStart + 3600000).toISOString(),
              durationMinutes,
              calendarName:
                String(calendar.displayName || "(Unnamed Calendar)"),
              attendees,
              organizer,
            });
          }
        }
      } catch (calError) {
        console.error(
          `Error fetching events from calendar "${calendar.displayName}":`,
          calError
        );
      }
    }

    // Sort by start time
    allEvents.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    console.log(
      `CalDAV - found ${allEvents.length} events between ${startIso} and ${endIso}`
    );

    return allEvents;
  } catch (error) {
    console.error("Error searching calendar events via CalDAV:", error);
    return [];
  }
}
