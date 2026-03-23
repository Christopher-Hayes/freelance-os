"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { useJobs } from "@/components/JobsProvider";
import { isAppHidden } from "@/lib/util";
import DateNavigationHeader from "./timeline/DateNavigationHeader";
import AppActivityColumn from "./timeline/AppActivityColumn";
import ProjectTrackingColumn from "./timeline/ProjectTrackingColumn";
import AppContextMenu from "./timeline/AppContextMenu";
import {
  type ActivitySession as ActivitySessionType,
  HOUR_HEIGHT,
  mergeAdjacentSessions,
  buildAppColorMap,
} from "./timeline/utils";
import { calculateTimeEntryOverlaps } from "./timeline/overlapCalculations";
import {
  useDayTimelineData,
  useDragResize,
  useScrollSync,
  useTimelineInteractions,
  useAppContextMenu,
  useColumnActions,
} from "./timeline/hooks";

interface DayTimelineProps {
  selectedDate: Temporal.PlainDate;
  onDateChange: (date: Temporal.PlainDate) => void;
}

export default function DayTimeline({ selectedDate, onDateChange }: DayTimelineProps) {
  const { jobs } = useJobs();

  // ── Refs ─────────────────────────────────────────────────────────────
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ── Data ─────────────────────────────────────────────────────────────
  const {
    sessions,
    timeEntries,
    projects,
    loading,
    timeAgo,
    isClient,
    currentTime,
    fetchDayData,
    setTimeEntries,
  } = useDayTimelineData(selectedDate, jobs);

  // ── Drag-to-resize ───────────────────────────────────────────────────
  const {
    dragging,
    draggedTimes,
    justFinishedDragging,
    setJustFinishedDragging,
    handleDragStart,
  } = useDragResize(timeEntries, setTimeEntries, selectedDate, timelineRef, fetchDayData);

  // ── Timeline interactions (create/edit/delete entries) ───────────────
  const {
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
  } = useTimelineInteractions(
    selectedDate,
    timelineRef,
    dragging,
    justFinishedDragging,
    setJustFinishedDragging,
    fetchDayData
  );

  // ── App context menu ─────────────────────────────────────────────────
  const {
    appContextMenu,
    setAppContextMenu,
    handleSessionContextMenu,
    handleSessionClick,
    handleRenameApp,
    handleHideApp,
  } = useAppContextMenu(fetchDayData);

  // ── Column-level actions (RescueTime, autofill, clear) ───────────────
  const {
    importingRescueTime,
    mergingRescueTimeActivity,
    handleImportFromRescueTime,
    handleMergeRescueTimeActivity,
    handleDeleteDayActivity,
    loadingAutofill,
    importingRescueTimeProjects,
    mergingRescueTimeProjects,
    handleAutofill,
    handleImportProjectTimesFromRescueTime,
    handleMergeRescueTimeProjects,
    handleClearDayEntries,
  } = useColumnActions(selectedDate, sessions, timeEntries, fetchDayData, setEditingEntryId);

  // ── Derived/memoized values ──────────────────────────────────────────
  const overlapPositions = useMemo(
    () => calculateTimeEntryOverlaps(timeEntries, draggedTimes),
    [timeEntries, draggedTimes]
  );

  const visibleSessions = useMemo(
    () => sessions.filter((session: ActivitySessionType) => !isAppHidden(session.appClass)),
    [sessions]
  );

  const mergedVisibleSessions = useMemo(
    () => mergeAdjacentSessions(visibleSessions),
    [visibleSessions]
  );

  const minimapColorMap = useMemo(
    () => buildAppColorMap(mergedVisibleSessions),
    [mergedVisibleSessions]
  );

  // ── Scroll synchronisation ───────────────────────────────────────────
  const {
    activityScrollMetrics,
    projectScrollMetrics,
    isDraggingActivityMinimapViewport,
    setIsDraggingActivityMinimapViewport,
    isDraggingProjectMinimapViewport,
    setIsDraggingProjectMinimapViewport,
    handleActivityScroll,
    handleTimelineScroll,
    jumpActivityMinimapToRatio,
    dragActivityMinimapViewport,
    jumpProjectMinimapToRatio,
    dragProjectMinimapViewport,
  } = useScrollSync(
    activityScrollRef,
    timelineRef,
    selectedDate,
    loading,
    mergedVisibleSessions
  );

  // ── Scroll to current time or ~30% on date change ────────────────────
  useEffect(() => {
    const timeline = timelineRef.current;
    const today = Temporal.Now.plainDateISO();
    if (timeline) {
      if (Temporal.PlainDate.compare(selectedDate, today) === 0) {
        const now = Temporal.Now.zonedDateTimeISO();
        const hours = now.hour + now.minute / 60;
        timeline.scrollTop = Math.max(0, hours * HOUR_HEIGHT - timeline.clientHeight / 2);
      } else {
        timeline.scrollTop = timeline.scrollHeight * 0.3;
      }
    }
  }, [selectedDate]);

  // ── Navigation ────────────────────────────────────────────────────────
  const changeDay = useCallback(
    (delta: number) => onDateChange(selectedDate.add({ days: delta })),
    [onDateChange, selectedDate]
  );
  const goToToday = useCallback(
    () => onDateChange(Temporal.Now.plainDateISO()),
    [onDateChange]
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm ring-1 ring-white/60 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/90 dark:ring-white/5">
      <DateNavigationHeader
        selectedDate={selectedDate}
        onPrevDay={() => changeDay(-1)}
        onNextDay={() => changeDay(1)}
        onToday={goToToday}
        onDateSelect={onDateChange}
      />

      <div className="p-4 relative" style={dragging ? { userSelect: "none" } : {}}>
        {dragging && (
          <div className="fixed inset-0 z-50" style={{ cursor: "ns-resize" }} />
        )}

        <div className="grid grid-cols-5 gap-4">
          <AppActivityColumn
            sessions={sessions}
            visibleSessions={visibleSessions}
            mergedVisibleSessions={mergedVisibleSessions}
            minimapColorMap={minimapColorMap}
            loading={loading}
            timeAgo={timeAgo}
            importingRescueTime={importingRescueTime}
            mergingRescueTimeActivity={mergingRescueTimeActivity}
            activityScrollMetrics={activityScrollMetrics}
            isDraggingActivityMinimapViewport={isDraggingActivityMinimapViewport}
            setIsDraggingActivityMinimapViewport={setIsDraggingActivityMinimapViewport}
            isClient={isClient}
            selectedDate={selectedDate}
            currentTime={currentTime}
            onRefresh={fetchDayData}
            onMergeRescueTimeActivity={handleMergeRescueTimeActivity}
            onDeleteDayActivity={handleDeleteDayActivity}
            onImportFromRescueTime={handleImportFromRescueTime}
            onSessionClick={handleSessionClick}
            onSessionContextMenu={handleSessionContextMenu}
            onScroll={handleActivityScroll}
            onJumpMinimapToRatio={jumpActivityMinimapToRatio}
            onDragMinimap={dragActivityMinimapViewport}
            scrollRef={activityScrollRef}
          />

          <ProjectTrackingColumn
            timeEntries={timeEntries}
            projects={projects}
            loading={loading}
            jobs={jobs}
            selectedDate={selectedDate}
            dragging={dragging}
            draggedTimes={draggedTimes}
            ghostEntry={ghostEntry}
            draggingNewEntry={draggingNewEntry}
            editingEntryId={editingEntryId}
            overlapPositions={overlapPositions}
            mergingEntryId={mergingEntryId}
            loadingAutofill={loadingAutofill}
            importingRescueTimeProjects={importingRescueTimeProjects}
            mergingRescueTimeProjects={mergingRescueTimeProjects}
            creatingEntry={creatingEntry}
            isClient={isClient}
            currentTime={currentTime}
            projectScrollMetrics={projectScrollMetrics}
            isDraggingProjectMinimapViewport={isDraggingProjectMinimapViewport}
            setIsDraggingProjectMinimapViewport={setIsDraggingProjectMinimapViewport}
            onAutofill={handleAutofill}
            onMergeRescueTimeProjects={handleMergeRescueTimeProjects}
            onClearDayEntries={handleClearDayEntries}
            onImportProjectTimesFromRescueTime={handleImportProjectTimesFromRescueTime}
            onTimelineMouseDown={handleTimelineMouseDown}
            onTimelineMouseMove={handleTimelineMouseMove}
            onTimelineMouseUp={handleTimelineMouseUp}
            onTimelineMouseLeave={handleTimelineMouseLeave}
            onTimelineScroll={handleTimelineScroll}
            onDragStart={handleDragStart}
            onEntryClick={handleEntryClick}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onMergeEntries={handleMergeEntries}
            onCancelEdit={() => setEditingEntryId(null)}
            onCreateEntry={handleCreateEntry}
            onCancelCreate={() => setCreatingEntry(null)}
            onJumpMinimapToRatio={jumpProjectMinimapToRatio}
            onDragMinimap={dragProjectMinimapViewport}
            setGhostEntry={setGhostEntry}
            timelineRef={timelineRef}
          />
        </div>

        {appContextMenu && (
          <AppContextMenu
            contextMenu={appContextMenu}
            isClient={isClient}
            onClose={() => setAppContextMenu(null)}
            onRename={(session) => void handleRenameApp(session)}
            onHide={(session) => void handleHideApp(session)}
          />
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <p>
            <strong>Apps:</strong> Hover to see details. Data from external tracking utility.
          </p>
          <p>
            <strong>Project Entries:</strong> Click &amp; drag to create new entries. Click entry
            to edit. Drag top/bottom edges to resize.
          </p>
        </div>
      </div>
    </div>
  );
}
