"use client";

import { memo, useMemo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import TimeEntryEditForm from "./TimeEntryEditForm";
import { HOUR_HEIGHT } from "./utils";

// Move utility functions outside component to prevent recreation on every render
const timeToY = (time: Temporal.ZonedDateTime): number => {
  const startOfDay = time.withPlainTime(Temporal.PlainTime.from("00:00"));
  const diffNs = time.epochNanoseconds - startOfDay.epochNanoseconds;
  const diffMs = Number(diffNs / 1_000_000n);
  const totalHours = diffMs / (1000 * 60 * 60);
  return totalHours * HOUR_HEIGHT;
};

const formatTime = (time: Temporal.ZonedDateTime): string => {
  return time.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const durationInMinutes = (start: Temporal.ZonedDateTime, end: Temporal.ZonedDateTime): number => {
  return Math.round(Number((end.epochNanoseconds - start.epochNanoseconds) / 60_000_000_000n));
};

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1]!, 16),
    g: parseInt(result[2]!, 16),
    b: parseInt(result[3]!, 16)
  } : { r: 34, g: 197, b: 94 };
};

interface TimeEntry {
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

interface Project {
  id: number;
  name: string;
  color: string;
  client: {
    name: string;
  };
}

interface TimeEntryBarProps {
  entry: TimeEntry;
  position: { column: number; totalColumns: number };
  isGhost?: boolean;
  isDragging?: boolean;
  draggedTimes?: { startTime: Temporal.ZonedDateTime; endTime: Temporal.ZonedDateTime };
  isEditing: boolean;
  projects: Project[];
  onDragStart: (e: React.MouseEvent, edge: "top" | "bottom", time: Temporal.ZonedDateTime) => void;
  onClick: (e: React.MouseEvent) => void;
  onSaveEdit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

const TimeEntryBar = memo(function TimeEntryBar({
  entry,
  position,
  isGhost = false,
  isDragging = false,
  draggedTimes,
  isEditing,
  projects,
  onDragStart,
  onClick,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: TimeEntryBarProps) {
  // Memoize start/end times calculation
  const { start, end } = useMemo(() => {
    const tz = Temporal.Now.timeZoneId();
    return {
      start: draggedTimes
        ? draggedTimes.startTime
        : Temporal.Instant.from(entry.startTime).toZonedDateTimeISO(tz),
      end: draggedTimes
        ? draggedTimes.endTime
        : Temporal.Instant.from(entry.endTime).toZonedDateTimeISO(tz),
    };
  }, [entry.startTime, entry.endTime, draggedTimes]);

  // Memoize position calculations
  const { top, height } = useMemo(() => {
    const topPos = timeToY(start);
    const bottom = timeToY(end);
    return {
      top: topPos,
      height: bottom - topPos,
    };
  }, [start, end]);

  // Memoize layout calculations
  const layout = useMemo(() => ({
    widthPercent: 100 / position.totalColumns,
    leftPercent: (position.column / position.totalColumns) * 100,
    gap: position.totalColumns > 1 ? 1 : 0,
  }), [position.column, position.totalColumns]);

  // Memoize color scheme
  const colorScheme = useMemo(() => {
    const projectColor = entry.project.color || '#22C55E';
    
    if (isGhost) {
      return { 
        bg: 'rgba(156, 163, 175, 0.2)', 
        bgDark: 'rgba(156, 163, 175, 0.3)', 
        border: 'rgb(156, 163, 175)', 
        text: 'rgb(75, 85, 99)', 
        textDark: 'rgb(156, 163, 175)' 
      };
    }
    
    const rgb = hexToRgb(projectColor);
    return { 
      bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
      bgDark: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`,
      border: projectColor,
      text: projectColor,
      textDark: projectColor
    };
  }, [entry.project.color, isGhost]);

  return (
    <div
      className={`timeline-entry group absolute flex items-center border-2 rounded px-2 ${
        isDragging ? "opacity-70" : ""
      } ${
        isGhost ? "justify-center opacity-50 border-dashed pointer-events-none" : ""
      } ${
        isEditing ? "overflow-visible z-50" : "overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
      }`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: "20px",
        left: `calc(${layout.leftPercent}% + ${layout.gap}px)`,
        right: `calc(${100 - layout.leftPercent - layout.widthPercent}% + ${layout.gap}px)`,
        backgroundColor: colorScheme.bg,
        borderColor: colorScheme.border,
      }}
      onClick={isEditing ? undefined : onClick}
    >
      {!isGhost && (
        <>
          {/* Top resize handle */}
          <div
            className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            style={{ backgroundColor: colorScheme.border }}
            onMouseDown={(e) => onDragStart(e, "top", start)}
          />

          {/* Content or Edit Form */}
          {isEditing ? (
            <TimeEntryEditForm
              entryId={entry.id}
              projectId={entry.projectId}
              description={entry.description}
              billable={entry.billable}
              startTime={start}
              endTime={end}
              projects={projects}
              onSubmit={onSaveEdit}
              onCancel={onCancelEdit}
              onDelete={onDelete}
            />
          ) : (
            <div className="py-2 text-xs flex flex-col gap-0.5">
              <div className="truncate flex gap-1" style={{ color: isDragging ? colorScheme.text : colorScheme.text }}>
                <span className="font-semibold">{entry.project.name}</span>
                <span className="opacity-60">({entry.project.client.name})</span>
              </div>
              {height >= 40 && entry.description && (
                <div className="text-xs truncate" style={{ color: colorScheme.text, opacity: 0.7 }}>
                  {entry.description}
                </div>
              )}
              {height > 100 && (
                <div className="text-[9px]" style={{ color: colorScheme.text, opacity: 0.7 }}>
                  {formatTime(start)}
                  {" - "}
                  {formatTime(end)}
                </div>
              )}
            </div>
          )}

          {/* Bottom resize handle */}
          <div
            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            style={{ backgroundColor: colorScheme.border }}
            onMouseDown={(e) => onDragStart(e, "bottom", end)}
          />
        </>
      )}
      
      {/* Ghost entry content */}
      {isGhost && (
        <div className="text-center py-2 text-xs">
          <div className="font-semibold text-black dark:text-white">
            {entry.project.name}
          </div>
          {height > 35 && (
            <div className="text-black dark:text-white text-[10px] mt-1">
              {formatTime(start)}
              {" - "}
              {formatTime(end)}
            </div>
          )}
          {height > 50 && (
            <div className="text-black dark:text-white text-[10px]">
              ({durationInMinutes(start, end)} min)
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default TimeEntryBar;
