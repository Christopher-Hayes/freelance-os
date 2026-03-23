"use client";

import { useEffect, useState, useCallback } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { toast } from "@repo/ui";
import { authFetch } from "@/lib/util";
import {
  type TimeEntry,
  type Project,
  TIMELINE_PADDING_TOP,
  TIMELINE_DRAG_OFFSET,
  yToTime,
  snapTo15Min,
} from "../utils";

interface CreatingEntry {
  startTime: Temporal.ZonedDateTime;
  endTime: Temporal.ZonedDateTime;
  y: number;
}

interface GhostEntry {
  startTime: Temporal.ZonedDateTime;
  endTime: Temporal.ZonedDateTime;
}

interface DraggingNewEntry {
  startY: number;
  startTime: Temporal.ZonedDateTime;
}

interface UseTimelineInteractionsReturn {
  editingEntryId: number | null;
  setEditingEntryId: React.Dispatch<React.SetStateAction<number | null>>;
  creatingEntry: CreatingEntry | null;
  setCreatingEntry: React.Dispatch<React.SetStateAction<CreatingEntry | null>>;
  ghostEntry: GhostEntry | null;
  setGhostEntry: React.Dispatch<React.SetStateAction<GhostEntry | null>>;
  draggingNewEntry: DraggingNewEntry | null;
  handleTimelineMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTimelineMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTimelineMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleTimelineMouseLeave: () => void;
  handleEntryClick: (entryId: number) => (e: React.MouseEvent) => void;
  handleCreateEntry: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleSaveEdit: (entryId: number) => (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleDelete: (entryId: number) => () => Promise<void>;
  handleMergeEntries: (entryId: number, nextEntryId: number) => () => Promise<void>;
  mergingEntryId: number | null;
}

export function useTimelineInteractions(
  selectedDate: Temporal.PlainDate,
  timelineRef: React.RefObject<HTMLDivElement | null>,
  draggingResize: { entryId: number } | null,
  justFinishedDragging: boolean,
  setJustFinishedDragging: React.Dispatch<React.SetStateAction<boolean>>,
  fetchDayData: () => Promise<void>
): UseTimelineInteractionsReturn {
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [creatingEntry, setCreatingEntry] = useState<CreatingEntry | null>(null);
  const [ghostEntry, setGhostEntry] = useState<GhostEntry | null>(null);
  const [draggingNewEntry, setDraggingNewEntry] = useState<DraggingNewEntry | null>(null);
  const [mergingEntryId, setMergingEntryId] = useState<number | null>(null);

  // Dismiss entry creation on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && creatingEntry) setCreatingEntry(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [creatingEntry]);

  // ── Timeline mouse interaction handlers ─────────────────────────────

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingResize) return;
      if (justFinishedDragging) {
        setJustFinishedDragging(false);
        return;
      }
      if ((e.target as HTMLElement).closest(".timeline-entry")) return;
      if ((e.target as HTMLElement).closest(".timeline-session")) return;

      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      if (e.clientX > rect.right - 20) return; // scrollbar

      setEditingEntryId(null);

      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
      const clickTime = snapTo15Min(yToTime(y, selectedDate));

