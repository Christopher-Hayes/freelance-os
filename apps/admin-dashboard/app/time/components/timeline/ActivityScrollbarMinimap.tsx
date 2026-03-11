"use client";

import { useMemo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { formatAppTitle } from "@/lib/util";
import type { ActivitySession as ActivitySessionType } from "./utils";

const MINIMAP_COLUMNS = 2;
const MINIMAP_ROWS = 60;
const MINIMAP_DOT_SIZE = 5;
const MINIMAP_GRID_TEMPLATE_ROWS = `repeat(${MINIMAP_ROWS}, minmax(0, 1fr))`;
export const MINIMAP_HEIGHT_PX = 640;

function getMinimapRowIndex(totalMinutes: number) {
  return Math.max(0, Math.min(MINIMAP_ROWS - 1, Math.floor((totalMinutes / (24 * 60)) * MINIMAP_ROWS)));
}

interface ActivityScrollbarMinimapProps {
  sessions: ActivitySessionType[];
  colorMap: Map<string, string>;
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  onJumpToRatio: (ratio: number) => void;
  onDragViewport: (deltaRatio: number) => void;
  isDraggingViewport: boolean;
  setIsDraggingViewport: (isDragging: boolean) => void;
}

export default function ActivityScrollbarMinimap({
  sessions,
  colorMap,
  scrollTop,
  viewportHeight,
  scrollHeight,
  onJumpToRatio,
  onDragViewport,
  isDraggingViewport,
  setIsDraggingViewport,
}: ActivityScrollbarMinimapProps) {
  const minimapCells = useMemo(() => {
    const tz = Temporal.Now.timeZoneId();
    const cells = Array.from({ length: MINIMAP_ROWS * MINIMAP_COLUMNS }, () => ({
      color: null as string | null,
      strength: 0,
      title: "No activity",
    }));

    sessions.forEach((session) => {
      const start = Temporal.Instant.from(session.startTime).toZonedDateTimeISO(tz);
      let end = Temporal.Instant.from(session.endTime).toZonedDateTimeISO(tz);
      const endOfDay = start.withPlainTime(Temporal.PlainTime.from("23:59:59.999"));

      if (Temporal.ZonedDateTime.compare(end, endOfDay) > 0) {
        end = endOfDay;
      }

      const startMinutes = start.hour * 60 + start.minute;
      const endMinutes = Math.max(
        startMinutes,
        end.hour * 60 + end.minute + (end.second > 0 || end.millisecond > 0 ? 1 : 0)
      );
      const durationMinutes = Math.max(
        1,
        Number((end.epochNanoseconds - start.epochNanoseconds) / 60_000_000_000n)
      );
      const startRow = getMinimapRowIndex(startMinutes);
      const endRow = getMinimapRowIndex(endMinutes);
      const preferredColumn = session.id % MINIMAP_COLUMNS;
      const color = colorMap.get(session.appClass) ?? "rgb(107 114 128)";
      const title = `${formatAppTitle(session.appClass)} • ${Math.round(durationMinutes)}m`;

      for (let row = startRow; row <= endRow; row++) {
        const primaryIndex = row * MINIMAP_COLUMNS + preferredColumn;
        const secondaryIndex = row * MINIMAP_COLUMNS + ((preferredColumn + 1) % MINIMAP_COLUMNS);
        const strength = durationMinutes + (row === startRow ? 0.5 : 0);

        if (strength >= cells[primaryIndex]!.strength) {
          cells[primaryIndex] = { color, strength, title };
        } else if (strength >= cells[secondaryIndex]!.strength) {
          cells[secondaryIndex] = { color, strength, title };
        }
      }
    });

    return cells;
  }, [colorMap, sessions]);

  if (minimapCells.length === 0) {
    return null;
  }

  const viewportHeightPercent = Math.max((viewportHeight / Math.max(scrollHeight, 1)) * 100, 8);
  const maxViewportTop = Math.max(0, 100 - viewportHeightPercent);
  const viewportTravelRatio = Math.max(maxViewportTop / 100, 0.0001);
  const viewportTop = Math.max(0, Math.min((scrollTop / Math.max(scrollHeight, 1)) * 100, maxViewportTop));

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));

    if (target.dataset.viewport === "true") {
      target.setPointerCapture(event.pointerId);
      target.dataset.dragStartY = String(event.clientY);
      setIsDraggingViewport(true);
      return;
    }

    onJumpToRatio(ratio);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.viewport !== "true" || !target.hasPointerCapture(event.pointerId)) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const dragStartY = Number(target.dataset.dragStartY ?? event.clientY);
    const deltaRatio = ((event.clientY - dragStartY) / bounds.height) / viewportTravelRatio;

    target.dataset.dragStartY = String(event.clientY);
    onDragViewport(deltaRatio);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.viewport === "true" && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
      delete target.dataset.dragStartY;
    }

    setIsDraggingViewport(false);
  };

  return (
    <div className="sticky top-0 z-20 p-1 flex bg-gray-100 dark:bg-gray-800 border-l border-gray-300 dark:border-gray-700 shrink-0 justify-center self-stretch">
      <div
        className="relative h-full w-4 cursor-pointer"
        style={{ height: `${MINIMAP_HEIGHT_PX}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="grid h-full w-4 grid-cols-2 gap-x-0.5 gap-y-px"
          style={{ gridTemplateRows: MINIMAP_GRID_TEMPLATE_ROWS }}
        >
          {minimapCells.map((cell, index) => (
            <div
              key={index}
              className="rounded-xs bg-gray-500/20"
              style={{
                width: `${MINIMAP_DOT_SIZE}px`,
                height: `${MINIMAP_DOT_SIZE}px`,
                backgroundColor: cell.color ?? undefined,
                borderColor: cell.color ?? undefined,
                opacity: cell.color ? 0.9 : 0.28,
              }}
              title={cell.title}
            />
          ))}
        </div>
        <div
          data-viewport="true"
          className={`absolute inset-x-0 rounded-sm border border-gray-900/35 bg-gray-700/20 shadow-sm backdrop-blur-[1px] dark:border-gray-100/25 dark:bg-gray-100/10 ${isDraggingViewport ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            top: `${viewportTop}%`,
            height: `${Math.min(viewportHeightPercent, 100 - viewportTop)}%`,
            minHeight: "36px",
          }}
          title="Visible timeline area"
        />
      </div>
    </div>
  );
}