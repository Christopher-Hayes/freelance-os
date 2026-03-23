"use client";

import React from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { OptionsMenu, OptionsMenuItem, OptionsMenuSeparator } from "@repo/ui";
import { hasActiveJobForDate } from "@/lib/job-utils";
import { throttle } from "@/lib/util";
import type { AiJobWithDisplay } from "@freelance-os/types";
import TimelineHourMarkers from "./TimelineHourMarkers";
import CurrentTimeLine from "./CurrentTimeLine";
import TimeEntryBar from "./TimeEntryBar";
import ProjectScrollbarMinimap from "./ProjectScrollbarMinimap";
import TimeEntryCreationDialog from "./TimeEntryCreationDialog";
import {
  type TimeEntry,
  type Project,
  HOUR_HEIGHT,
  TIMELINE_PADDING_TOP,
  MERGE_THRESHOLD_MINUTES,
  formatDateStr,
} from "./utils";

interface ScrollMetrics {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
}

interface ProjectTrackingColumnProps {
  // Data
  timeEntries: TimeEntry[];
  projects: Project[];
  loading: boolean;
  jobs: AiJobWithDisplay[];
  selectedDate: Temporal.PlainDate;
  // Drag/interaction state
  dragging: {
    entryId: number;
    edge: "top" | "bottom";
    initialY: number;
    initialTime: Temporal.ZonedDateTime;
  } | null;
  draggedTimes: {
    [key: number]: { startTime: Temporal.ZonedDateTime; endTime: Temporal.ZonedDateTime };
  };
  ghostEntry: {
    startTime: Temporal.ZonedDateTime;
    endTime: Temporal.ZonedDateTime;
  } | null;
  draggingNewEntry: {
    startY: number;
    startTime: Temporal.ZonedDateTime;
  } | null;
  editingEntryId: number | null;
  overlapPositions: Record<number, { column: number; totalColumns: number }>;
  mergingEntryId: number | null;
  loadingAutofill: boolean;
  importingRescueTimeProjects: boolean;
  mergingRescueTimeProjects: boolean;
  // Entry creation dialog
  creatingEntry: {
    startTime: Temporal.ZonedDateTime;
    endTime: Temporal.ZonedDateTime;
    y: number;
  } | null;
  // Timeline display
  isClient: boolean;
  currentTime: Temporal.ZonedDateTime;
  // Scroll/minimap
  projectScrollMetrics: ScrollMetrics;
  isDraggingProjectMinimapViewport: boolean;
  setIsDraggingProjectMinimapViewport: (v: boolean) => void;
  // Handlers
  onAutofill: () => void;
  onMergeRescueTimeProjects: () => void;
  onClearDayEntries: () => void;
  onImportProjectTimesFromRescueTime: () => void;
  onTimelineMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTimelineMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTimelineMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTimelineMouseLeave: () => void;
  onTimelineScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onDragStart: (
    e: React.MouseEvent,
    entryId: number,
    edge: "top" | "bottom",
    initialTime: Temporal.ZonedDateTime
  ) => void;
  onEntryClick: (entryId: number) => (e: React.MouseEvent) => void;
  onSaveEdit: (entryId: number) => (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onDelete: (entryId: number) => () => Promise<void>;
  onMergeEntries: (entryId: number, nextEntryId: number) => () => Promise<void>;
  onCancelEdit: () => void;
  onCreateEntry: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancelCreate: () => void;
  onJumpMinimapToRatio: (ratio: number) => void;
  onDragMinimap: (deltaRatio: number) => void;
  setGhostEntry: (
    entry: { startTime: Temporal.ZonedDateTime; endTime: Temporal.ZonedDateTime } | null
  ) => void;
  // Ref
  timelineRef: React.RefObject<HTMLDivElement | null>;
}

export default function ProjectTrackingColumn({
  timeEntries,
  projects,
  loading,
  jobs,
  selectedDate,
  dragging,
  draggedTimes,
  ghostEntry,
  draggingNewEntry,
  editingEntryId,
  overlapPositions,
  mergingEntryId,
  loadingAutofill,
  importingRescueTimeProjects,
  mergingRescueTimeProjects,
  creatingEntry,
  isClient,
  currentTime,
  projectScrollMetrics,
  isDraggingProjectMinimapViewport,
  setIsDraggingProjectMinimapViewport,
  onAutofill,
  onMergeRescueTimeProjects,
  onClearDayEntries,
  onImportProjectTimesFromRescueTime,
  onTimelineMouseDown,
  onTimelineMouseMove,
  onTimelineMouseUp,
  onTimelineMouseLeave,
  onTimelineScroll,
  onDragStart,
  onEntryClick,
  onSaveEdit,
  onDelete,
  onMergeEntries,
  onCancelEdit,
  onCreateEntry,
  onCancelCreate,
  onJumpMinimapToRatio,
  onDragMinimap,
  setGhostEntry,
  timelineRef,
}: ProjectTrackingColumnProps) {
  const dateStr = formatDateStr(selectedDate);
  const isAutofillActive = loadingAutofill || hasActiveJobForDate(jobs, dateStr);

  const renderTimeEntries = () => {
    const entries = [...timeEntries];

    if (ghostEntry) {
      entries.push({
        id: -1,
        projectId: 0,
        description: null,
        startTime: ghostEntry.startTime.toString(),
        endTime: ghostEntry.endTime.toString(),
        durationMinutes: Math.round(
          Number(
            (ghostEntry.endTime.epochNanoseconds - ghostEntry.startTime.epochNanoseconds) /
              60_000_000_000n
          )
        ),
        billable: true,
        project: {
          id: 0,
          name: draggingNewEntry ? "Release to create" : "Click & drag to create",
          color: "#9CA3AF",
          client: { name: "" },
        },
      } as TimeEntry);
    }

    // Sort entries by start time to check for adjacent entries
    const sortedEntries = [...entries].sort((a, b) => {
      const aTime = Temporal.Instant.from(a.startTime);
      const bTime = Temporal.Instant.from(b.startTime);
      return Temporal.Instant.compare(aTime, bTime);
    });

    // Build a map of which entries can be merged
    const canMergeMap = new Map<number, number>(); // entryId -> nextEntryId to merge with

    for (let i = 0; i < sortedEntries.length - 1; i++) {
      const currentEntry = sortedEntries[i]!;
      const nextEntry = sortedEntries[i + 1]!;

      // Skip ghost entries
      if (currentEntry.id === -1 || nextEntry.id === -1) continue;

      // Check if they're the same project
      if (currentEntry.projectId !== nextEntry.projectId) continue;

      const currentEnd = Temporal.Instant.from(currentEntry.endTime);
      const nextStart = Temporal.Instant.from(nextEntry.startTime);

      // Calculate gap in minutes
      const gapNs = nextStart.epochNanoseconds - currentEnd.epochNanoseconds;
      const gapMinutes = Number(gapNs / 60_000_000_000n);

      // If gap is within threshold, mark as mergeable
      if (gapMinutes >= 0 && gapMinutes <= MERGE_THRESHOLD_MINUTES) {
        canMergeMap.set(currentEntry.id, nextEntry.id);
      }
    }

    return entries.map((entry) => {
      const isGhost = entry.id === -1;
      const position = isGhost
        ? { column: 0, totalColumns: 1 }
        : overlapPositions[entry.id] || { column: 0, totalColumns: 1 };

      const canMerge = canMergeMap.has(entry.id);
      const nextEntryId = canMergeMap.get(entry.id);

      return (
        <TimeEntryBar
          key={entry.id}
          entry={entry}
          position={position}
          isGhost={isGhost}
          isDragging={dragging?.entryId === entry.id}
          draggedTimes={draggedTimes[entry.id]}
          isEditing={editingEntryId === entry.id}
          projects={projects}
          canMerge={canMerge}
          isMerging={mergingEntryId === entry.id}
          onDragStart={(e, edge, time) => onDragStart(e, entry.id, edge, time)}
          onClick={onEntryClick(entry.id)}
          onSaveEdit={onSaveEdit(entry.id)}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete(entry.id)}
          onMerge={canMerge && nextEntryId ? onMergeEntries(entry.id, nextEntryId) : undefined}
        />
      );
    });
  };

