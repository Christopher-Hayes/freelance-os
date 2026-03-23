"use client";

import { useEffect, useState, useCallback } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { authFetch } from "@/lib/util";
import {
  type TimeEntry,
  TIMELINE_PADDING_TOP,
  TIMELINE_DRAG_OFFSET,
  yToTime,
  snapTo15Min,
} from "../utils";

interface DraggingState {
  entryId: number;
  edge: "top" | "bottom";
  initialY: number;
  initialTime: Temporal.ZonedDateTime;
}

interface DraggedTimesMap {
  [key: number]: { startTime: Temporal.ZonedDateTime; endTime: Temporal.ZonedDateTime };
}

interface UseDragResizeReturn {
  dragging: DraggingState | null;
  draggedTimes: DraggedTimesMap;
  justFinishedDragging: boolean;
  setJustFinishedDragging: React.Dispatch<React.SetStateAction<boolean>>;
  handleDragStart: (
    e: React.MouseEvent,
    entryId: number,
    edge: "top" | "bottom",
    initialTime: Temporal.ZonedDateTime
  ) => void;
}

export function useDragResize(
  timeEntries: TimeEntry[],
  setTimeEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>,
  selectedDate: Temporal.PlainDate,
  timelineRef: React.RefObject<HTMLDivElement | null>,
  fetchDayData: () => Promise<void>
): UseDragResizeReturn {
  const [dragging, setDragging] = useState<DraggingState | null>(null);
  const [draggedTimes, setDraggedTimes] = useState<DraggedTimesMap>({});
  const [justFinishedDragging, setJustFinishedDragging] = useState(false);

  const handleDragStart = useCallback(
    (
      e: React.MouseEvent,
      entryId: number,
      edge: "top" | "bottom",
      initialTime: Temporal.ZonedDateTime
    ) => {
      e.stopPropagation();
      e.preventDefault();
      setDragging({ entryId, edge, initialY: e.clientY, initialTime });
    },
    []
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
      const newTime = snapTo15Min(yToTime(y, selectedDate));

      const entry = timeEntries.find((e) => e.id === dragging.entryId);
      if (!entry) return;

      const draggedEntry = draggedTimes[dragging.entryId];
      const tz = Temporal.Now.timeZoneId();
      const currentStart = draggedEntry
        ? draggedEntry.startTime
        : Temporal.Instant.from(entry.startTime).toZonedDateTimeISO(tz);
      const currentEnd = draggedEntry
        ? draggedEntry.endTime
        : Temporal.Instant.from(entry.endTime).toZonedDateTimeISO(tz);

      if (dragging.edge === "top") {
        if (Temporal.ZonedDateTime.compare(newTime, currentEnd) < 0) {
          setDraggedTimes((prev) => ({
            ...prev,
            [dragging.entryId]: { startTime: newTime, endTime: currentEnd },
          }));
        }
      } else {
        if (Temporal.ZonedDateTime.compare(newTime, currentStart) > 0) {
          setDraggedTimes((prev) => ({
            ...prev,
            [dragging.entryId]: { startTime: currentStart, endTime: newTime },
          }));
        }
      }
    };

    const handleMouseUp = async () => {
      if (dragging) {
        const draggedEntry = draggedTimes[dragging.entryId];
        if (draggedEntry) {
          const { startTime, endTime } = draggedEntry;

          // Optimistic update
          setTimeEntries((prev) =>
            prev.map((entry) =>
              entry.id === dragging.entryId
                ? {
                    ...entry,
                    startTime: startTime.toString(),
                    endTime: endTime.toString(),
                    durationMinutes: Math.round(
                      Number(
                        (endTime.epochNanoseconds - startTime.epochNanoseconds) / 60_000_000_000n
                      )
                    ),
                  }
                : entry
            )
          );

          const durationMinutes = Math.round(
            Number((endTime.epochNanoseconds - startTime.epochNanoseconds) / 60_000_000_000n)
          );

          authFetch(`/api/time/${dragging.entryId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startTime: startTime.toString(),
              endTime: endTime.toString(),
              durationMinutes,
            }),
          }).catch((err) => {
            console.error("Error updating time entry:", err);
            fetchDayData();
          });
        }
        setJustFinishedDragging(true);
      }
      setDragging(null);
      setDraggedTimes({});
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, timeEntries, draggedTimes, selectedDate, timelineRef, setTimeEntries, fetchDayData]);

  return { dragging, draggedTimes, justFinishedDragging, setJustFinishedDragging, handleDragStart };
}
