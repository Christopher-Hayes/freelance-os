"use client";

import { useMemo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import type { CalendarEvent } from "@/lib/webdav-provider";
import ScrollbarMinimap, {
  createEmptyMinimapCells,
  DEFAULT_MINIMAP_ROWS,
  getMinimapRowIndex,
} from "./ScrollbarMinimap";

const MINIMAP_COLUMNS = 1;
const MINIMAP_ROWS = DEFAULT_MINIMAP_ROWS;

// Hex colors that match the CalendarEventsColumn pastel palette
const CALENDAR_COLORS = [
  "rgb(139 92 246)",  // violet
  "rgb(14 165 233)",  // sky
  "rgb(245 158 11)",  // amber
  "rgb(16 185 129)",  // emerald
  "rgb(244 63 94)",   // rose
  "rgb(99 102 241)",  // indigo
];

interface CalendarScrollbarMinimapProps {
  events: CalendarEvent[];
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  onJumpToRatio: (ratio: number) => void;
  onDragViewport: (deltaRatio: number) => void;
  isDraggingViewport: boolean;
  setIsDraggingViewport: (isDragging: boolean) => void;
}

export default function CalendarScrollbarMinimap({
  events,
  scrollTop,
  viewportHeight,
  scrollHeight,
  onJumpToRatio,
  onDragViewport,
  isDraggingViewport,
  setIsDraggingViewport,
}: CalendarScrollbarMinimapProps) {
  const minimapCells = useMemo(() => {
    const tz = Temporal.Now.timeZoneId();
    const cells = createEmptyMinimapCells(MINIMAP_ROWS, MINIMAP_COLUMNS, "No calendar events");

    // Build a stable color map per calendar name
    const calendarColorMap = new Map<string, number>();
    for (const event of events) {
      if (!calendarColorMap.has(event.calendarName)) {
        calendarColorMap.set(event.calendarName, calendarColorMap.size % CALENDAR_COLORS.length);
      }
    }

    events.forEach((event) => {
      const start = Temporal.Instant.from(event.startTime).toZonedDateTimeISO(tz);
      let end = Temporal.Instant.from(event.endTime).toZonedDateTimeISO(tz);
      const endOfDay = start.withPlainTime(Temporal.PlainTime.from("23:59:59.999"));

      if (Temporal.ZonedDateTime.compare(end, endOfDay) > 0) {
        end = endOfDay;
      }

      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = Math.max(
        startMinutes,
        end.hour * 60 + end.minute + (end.second > 0 || end.millisecond > 0 ? 1 : 0),
      );
      const durationMinutes = Math.max(1, event.durationMinutes);
      const startRow = getMinimapRowIndex(startMinutes, MINIMAP_ROWS);
      const endRow = getMinimapRowIndex(endMinutes, MINIMAP_ROWS);
      const colorIdx = calendarColorMap.get(event.calendarName) ?? 0;
      const color = CALENDAR_COLORS[colorIdx % CALENDAR_COLORS.length]!;
      const title = `${event.summary}${event.calendarName ? ` (${event.calendarName})` : ""}`;

      for (let row = startRow; row <= endRow; row++) {
        const cellIndex = row * MINIMAP_COLUMNS;
        const strength = durationMinutes + (row === startRow ? 0.5 : 0);

        if (strength >= cells[cellIndex]!.strength) {
          cells[cellIndex] = { color, strength, title };
        }
      }
    });

    return cells;
  }, [events]);

  if (minimapCells.length === 0) {
    return null;
  }

  return (
    <ScrollbarMinimap
      cells={minimapCells}
      columns={MINIMAP_COLUMNS}
      rows={MINIMAP_ROWS}
      scrollTop={scrollTop}
      viewportHeight={viewportHeight}
      scrollHeight={scrollHeight}
      onJumpToRatio={onJumpToRatio}
      onDragViewport={onDragViewport}
      isDraggingViewport={isDraggingViewport}
      setIsDraggingViewport={setIsDraggingViewport}
    />
  );
}