      setDraggingNewEntry({ startY: y, startTime: clickTime });
    },
    [draggingResize, justFinishedDragging, setJustFinishedDragging, selectedDate, timelineRef]
  );

  const handleTimelineMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingResize) return;
      if ((e.target as HTMLElement).closest(".timeline-entry")) {
        setGhostEntry(null);
        return;
      }

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
      const hoverTime = snapTo15Min(yToTime(y, selectedDate));

      if (draggingNewEntry) {
        const startTime = draggingNewEntry.startTime;
        if (Temporal.ZonedDateTime.compare(hoverTime, startTime) > 0) {
          setGhostEntry({ startTime, endTime: hoverTime });
        } else if (Temporal.ZonedDateTime.compare(hoverTime, startTime) < 0) {
          setGhostEntry({ startTime: hoverTime, endTime: startTime });
        }
      } else {
        setGhostEntry({ startTime: hoverTime, endTime: hoverTime.add({ hours: 1 }) });
      }
    },
    [draggingResize, draggingNewEntry, selectedDate, timelineRef]
  );

  const handleTimelineMouseLeave = useCallback(() => {
    if (!draggingNewEntry) setGhostEntry(null);
  }, [draggingNewEntry]);

  const handleTimelineMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!draggingNewEntry) return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
      const endTimeSnapped = snapTo15Min(yToTime(y, selectedDate));

      let startTime = draggingNewEntry.startTime;
      let endTime = endTimeSnapped;

      if (Temporal.ZonedDateTime.compare(endTime, startTime) < 0) {
        [startTime, endTime] = [endTime, startTime];
      }

      const durationMs = Number(
        (endTime.epochNanoseconds - startTime.epochNanoseconds) / 1_000_000n
      );
      if (durationMs < 15 * 60 * 1000) {
        endTime = startTime.add({ hours: 1 });
      }

      const viewportHeight = window.innerHeight;
      const dialogHeight = 500;
      const idealY = Math.max(
        20,
        Math.min(viewportHeight - dialogHeight - 20, (viewportHeight - dialogHeight) / 2)
      );

      setCreatingEntry({ startTime, endTime, y: idealY });
      setDraggingNewEntry(null);
      setGhostEntry(null);
    },
    [draggingNewEntry, selectedDate, timelineRef]
  );

  // ── Entry CRUD handlers ─────────────────────────────────────────────

  const handleEntryClick = useCallback(
    (entryId: number) => (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains("cursor-ns-resize")) return;
      if ((e.target as HTMLElement).closest("form")) return;
      if (draggingResize) return;
      setEditingEntryId((prev) => (prev === entryId ? null : entryId));
    },
    [draggingResize]
  );

  const handleCreateEntry = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!creatingEntry) return;

      const formData = new FormData(e.currentTarget);
      const projectId = parseInt(formData.get("projectId") as string);
      const description = formData.get("description") as string;
      const billable = formData.get("billable") === "on";

      try {
        const durationMinutes = Math.round(
          Number(
            (creatingEntry.endTime.epochNanoseconds - creatingEntry.startTime.epochNanoseconds) /
              60_000_000_000n
          )
        );
        const response = await authFetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            description: description || null,
            startTime: creatingEntry.startTime.toString(),
            endTime: creatingEntry.endTime.toString(),
            durationMinutes,
            billable,
          }),
        });
        if (!response.ok) throw new Error("Failed to create");
        await fetchDayData();
        setCreatingEntry(null);
      } catch (error) {
        console.error("Error creating entry:", error);
        toast.error("Failed to create entry");
      }
    },
    [creatingEntry, fetchDayData]
  );

  const handleSaveEdit = useCallback(
    (entryId: number) => async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const formData = new FormData(e.currentTarget);
      const projectId = parseInt(formData.get("projectId") as string);
      const description = formData.get("description") as string;
      const billable = formData.get("billable") === "on";

      try {
        const response = await authFetch(`/api/time/${entryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, description: description || null, billable }),
        });
        if (!response.ok) throw new Error("Failed to update");
        await fetchDayData();
        setEditingEntryId(null);
      } catch (error) {
        console.error("Error updating entry:", error);
        toast.error("Failed to update entry");
      }
    },
    [fetchDayData]
  );

  const handleDelete = useCallback(
    (entryId: number) => async () => {
      try {
        const response = await authFetch(`/api/time/${entryId}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Failed to delete");
        await fetchDayData();
        setEditingEntryId(null);
      } catch (error) {
        console.error("Error deleting entry:", error);
        toast.error("Failed to delete entry");
      }
    },
    [fetchDayData]
  );

  const handleMergeEntries = useCallback(
    (entryId: number, nextEntryId: number) => async () => {
      const { mergeTimeEntries } = await import("@/lib/time-actions");
      setMergingEntryId(entryId);
      try {
        await mergeTimeEntries(entryId, nextEntryId);
        await fetchDayData();
        toast.success("Entries merged successfully!");
      } catch (error: any) {
        console.error("Error merging entries:", error);
        toast.error(error.message || "Failed to merge entries");
      } finally {
        setMergingEntryId(null);
      }
    },
    [fetchDayData]
  );

  return {
    editingEntryId,
    setEditingEntryId,
    creatingEntry,
    setCreatingEntry,
    ghostEntry,
    setGhostEntry,
    draggingNewEntry,
    handleTimelineMouseDown,
    handleTimelineMouseMove,
    handleTimelineMouseUp,
    handleTimelineMouseLeave,
    handleEntryClick,
    handleCreateEntry,
    handleSaveEdit,
    handleDelete,
    handleMergeEntries,
    mergingEntryId,
  };
}
