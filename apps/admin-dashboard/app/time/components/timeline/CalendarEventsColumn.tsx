"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import type { CalendarEvent } from "@/lib/webdav-provider";
import { fetchCalendarEventsForRange } from "@/lib/webdav-actions";
import TimelineHourMarkers from "./TimelineHourMarkers";
import CurrentTimeLine from "./CurrentTimeLine";
import CalendarScrollbarMinimap from "./CalendarScrollbarMinimap";
import { HOUR_HEIGHT, TIMELINE_PADDING_TOP } from "./utils";

interface ScrollMetrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

interface CalendarEventsColumnProps {
  selectedDate: Temporal.PlainDate;
  isClient: boolean;
  currentTime: Temporal.ZonedDateTime;
  // Scroll sync
  calendarScrollMetrics: ScrollMetrics;
  isDraggingCalendarMinimapViewport: boolean;
  setIsDraggingCalendarMinimapViewport: (v: boolean) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onJumpMinimapToRatio: (ratio: number) => void;
  onDragMinimap: (deltaRatio: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

// Pastel-ish colors for calendar events
const EVENT_COLORS = [
  { bg: "bg-violet-100 dark:bg-violet-900/40", border: "border-violet-300 dark:border-violet-700", text: "text-violet-800 dark:text-violet-200" },
  { bg: "bg-sky-100 dark:bg-sky-900/40", border: "border-sky-300 dark:border-sky-700", text: "text-sky-800 dark:text-sky-200" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-300 dark:border-amber-700", text: "text-amber-800 dark:text-amber-200" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-800 dark:text-emerald-200" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-rose-300 dark:border-rose-700", text: "text-rose-800 dark:text-rose-200" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-indigo-300 dark:border-indigo-700", text: "text-indigo-800 dark:text-indigo-200" },
];

function getEventColor(calendarName: string, colorMap: Map<string, number>) {
  const idx = colorMap.get(calendarName) ?? 0;
  return EVENT_COLORS[idx % EVENT_COLORS.length]!;
}

/** Format an ISO timestamp as a short local time string like "9:30 AM" */
function formatTime(isoStr: string): string {
  const date = new Date(isoStr);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Convert an ISO timestamp to Y pixel position on the 24h timeline */
function isoToY(isoStr: string, selectedDate: Temporal.PlainDate): number {
  const d = new Date(isoStr);
  const timeZone = Temporal.Now.timeZoneId();
  const startOfDay = selectedDate
    .toPlainDateTime(Temporal.PlainTime.from("00:00:00"))
    .toZonedDateTime(timeZone);
  const startMs = Number(startOfDay.epochNanoseconds / 1_000_000n);
  const eventMs = d.getTime();
  const diffMs = eventMs - startMs;
  const hours = diffMs / (1000 * 60 * 60);
  return Math.max(0, Math.min(24 * HOUR_HEIGHT, hours * HOUR_HEIGHT));
}

const MIN_EVENT_HEIGHT = 16; // px — so very short events are still visible

// ── Week-level event cache ──────────────────────────────────────────────
// Events are fetched a week (Mon–Sun, local time) at a time and sliced into
// days here, so navigating between days in the same week needs no request.
// Module-level so it survives remounts within this tab. The server keeps its
// own longer-lived cache, so expiring here only costs a cheap round trip.
const CLIENT_WEEK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const weekCache = new Map<string, { events: CalendarEvent[]; fetchedAt: number }>();
const weekRequests = new Map<string, Promise<CalendarEvent[]>>();

function startOfDayMs(date: Temporal.PlainDate, timeZone: string): number {
  return date
    .toPlainDateTime(Temporal.PlainTime.from("00:00:00"))
    .toZonedDateTime(timeZone).epochMilliseconds;
}

function getWeekRange(date: Temporal.PlainDate) {
  const timeZone = Temporal.Now.timeZoneId();
  const weekStart = date.subtract({ days: date.dayOfWeek - 1 }); // Monday
  const startIso = Temporal.Instant.fromEpochMilliseconds(startOfDayMs(weekStart, timeZone)).toString();
  const endIso = Temporal.Instant.fromEpochMilliseconds(
    startOfDayMs(weekStart.add({ days: 7 }), timeZone)
  ).toString();
  return { key: `${startIso}|${endIso}`, startIso, endIso };
}

function getCachedWeek(date: Temporal.PlainDate): CalendarEvent[] | null {
  const cached = weekCache.get(getWeekRange(date).key);
  if (!cached) return null;
  const age = Temporal.Now.instant().epochMilliseconds - cached.fetchedAt;
  return age < CLIENT_WEEK_CACHE_TTL_MS ? cached.events : null;
}

function loadWeek(date: Temporal.PlainDate, forceRefresh = false): Promise<CalendarEvent[]> {
  const { key, startIso, endIso } = getWeekRange(date);
  if (!forceRefresh) {
    const cached = getCachedWeek(date);
    if (cached) return Promise.resolve(cached);
    const pending = weekRequests.get(key);
    if (pending) return pending;
  }

  const request = fetchCalendarEventsForRange(startIso, endIso, { forceRefresh })
    .then((events) => {
      weekCache.set(key, { events, fetchedAt: Temporal.Now.instant().epochMilliseconds });
      return events;
    })
    .finally(() => {
      if (weekRequests.get(key) === request) weekRequests.delete(key);
    });
  weekRequests.set(key, request);
  return request;
}

/** Keep only events overlapping the given local day. */
function eventsForDay(events: CalendarEvent[], date: Temporal.PlainDate): CalendarEvent[] {
  const timeZone = Temporal.Now.timeZoneId();
  const dayStart = startOfDayMs(date, timeZone);
  const dayEnd = startOfDayMs(date.add({ days: 1 }), timeZone);
  return events.filter((e) => {
    const start = Date.parse(e.startTime);
    const end = Date.parse(e.endTime);
    // Zero-length events count if they start within the day
    return start < dayEnd && (end > dayStart || start >= dayStart);
  });
}

export default function CalendarEventsColumn({
  selectedDate,
  isClient,
  currentTime,
  calendarScrollMetrics,
  isDraggingCalendarMinimapViewport,
  setIsDraggingCalendarMinimapViewport,
  onScroll,
  onJumpMinimapToRatio,
  onDragMinimap,
  scrollRef,
}: CalendarEventsColumnProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  // Tracks the most recently issued fetch so stale responses (e.g. from a
  // previous day, if the user switches days before it resolves) get ignored
  // instead of overwriting newer data.
  const requestIdRef = useRef(0);

  const fetchEvents = useCallback(async (forceRefresh = false) => {
    const requestId = ++requestIdRef.current;

    // Warm the adjacent week when sitting on a week boundary, so crossing it
    // is instant too.
    const prefetchNeighborWeek = () => {
      const neighbor =
        selectedDate.dayOfWeek === 1 ? selectedDate.subtract({ days: 1 }) :
        selectedDate.dayOfWeek === 7 ? selectedDate.add({ days: 1 }) :
        null;
      if (neighbor) loadWeek(neighbor).catch(() => {});
    };

    // Cache hit: render synchronously, no spinner flash
    const cached = forceRefresh ? null : getCachedWeek(selectedDate);
    if (cached) {
      setEvents(eventsForDay(cached, selectedDate));
      setLoading(false);
      prefetchNeighborWeek();
      return;
    }

    setLoading(true);
    try {
      const weekEvents = await loadWeek(selectedDate, forceRefresh);
      if (requestId !== requestIdRef.current) return;
      setEvents(eventsForDay(weekEvents, selectedDate));
      prefetchNeighborWeek();
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to fetch calendar events:", err);
      setEvents([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Sync scroll position on mount to match the other columns
  useEffect(() => {
    const el = scrollRef.current;
    if (el && calendarScrollMetrics.scrollTop > 0) {
      el.scrollTop = calendarScrollMetrics.scrollTop;
    }
    // Only run once on mount — intentionally excluding scrollTop from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef]);

  const calendarColorMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      if (!map.has(event.calendarName)) {
        map.set(event.calendarName, map.size % EVENT_COLORS.length);
      }
    }
    return map;
  }, [events]);

  return (
    <div className="col-span-2">
      <header className="min-h-10 flex items-center justify-between mb-2">
        <h3 className="select-none text-sm font-semibold text-slate-700 dark:text-slate-300">
          Calendar Events
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fetchEvents(true)}
            disabled={loading}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
            title="Refresh calendar events"
          >
            <svg
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          {events.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {events.length} event{events.length !== 1 && "s"}
            </span>
          )}
        </div>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-950/30">
        <div className="flex h-full items-stretch">
          <div
            ref={scrollRef}
            className="relative min-w-0 flex-1 overflow-y-auto overflow-x-visible pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
            onScroll={onScroll}
          >
            <div
              className="relative"
              style={{
                height: `${24 * HOUR_HEIGHT + 40}px`,
                paddingTop: `${TIMELINE_PADDING_TOP}px`,
                paddingBottom: "40px",
              }}
            >
              <TimelineHourMarkers />

              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                </div>
              ) : (
                <>
                  <div className="relative ml-12">
                    {events.map((event) => {
                      const topY = isoToY(event.startTime, selectedDate);
                      const bottomY = isoToY(event.endTime, selectedDate);
                      const rawHeight = bottomY - topY;
                      const height = Math.max(MIN_EVENT_HEIGHT, rawHeight);
                      const color = getEventColor(event.calendarName, calendarColorMap);

                      return (
                        <div
                          key={event.uid}
                          className={`absolute left-0 right-4 rounded-lg border-l-3 ${color.bg} ${color.border} px-2 py-1 overflow-hidden group cursor-default transition-shadow hover:shadow-md`}
                          style={{
                            top: `${topY}px`,
                            height: `${height}px`,
                          }}
                          title={[
                            event.summary,
                            `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`,
                            event.location && `📍 ${event.location}`,
                            event.calendarName && `📅 ${event.calendarName}`,
                            event.attendees.length > 0 && `👥 ${event.attendees.join(", ")}`,
                            event.description,
                          ]
                            .filter(Boolean)
                            .join("\n")}
                        >
                          <div className={`text-xs font-medium truncate ${color.text}`}>
                            {event.summary}
                          </div>
                          {height >= 32 && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {formatTime(event.startTime)} – {formatTime(event.endTime)}
                            </div>
                          )}
                          {height >= 48 && event.location && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                              📍 {event.location}
                            </div>
                          )}
                          {height >= 64 && event.attendees.length > 0 && (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                              👥 {event.attendees.slice(0, 3).join(", ")}
                              {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {events.length === 0 && (
                    <div className="sticky inset-0 flex items-center justify-center backdrop-blur-md p-8 max-w-[360px] top-[200px] left-20">
                      <div className="p-6">
                        <div className="text-gray-400 dark:text-gray-500">
                          <svg
                            className="w-16 h-16 mx-auto mb-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            No calendar events
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            No events found for this day
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <CurrentTimeLine
                selectedDate={selectedDate}
                isClient={isClient}
                currentTime={currentTime}
              />
            </div>
          </div>
          <CalendarScrollbarMinimap
            events={events}
            scrollTop={calendarScrollMetrics.scrollTop}
            viewportHeight={calendarScrollMetrics.viewportHeight}
            scrollHeight={calendarScrollMetrics.scrollHeight}
            onJumpToRatio={onJumpMinimapToRatio}
            onDragViewport={onDragMinimap}
            isDraggingViewport={isDraggingCalendarMinimapViewport}
            setIsDraggingViewport={setIsDraggingCalendarMinimapViewport}
          />
        </div>
      </div>
    </div>
  );
}
