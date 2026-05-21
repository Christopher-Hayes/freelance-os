"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { useJobs } from "@/components/JobsProvider";
import { isAppHidden } from "@/lib/util";
import { checkCalDavEnabled } from "@/lib/webdav-actions";
import DateNavigationHeader from "./timeline/DateNavigationHeader";
import AppActivityColumn from "./timeline/AppActivityColumn";
import ProjectTrackingColumn from "./timeline/ProjectTrackingColumn";
import CalendarEventsColumn from "./timeline/CalendarEventsColumn";
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
  const calendarScrollRef = useRef<HTMLDivElement>(null);

  // ── CalDAV state ─────────────────────────────────────────────────────
  const [calDavEnabled, setCalDavEnabled] = useState(false);
  const [showCalendarEvents, setShowCalendarEvents] = useState(false);

  useEffect(() => {
    checkCalDavEnabled().then(setCalDavEnabled);
  }, []);

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
    calendarScrollMetrics,
    isDraggingActivityMinimapViewport,
    setIsDraggingActivityMinimapViewport,
    isDraggingProjectMinimapViewport,
    setIsDraggingProjectMinimapViewport,
    isDraggingCalendarMinimapViewport,
    setIsDraggingCalendarMinimapViewport,
    handleActivityScroll,
    handleTimelineScroll,
    handleCalendarScroll,
    jumpActivityMinimapToRatio,
    dragActivityMinimapViewport,
    jumpProjectMinimapToRatio,
    dragProjectMinimapViewport,
    jumpCalendarMinimapToRatio,
    dragCalendarMinimapViewport,
  } = useScrollSync(
    activityScrollRef,
    timelineRef,
    selectedDate,
    loading,
    mergedVisibleSessions,
    calendarScrollRef
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
    <div className="border border-slate-200/80 bg-white/95 dark:border-white/10 dark:bg-slate-900/90 dark:ring-white/5">
      <div className="sticky z-30 top-16 bg-white">
        <DateNavigationHeader
          selectedDate={selectedDate}
          onPrevDay={() => changeDay(-1)}
          onNextDay={() => changeDay(1)}
          onToday={goToToday}
          onDateSelect={onDateChange}
        />
      </div>

      <div className="p-4 relative" style={dragging ? { userSelect: "none" } : {}}>
        {dragging && (
          <div className="fixed inset-0 z-50" style={{ cursor: "ns-resize" }} />
        )}

        <div className={`grid gap-4 ${showCalendarEvents ? "grid-cols-7" : "grid-cols-5"}`}>
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

          {showCalendarEvents && (
            <CalendarEventsColumn
              selectedDate={selectedDate}
              isClient={isClient}
              currentTime={currentTime}
              calendarScrollMetrics={calendarScrollMetrics}
              isDraggingCalendarMinimapViewport={isDraggingCalendarMinimapViewport}
              setIsDraggingCalendarMinimapViewport={setIsDraggingCalendarMinimapViewport}
              onScroll={handleCalendarScroll}
              onJumpMinimapToRatio={jumpCalendarMinimapToRatio}
              onDragMinimap={dragCalendarMinimapViewport}
              scrollRef={calendarScrollRef}
            />
          )}
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
        <div className="flex items-start justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <p>
              <strong>Apps:</strong> Hover to see details. Data from external tracking utility.
            </p>
            <p>
              <strong>Project Entries:</strong> Click &amp; drag to create new entries. Click entry
              to edit. Drag top/bottom edges to resize.
            </p>
          </div>

          {calDavEnabled && (
            <button
              onClick={() => setShowCalendarEvents((v) => !v)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                showCalendarEvents
                  ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/40"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-700/50"
              }`}
              title={showCalendarEvents ? "Hide calendar events" : "Show calendar events"}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {showCalendarEvents ? "Hide Calendar" : "Show Calendar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