  return (
    <div className="col-span-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="select-none text-sm font-semibold text-slate-700 dark:text-slate-300">
          Project Tracking
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onAutofill}
            disabled={isAutofillActive}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/30"
            title={
              isAutofillActive
                ? "Autofill in progress..."
                : "Use AI to suggest time entries based on app activity"
            }
          >
            <svg
              className={`w-4 h-4 ${isAutofillActive ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isAutofillActive ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              )}
            </svg>
            {isAutofillActive ? "Processing..." : "Autofill"}
          </button>
          <OptionsMenu label="Project Tracking options">
            <OptionsMenuItem
              onClick={onMergeRescueTimeProjects}
              disabled={mergingRescueTimeProjects}
              icon={
                mergingRescueTimeProjects ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )
              }
            >
              {mergingRescueTimeProjects ? "Merging..." : "Merge RescueTime project entries"}
            </OptionsMenuItem>
            <OptionsMenuSeparator />
            <OptionsMenuItem
              onClick={onClearDayEntries}
              disabled={loading || timeEntries.length === 0}
              tone="danger"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              }
            >
              Clear today&apos;s entries
            </OptionsMenuItem>
          </OptionsMenu>
        </div>
      </div>
      <div className="relative flex overflow-hidden rounded-2xl border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-950/30">
        <div
          ref={timelineRef}
          className="relative min-w-0 flex-1 overflow-y-auto overflow-x-visible cursor-crosshair pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
          onMouseDown={onTimelineMouseDown}
          onMouseMove={throttle(onTimelineMouseMove, 20)}
          onMouseUp={onTimelineMouseUp}
          onMouseLeave={onTimelineMouseLeave}
          onScroll={throttle(onTimelineScroll, 20)}
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
                <div className="relative ml-12">{renderTimeEntries()}</div>
                {timeEntries.length === 0 && (
                  <div className="sticky inset-0 flex items-center justify-center backdrop-blur-md p-8 max-w-[360px] top-[200px] left-20">
                    <div className="text-center space-y-4 p-6">
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
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          No project time entries
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Click &amp; drag to create, use Autofill, or import from RescueTime
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onImportProjectTimesFromRescueTime();
                        }}
                        onMouseEnter={() => {
                          // Hide the ghost entry on hover to prevent it from interfering with the button hover state
                          if (!draggingNewEntry) {
                            setGhostEntry(null);
                          }
                        }}
                        onMouseMove={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        disabled={importingRescueTimeProjects}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-slate-900"
                      >
                        {importingRescueTimeProjects ? (
                          <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Importing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Import from RescueTime
                          </>
                        )}
                      </button>
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
        <ProjectScrollbarMinimap
          entries={timeEntries}
          scrollTop={projectScrollMetrics.scrollTop}
          viewportHeight={projectScrollMetrics.viewportHeight}
          scrollHeight={projectScrollMetrics.scrollHeight}
          onJumpToRatio={onJumpMinimapToRatio}
          onDragViewport={onDragMinimap}
          isDraggingViewport={isDraggingProjectMinimapViewport}
          setIsDraggingViewport={setIsDraggingProjectMinimapViewport}
        />
      </div>

      {creatingEntry && (
        <TimeEntryCreationDialog
          startTime={creatingEntry.startTime}
          endTime={creatingEntry.endTime}
          y={creatingEntry.y}
          projects={projects}
          onSubmit={onCreateEntry}
          onCancel={onCancelCreate}
        />
      )}
    </div>
  );
}
