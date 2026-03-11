"use client";

import { useMemo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import type { TimeEntry } from "./utils";
import ScrollbarMinimap, {
  createEmptyMinimapCells,
  DEFAULT_MINIMAP_ROWS,
  getMinimapRowIndex,
} from "./ScrollbarMinimap";

const MINIMAP_COLUMNS = 1;
const MINIMAP_ROWS = DEFAULT_MINIMAP_ROWS;
const FALLBACK_COLOR = "rgb(107 114 128)";

interface ProjectScrollbarMinimapProps {
  entries: TimeEntry[];
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  onJumpToRatio: (ratio: number) => void;
  onDragViewport: (deltaRatio: number) => void;
  isDraggingViewport: boolean;
  setIsDraggingViewport: (isDragging: boolean) => void;
}

export default function ProjectScrollbarMinimap({
  entries,
  scrollTop,
  viewportHeight,
  scrollHeight,
  onJumpToRatio,
  onDragViewport,
  isDraggingViewport,
  setIsDraggingViewport,
}: ProjectScrollbarMinimapProps) {
  const minimapCells = useMemo(() => {
    const tz = Temporal.Now.timeZoneId();
    const cells = createEmptyMinimapCells(MINIMAP_ROWS, MINIMAP_COLUMNS, "No project entries");

    entries.forEach((entry) => {
      const start = Temporal.Instant.from(entry.startTime).toZonedDateTimeISO(tz);
      let end = Temporal.Instant.from(entry.endTime).toZonedDateTimeISO(tz);
      const endOfDay = start.withPlainTime(Temporal.PlainTime.from("23:59:59.999"));

      if (Temporal.ZonedDateTime.compare(end, endOfDay) > 0) {
        end = endOfDay;
      }

      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = Math.max(
        startMinutes,
        end.hour * 60 + end.minute + (end.second > 0 || end.millisecond > 0 ? 1 : 0),
      );
      const durationMinutes = Math.max(
        1,
        Number((end.epochNanoseconds - start.epochNanoseconds) / 60_000_000_000n),
      );
      const startRow = getMinimapRowIndex(startMinutes, MINIMAP_ROWS);
      const endRow = getMinimapRowIndex(endMinutes, MINIMAP_ROWS);
      const color = entry.project.color || FALLBACK_COLOR;
      const title = `${entry.project.client.name} • ${entry.project.name}${entry.description ? ` • ${entry.description}` : ""}`;

      for (let row = startRow; row <= endRow; row++) {
        const cellIndex = row * MINIMAP_COLUMNS;
        const strength = durationMinutes + (row === startRow ? 0.5 : 0);

        if (strength >= cells[cellIndex]!.strength) {
          cells[cellIndex] = { color, strength, title };
        }
      }
    });

    return cells;
  }, [entries]);

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