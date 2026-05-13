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
  providerId: number;
  providerName: string;
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
  providerName: string;
  attendees: string[];
  organizer: string | null;
}

// ──────────────────────────────────────────────────
// Client helpers
// ──────────────────────────────────────────────────

type ProviderClient = {
  client: Awaited<ReturnType<typeof createDAVClient>>;
  provider: {
    id: number;
    name: string;
    allowedCalendars: string[];
  };
};

/**
 * Get a CalDAV client for each enabled, fully-configured provider.
 */
async function getCalDavClients(): Promise<ProviderClient[]> {
  const providers = await prisma.calDavProvider.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });

  const clients: ProviderClient[] = [];

  for (const provider of providers) {
    if (!provider.url || !provider.username || !provider.password) {
      continue;
    }

    try {
      const client = await createDAVClient({
        serverUrl: provider.url,
        credentials: {
          username: provider.username,
          password: provider.password,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });

      clients.push({
        client,
        provider: {
          id: provider.id,
          name: provider.name,
          allowedCalendars: provider.allowedCalendars,
        },
      });
    } catch (error) {
      console.error(`Error creating CalDAV client for provider "${provider.name}":`, error);
    }
  }

  return clients;
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
 * Check if CalDAV is enabled globally and at least one provider is fully configured.
 */
export async function isWebdavEnabled(): Promise<boolean> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  if (!settings?.canReadCalendar) {
    return false;
  }

  const enabledProviderCount = await prisma.calDavProvider.count({
    where: {
      enabled: true,
      url: { not: "" },
      username: { not: "" },
      password: { not: "" },
    },
  });

  return enabledProviderCount > 0;
}

/**
 * Get all available calendars from all enabled CalDAV providers.
 * Returns empty array if CalDAV is not configured or disabled.
 */
export async function getCalendars(): Promise<CalendarInfo[]> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  if (!settings?.canReadCalendar) {
    console.log("CalDAV not enabled globally, skipping getCalendars");
    return [];
  }

  const providerClients = await getCalDavClients();

  if (providerClients.length === 0) {
    console.log("No enabled CalDAV providers configured, skipping getCalendars");
    return [];
  }

  const allCalendars: CalendarInfo[] = [];

  for (const { client, provider } of providerClients) {
    try {
      const calendars: DAVCalendar[] = await client.fetchCalendars();

      for (const cal of calendars) {
        allCalendars.push({
          url: cal.url,
          displayName: String(cal.displayName || "(Unnamed Calendar)"),
          description: cal.description ? String(cal.description) : null,
          color: (cal as any).calendarColor || null,
          providerId: provider.id,
          providerName: provider.name,
        });
      }

      console.log(`CalDAV [${provider.name}] - found ${calendars.length} calendars`);
    } catch (error) {
      console.error(`Error fetching calendars from provider "${provider.name}":`, error);
    }
  }

  return allCalendars;
}

/**
 * Search calendar events within a date range across all enabled providers.
 * Each provider's allowedCalendars list is applied independently.
 * Returns empty array if CalDAV is not configured or disabled.
 */
export async function searchEventsByDateRange(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
): Promise<CalendarEvent[]> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  if (!settings?.canReadCalendar) {
    console.log("CalDAV not enabled globally, skipping event search");
    return [];
  }

  const providerClients = await getCalDavClients();

  if (providerClients.length === 0) {
    console.log("No enabled CalDAV providers configured, skipping event search");
    return [];
  }

  const startIso = new Date(startInstant.epochMilliseconds).toISOString();
  const endIso = new Date(endInstant.epochMilliseconds).toISOString();

  // Query all providers in parallel
  const perProviderResults = await Promise.all(
    providerClients.map(({ client, provider }) =>
      fetchEventsFromProvider(client, provider, startInstant, endInstant, startIso, endIso)
    )
  );

  const allEvents = perProviderResults.flat();

  // Sort by start time
  allEvents.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  console.log(
    `CalDAV - found ${allEvents.length} events between ${startIso} and ${endIso} across ${providerClients.length} provider(s)`
  );

  return allEvents;
}

async function fetchEventsFromProvider(
  client: Awaited<ReturnType<typeof createDAVClient>>,
  provider: { id: number; name: string; allowedCalendars: string[] },
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
  startIso: string,
  endIso: string,
): Promise<CalendarEvent[]> {
  try {
    const calendars: DAVCalendar[] = await client.fetchCalendars();

    // Apply per-provider calendar filter
    const filteredCalendars =
      provider.allowedCalendars.length > 0
        ? calendars.filter((cal) => provider.allowedCalendars.includes(cal.url))
        : calendars;

    if (filteredCalendars.length === 0) {
      return [];
    }

    const events: CalendarEvent[] = [];

    for (const calendar of filteredCalendars) {
      try {
        const objects: DAVObject[] = await client.fetchCalendarObjects({
          calendar,
          timeRange: { start: startIso, end: endIso },
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

            const eventStart = new Date(startTime).getTime();
            const eventEnd = endTime
              ? new Date(endTime).getTime()
              : eventStart + 3600000;
            const rangeStart = startInstant.epochMilliseconds;
            const rangeEnd = endInstant.epochMilliseconds;

            if (eventEnd < rangeStart || eventStart > rangeEnd) continue;

            const durationMinutes = Math.round((eventEnd - eventStart) / 60000);

            const attendeesRaw = icsPropertyAll(block, "ATTENDEE");
            const attendees = attendeesRaw.map(cleanAttendee);

            const organizerRaw = icsProperty(block, "ORGANIZER");
            const organizer = organizerRaw ? cleanAttendee(organizerRaw) : null;

            events.push({
              uid,
              summary,
              description,
              location,
              startTime,
              endTime: endTime || new Date(eventStart + 3600000).toISOString(),
              durationMinutes,
              calendarName: String(calendar.displayName || "(Unnamed Calendar)"),
              providerName: provider.name,
              attendees,
              organizer,
            });
          }
        }
      } catch (calError) {
        console.error(
          `Error fetching events from calendar "${calendar.displayName}" on provider "${provider.name}":`,
          calError
        );
      }
    }

    return events;
  } catch (error) {
    console.error(`Error fetching events from provider "${provider.name}":`, error);
    return [];
  }
}
