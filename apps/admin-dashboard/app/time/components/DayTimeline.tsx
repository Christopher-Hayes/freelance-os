"use client";

import { useEffect, useState, useRef, useMemo, memo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { toast } from "@repo/ui";
import { useJobs } from "@/components/JobsProvider";
import { hasActiveJobForDate } from "@/lib/job-utils";
import { mergeTimeEntries } from "@/lib/time-actions";
import { importRescueTimeData } from "@/lib/activity-actions";
import DateNavigationHeader from "./timeline/DateNavigationHeader";
import TimelineHourMarkers from "./timeline/TimelineHourMarkers";
import CurrentTimeLine from "./timeline/CurrentTimeLine";
import ActivitySession from "./timeline/ActivitySession";
import TimeEntryBar from "./timeline/TimeEntryBar";
import TimeEntryCreationDialog from "./timeline/TimeEntryCreationDialog";
import {
  type ActivitySession as ActivitySessionType,
  type TimeEntry,
  type Project,
  HOUR_HEIGHT,
  TIMELINE_PADDING_TOP,
  TIMELINE_DRAG_OFFSET,
  MERGE_THRESHOLD_MINUTES,
  yToTime,
  mergeAdjacentSessions,
  buildAppColorMap,
} from "./timeline/utils";
import { calculateActivityOverlaps, calculateTimeEntryOverlaps } from "./timeline/overlapCalculations";
import { throttle, isAppHidden, formatAppTitle } from "@/lib/util";
import { authFetch } from '@/lib/util';

const MINIMAP_COLUMNS = 2;
const MINIMAP_ROWS = 60;
const MINIMAP_DOT_SIZE = 5;
const MINIMAP_GRID_TEMPLATE_ROWS = `repeat(${MINIMAP_ROWS}, minmax(0, 1fr))`;
const MINIMAP_HEIGHT_PX = 640;

function getMinimapRowIndex(totalMinutes: number) {
  return Math.max(0, Math.min(MINIMAP_ROWS - 1, Math.floor((totalMinutes / (24 * 60)) * MINIMAP_ROWS)));
}

function ActivityScrollbarMinimap({
  sessions,
  colorMap,
  scrollTop,
  viewportHeight,
  scrollHeight,
  onJumpToRatio,
  onDragViewport,
  isDraggingViewport,
  setIsDraggingViewport,
}: {
  sessions: ActivitySessionType[];
  colorMap: Map<string, string>;
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  onJumpToRatio: (ratio: number) => void;
  onDragViewport: (deltaRatio: number) => void;
  isDraggingViewport: boolean;
  setIsDraggingViewport: (isDragging: boolean) => void;
}) {
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

  const viewportHeightPercent = Math.max(
    (viewportHeight / Math.max(scrollHeight, 1)) * 100,
    8
  );
  const maxViewportTop = Math.max(0, 100 - viewportHeightPercent);
  const viewportTravelRatio = Math.max(maxViewportTop / 100, 0.0001);
  const viewportTop = Math.max(
    0,
    Math.min((scrollTop / Math.max(scrollHeight, 1)) * 100, maxViewportTop)
  );

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
    <div className="sticky top-0 z-20 p-1 flex bg-gray-100 border-l border-gray-300 shrink-0 justify-center self-stretch">
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
              className="rounded-xs bg-gray-500/20 dark:border-gray-600/40 dark:bg-gray-600/20"
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

// Memoized component for activity sessions timeline - only re-renders when sessions change
const ActivitySessionsTimeline = memo(function ActivitySessionsTimeline({
  sessions,
  loading,
  onImportRescueTime,
  importingRescueTime,
  onSessionContextMenu,
}: {
  sessions: ActivitySessionType[];
  loading: boolean;
  onImportRescueTime: () => void;
  importingRescueTime: boolean;
  onSessionContextMenu: (event: React.MouseEvent<HTMLDivElement>, session: ActivitySessionType) => void;
}) {
  // Memoize the merged sessions calculation
  const mergedSessions = useMemo(() => mergeAdjacentSessions(sessions), [sessions]);

  // Build color map based on app usage frequency
  const appColorMap = useMemo(() => buildAppColorMap(mergedSessions), [mergedSessions]);

  // Memoize the overlap calculations
  const activityOverlapPositions = useMemo(
    () => calculateActivityOverlaps(mergedSessions),
    [mergedSessions]
  );

  // Show empty state if no sessions and not loading
  if (!loading && sessions.length === 0) {
    return (
      <>
        <TimelineHourMarkers />
        <div className="sticky inset-0 flex items-center justify-center backdrop-blur-md p-8 max-w-[460px] top-[200px] left-[130px]">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                No activity data yet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Import your activity from RescueTime
              </p>
            </div>
            <button
              onClick={onImportRescueTime}
              disabled={importingRescueTime}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importingRescueTime ? (
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
      </>
    );
  }

  return (
    <>
      <TimelineHourMarkers />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800 bg-opacity-50">
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      ) : (
        <div className="relative ml-12">
          {mergedSessions
            .filter((session) => activityOverlapPositions[session.id] !== undefined)
            .map((session) => (
              <ActivitySession
                key={session.id}
                session={session}
                position={activityOverlapPositions[session.id]!}
                colorMap={appColorMap}
                onContextMenu={onSessionContextMenu}
              />
            ))}
        </div>
      )}
    </>
  );
});

interface DayTimelineProps {
  selectedDate: Temporal.PlainDate;
  onDateChange: (date: Temporal.PlainDate) => void;
}

export default function DayTimeline({
  selectedDate,
  onDateChange,
}: DayTimelineProps) {
  type AppSessionContextMenuState = {
    x: number;
    y: number;
    session: ActivitySessionType;
  } | null;

  const { jobs, createJob, refreshJobs } = useJobs();

  // State
  const [sessions, setSessions] = useState<ActivitySessionType[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(Date.now());
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [dragging, setDragging] = useState<{
    entryId: number;
    edge: "top" | "bottom";
    initialY: number;
    initialTime: Temporal.ZonedDateTime;
  } | null>(null);
  const [draggedTimes, setDraggedTimes] = useState<{
    [key: number]: { startTime: Temporal.ZonedDateTime; endTime: Temporal.ZonedDateTime };
  }>({});
  const [justFinishedDragging, setJustFinishedDragging] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [currentTime, setCurrentTime] = useState<Temporal.ZonedDateTime>(() =>
    Temporal.Now.zonedDateTimeISO()
  );
  const [creatingEntry, setCreatingEntry] = useState<{
    startTime: Temporal.ZonedDateTime;
    endTime: Temporal.ZonedDateTime;
    y: number;
  } | null>(null);
  const [ghostEntry, setGhostEntry] = useState<{
    startTime: Temporal.ZonedDateTime;
    endTime: Temporal.ZonedDateTime;
  } | null>(null);
  const [draggingNewEntry, setDraggingNewEntry] = useState<{
    startY: number;
    startTime: Temporal.ZonedDateTime;
  } | null>(null);
  const [loadingAutofill, setLoadingAutofill] = useState(false);
  const [mergingEntryId, setMergingEntryId] = useState<number | null>(null);
  const [importingRescueTime, setImportingRescueTime] = useState(false);
  const [appContextMenu, setAppContextMenu] = useState<AppSessionContextMenuState>(null);
  const [isDraggingMinimapViewport, setIsDraggingMinimapViewport] = useState(false);
  const [activityScrollMetrics, setActivityScrollMetrics] = useState({
    scrollTop: 0,
    viewportHeight: MINIMAP_HEIGHT_PX,
    scrollHeight: 24 * HOUR_HEIGHT + 40,
  });

  // Refs
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const completedJobIdsRef = useRef<Set<number>>(new Set());

  // Memoized calculations for time entries (these change with dragging)
  const overlapPositions = useMemo(
    () => calculateTimeEntryOverlaps(timeEntries, draggedTimes),
    [timeEntries, draggedTimes]
  );

  const visibleSessions = useMemo(
    () => sessions.filter((session) => !isAppHidden(session.appClass)),
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

  useEffect(() => {
    if (!appContextMenu) {
      return;
    }

    const handleDismiss = () => setAppContextMenu(null);

    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);

    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [appContextMenu]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAppContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Effects
  useEffect(() => {
    fetchDayData();
  }, [selectedDate]);

  // Refresh day data when autofill jobs complete (only on status change)
  useEffect(() => {
    const dateStr = `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`;
    const completedJobs = jobs.filter(
      (job) =>
        job.type === "autofill_time_entries" &&
        job.status === "completed" &&
        job.parameters?.date === dateStr
    );

    // Only refresh if we have NEW completed jobs (not already tracked)
    const newlyCompletedJobs = completedJobs.filter(job => !completedJobIdsRef.current.has(job.id));

    if (newlyCompletedJobs.length > 0) {
      // Track these jobs so we don't refresh again for them
      newlyCompletedJobs.forEach(job => completedJobIdsRef.current.add(job.id));

      // Refresh data when a job for this date completes
      fetchDayData();
    }
  }, [jobs, selectedDate]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update current time every minute for the current time line
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Temporal.Now.zonedDateTimeISO());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(interval);
  }, []);

  // Update "time ago" display every 30 seconds
  useEffect(() => {
    const updateTimeAgo = () => {
      const secondsAgo = Math.floor((Date.now() - lastRefreshTime) / 1000);
      if (secondsAgo < 60) {
        setTimeAgo("just now");
      } else if (secondsAgo < 3600) {
        const minutes = Math.floor(secondsAgo / 60);
        setTimeAgo(`${minutes}m ago`);
      } else {
        const hours = Math.floor(secondsAgo / 3600);
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [lastRefreshTime]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const timeline = timelineRef.current;
    const today = Temporal.Now.plainDateISO();

    if (timeline) {
      // If it's the current day, scroll to current time
      if (Temporal.PlainDate.compare(selectedDate, today) === 0) {
        const now = Temporal.Now.zonedDateTimeISO();
        const hours = now.hour + now.minute / 60;
        const scrollPosition = hours * HOUR_HEIGHT - timeline.clientHeight / 2;

        timeline.scrollTop = Math.max(0, scrollPosition);
      } else {
        // Otherwise, scroll to ~30% down the timeline
        timeline.scrollTop = timeline.scrollHeight * 0.3;
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    const activityContainer = activityScrollRef.current;
    if (!activityContainer) {
      return;
    }

    setActivityScrollMetrics({
      scrollTop: activityContainer.scrollTop,
      viewportHeight: activityContainer.clientHeight,
      scrollHeight: activityContainer.scrollHeight,
    });
  }, [selectedDate, loading, mergedVisibleSessions]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && creatingEntry) {
        setCreatingEntry(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [creatingEntry]);

  // Auto-refresh when returning to tab (if 5+ minutes have passed)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const isToday = Temporal.PlainDate.compare(selectedDate, Temporal.Now.plainDateISO()) === 0;
        if (!isToday) return;

        const timeSinceLastRefresh = Date.now() - lastRefreshTime;
        const fiveMinutesInMs = 5 * 60 * 1000;

        if (timeSinceLastRefresh >= fiveMinutesInMs) {
          console.log('Auto-refreshing activity data after being away for', Math.round(timeSinceLastRefresh / 1000 / 60), 'minutes');
          fetchDayData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastRefreshTime, selectedDate]);

  // Drag and drop effect
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
      const newTimeRaw = yToTime(y, selectedDate);

      const minutes = newTimeRaw.minute;
      const snappedMinutes = Math.round(minutes / 15) * 15;
      const newTime = newTimeRaw.with({ minute: snappedMinutes, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });

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

          setTimeEntries((prev) =>
            prev.map((entry) =>
              entry.id === dragging.entryId
                ? {
                  ...entry,
                  startTime: startTime.toString(),
                  endTime: endTime.toString(),
                  durationMinutes: Math.round(
                    Number((endTime.epochNanoseconds - startTime.epochNanoseconds) / 60_000_000_000n)
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
            headers: {
              "Content-Type": "application/json",
            },
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
  }, [dragging, timeEntries, draggedTimes, selectedDate]);

  // Data fetching
  const fetchProjects = async () => {
    try {
      const response = await authFetch("/api/projects");
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchDayData = async () => {
    setLoading(true);
    const dateStr = `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`;

    try {
      const [sessionsRes, entriesRes] = await Promise.all([
        authFetch(`/api/activity-sessions?date=${dateStr}`),
        authFetch(`/api/time?startDate=${dateStr}&endDate=${dateStr}`),
      ]);

      const sessionsData = await sessionsRes.json();
      const entriesData = await entriesRes.json();

      setSessions(sessionsData.sessions || []);
      setTimeEntries(entriesData.timeEntries || []);
      setLastRefreshTime(Date.now());
    } catch (error) {
      console.error("Error fetching day data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    const response = await authFetch("/api/settings/all");
    if (!response.ok) {
      throw new Error("Failed to load settings");
    }

    return response.json();
  };

  const updateSettings = async (payload: Record<string, unknown>) => {
    const response = await authFetch("/api/settings/all", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to update settings");
    }

    return response.json();
  };

  const syncSettingsToLocalStorage = (settings: { appTitleRenames?: unknown; hiddenAppClasses?: unknown }) => {
    if (typeof window === "undefined") {
      return;
    }

    if (Array.isArray(settings.appTitleRenames)) {
      window.localStorage.setItem("appTitleRenames", JSON.stringify(settings.appTitleRenames));
    }

    if (Array.isArray(settings.hiddenAppClasses)) {
      window.localStorage.setItem("hiddenAppClasses", JSON.stringify(settings.hiddenAppClasses));
    }
  };

  const showUndoToast = (message: string, undo: () => Promise<void>) => {
    toast.success(message, {
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await undo();
          } catch (error) {
            console.error("Undo failed:", error);
            toast.error("Undo failed");
          }
        },
      },
      duration: 6000,
    });
  };

  const handleRenameApp = async (session: ActivitySessionType) => {
    const currentFriendlyName = formatAppTitle(session.appClass);
    const nextName = window.prompt(`Rename \"${currentFriendlyName}\"`, currentFriendlyName);

    if (!nextName) {
      return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      const settings = await fetchSettings();
  const previousRenames = Array.isArray(settings.appTitleRenames) ? settings.appTitleRenames.filter((entry: unknown): entry is string => typeof entry === "string") : [];
      const normalizedKey = session.appClass.toLowerCase();
      const nextRenames = [
  ...previousRenames.filter((entry: string) => entry.split("=")[0]?.trim().toLowerCase() !== normalizedKey),
        `${session.appClass}=${trimmedName}`,
      ];

      const updatedSettings = await updateSettings({ appTitleRenames: nextRenames });
      syncSettingsToLocalStorage(updatedSettings);
      setAppContextMenu(null);
      await fetchDayData();

      showUndoToast(`Renamed ${currentFriendlyName} to ${trimmedName}`, async () => {
        const undoneSettings = await updateSettings({ appTitleRenames: previousRenames });
        syncSettingsToLocalStorage(undoneSettings);
        await fetchDayData();
        toast.success(`Restored ${currentFriendlyName}`);
      });
    } catch (error) {
      console.error("Error renaming app:", error);
      toast.error("Failed to rename app");
    }
  };

  const handleHideApp = async (session: ActivitySessionType) => {
    const currentFriendlyName = formatAppTitle(session.appClass);

    try {
      const settings = await fetchSettings();
  const previousHiddenApps = Array.isArray(settings.hiddenAppClasses) ? settings.hiddenAppClasses.filter((entry: unknown): entry is string => typeof entry === "string") : [];
      const normalizedKey = session.appClass.toLowerCase();
  const nextHiddenApps = previousHiddenApps.some((entry: string) => entry.toLowerCase() === normalizedKey)
        ? previousHiddenApps
        : [...previousHiddenApps, session.appClass];

      const updatedSettings = await updateSettings({ hiddenAppClasses: nextHiddenApps });
      syncSettingsToLocalStorage(updatedSettings);
      setAppContextMenu(null);
      await fetchDayData();

      showUndoToast(`Hid ${currentFriendlyName} from timeline and analytics`, async () => {
        const undoneSettings = await updateSettings({ hiddenAppClasses: previousHiddenApps });
        syncSettingsToLocalStorage(undoneSettings);
        await fetchDayData();
        toast.success(`Unhid ${currentFriendlyName}`);
      });
    } catch (error) {
      console.error("Error hiding app:", error);
      toast.error("Failed to hide app");
    }
  };

  const handleSessionContextMenu = (event: React.MouseEvent<HTMLDivElement>, session: ActivitySessionType) => {
    event.preventDefault();
    event.stopPropagation();

    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      session,
    });
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    await fetchDayData();
  };

  // Navigation handlers
  const changeDay = (delta: number) => {
    const newDate = selectedDate.add({ days: delta });
    onDateChange(newDate);
  };

  const goToToday = () => {
    const today = Temporal.Now.plainDateISO();
    onDateChange(today);
  };

  // Timeline interaction handlers
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    if (justFinishedDragging) {
      setJustFinishedDragging(false);
      return;
    }
    if ((e.target as HTMLElement).closest(".timeline-entry")) return;
    if ((e.target as HTMLElement).closest(".timeline-session")) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX;
    const isScrollbar = clickX > rect.right - 20;
    if (isScrollbar) return;

    setEditingEntryId(null);

    const scrollTop = timelineRef.current?.scrollTop || 0;
    const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
    const clickTimeRaw = yToTime(y, selectedDate);

    const minutes = clickTimeRaw.minute;
    const snappedMinutes = Math.round(minutes / 15) * 15;
    const clickTime = clickTimeRaw.with({ minute: snappedMinutes, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });

    setDraggingNewEntry({
      startY: y,
      startTime: clickTime,
    });
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    if ((e.target as HTMLElement).closest(".timeline-entry")) {
      setGhostEntry(null);
      return;
    }

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scrollTop = timelineRef.current?.scrollTop || 0;
    const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
    const hoverTimeRaw = yToTime(y, selectedDate);

    const minutes = hoverTimeRaw.minute;
    const snappedMinutes = Math.round(minutes / 15) * 15;
    const hoverTime = hoverTimeRaw.with({ minute: snappedMinutes, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });

    if (draggingNewEntry) {
      const startTime = draggingNewEntry.startTime;
      const endTime = hoverTime;

      if (Temporal.ZonedDateTime.compare(endTime, startTime) > 0) {
        setGhostEntry({ startTime, endTime });
      } else if (Temporal.ZonedDateTime.compare(endTime, startTime) < 0) {
        setGhostEntry({ startTime: endTime, endTime: startTime });
      }
    } else {
      const endTime = hoverTime.add({ hours: 1 });
      setGhostEntry({ startTime: hoverTime, endTime });
    }
  };

  const handleTimelineMouseLeave = () => {
    if (!draggingNewEntry) {
      setGhostEntry(null);
    }
  };

  const handleTimelineMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingNewEntry) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scrollTop = timelineRef.current?.scrollTop || 0;
    const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
    const endTimeRaw = yToTime(y, selectedDate);

    const minutes = endTimeRaw.minute;
    const snappedMinutes = Math.round(minutes / 15) * 15;
    const endTimeSnapped = endTimeRaw.with({ minute: snappedMinutes, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });

    let startTime = draggingNewEntry.startTime;
    let endTime = endTimeSnapped;

    if (Temporal.ZonedDateTime.compare(endTime, startTime) < 0) {
      [startTime, endTime] = [endTime, startTime];
    }

    const durationMs = Number((endTime.epochNanoseconds - startTime.epochNanoseconds) / 1_000_000n);
    const minDuration = 15 * 60 * 1000;
    if (durationMs < minDuration) {
      endTime = startTime.add({ hours: 1 });
    }

    const viewportHeight = window.innerHeight;
    const dialogHeight = 500;
    const idealY = Math.max(20, Math.min(viewportHeight - dialogHeight - 20, (viewportHeight - dialogHeight) / 2));

    setCreatingEntry({ startTime, endTime, y: idealY });
    setDraggingNewEntry(null);
    setGhostEntry(null);
  };

  // Entry handlers
  const handleDragStart = (
    e: React.MouseEvent,
    entryId: number,
    edge: "top" | "bottom",
    initialTime: Temporal.ZonedDateTime
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging({ entryId, edge, initialY: e.clientY, initialTime });
  };

  const handleEntryClick = (entryId: number) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('cursor-ns-resize')) return;
    if ((e.target as HTMLElement).closest('form')) return;
    if (dragging) return;
    setEditingEntryId(editingEntryId === entryId ? null : entryId);
  };

  const handleCreateEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!creatingEntry) return;

    const formData = new FormData(e.currentTarget);
    const projectId = parseInt(formData.get('projectId') as string);
    const description = formData.get('description') as string;
    const billable = formData.get('billable') === 'on';

    try {
      const durationMinutes = Math.round(
        Number((creatingEntry.endTime.epochNanoseconds - creatingEntry.startTime.epochNanoseconds) / 60_000_000_000n)
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
  };

  const handleSaveEdit = (entryId: number) => async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const formData = new FormData(e.currentTarget);
    const projectId = parseInt(formData.get('projectId') as string);
    const description = formData.get('description') as string;
    const billable = formData.get('billable') === 'on';

    try {
      const response = await authFetch(`/api/time/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          description: description || null,
          billable,
        }),
      });

      if (!response.ok) throw new Error("Failed to update");

      await fetchDayData();
      setEditingEntryId(null);
    } catch (error) {
      console.error("Error updating entry:", error);
      toast.error("Failed to update entry");
    }
  };

  const handleDelete = (entryId: number) => async () => {
    // if (!confirm("Delete this time entry?")) return;

    try {
      const response = await authFetch(`/api/time/${entryId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      await fetchDayData();
      setEditingEntryId(null);
    } catch (error) {
      console.error("Error deleting entry:", error);
      toast.error("Failed to delete entry");
    }
  };

  const handleClearDayEntries = async () => {
    const entriesToDelete = timeEntries.filter((entry) => entry.id !== -1);

    if (entriesToDelete.length === 0) {
      toast.info("No project entries to clear for this day");
      return;
    }

    try {
      const results = await Promise.allSettled(
        entriesToDelete.map((entry) =>
          authFetch(`/api/time/${entry.id}`, {
            method: "DELETE",
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`Failed to delete entry ${entry.id}`);
            }
          })
        )
      );

      const failures = results.filter((result) => result.status === "rejected");

      if (failures.length > 0) {
        throw new Error(`Failed to clear ${failures.length} entr${failures.length === 1 ? "y" : "ies"}`);
      }

      await fetchDayData();
      setEditingEntryId(null);
      toast.success(`Cleared ${entriesToDelete.length} project ${entriesToDelete.length === 1 ? "entry" : "entries"}`);
    } catch (error) {
      console.error("Error clearing day entries:", error);
      toast.error("Failed to clear today's project entries");
    }
  };

  const handleAutofill = async () => {
    setLoadingAutofill(true);
    try {
      const dateStr = `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`;

      // Create a background job instead of waiting for results
      await createJob("autofill_time_entries", { date: dateStr });

      toast.info("Autofill job started! You'll be notified when it completes.");
    } catch (error: any) {
      console.error("Error starting autofill:", error);
      toast.error(error.message || "Failed to start autofill job");
    } finally {
      setLoadingAutofill(false);
    }
  };

  const handleMergeEntries = (entryId: number, nextEntryId: number) => async () => {
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
  };

  const handleImportFromRescueTime = async () => {
    setImportingRescueTime(true);
    try {
      const dateStr = `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`;

      const data = await importRescueTimeData(dateStr);

      if (data.sessionsImported > 0) {
        toast.success(`Imported ${data.sessionsImported} activity sessions from RescueTime!`);
        await fetchDayData();
      } else {
        toast.info(data.message || "No data imported");
      }
    } catch (error: any) {
      console.error("Error importing from RescueTime:", error);
      toast.error(error.message || "Failed to import from RescueTime");
    } finally {
      setImportingRescueTime(false);
    }
  };

  const handleActivityScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setActivityScrollMetrics({
      scrollTop: e.currentTarget.scrollTop,
      viewportHeight: e.currentTarget.clientHeight,
      scrollHeight: e.currentTarget.scrollHeight,
    });

    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activityScrollRef.current) {
      activityScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const jumpActivityMinimapToRatio = (ratio: number) => {
    const activityContainer = activityScrollRef.current;
    if (!activityContainer) {
      return;
    }

    const maxScrollTop = Math.max(activityContainer.scrollHeight - activityContainer.clientHeight, 0);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));

    activityContainer.scrollTop = nextScrollTop;

    if (timelineRef.current) {
      timelineRef.current.scrollTop = nextScrollTop;
    }

    setActivityScrollMetrics({
      scrollTop: nextScrollTop,
      viewportHeight: activityContainer.clientHeight,
      scrollHeight: activityContainer.scrollHeight,
    });
  };

  const dragActivityMinimapViewport = (deltaRatio: number) => {
    const activityContainer = activityScrollRef.current;
    if (!activityContainer) {
      return;
    }

    const maxScrollTop = Math.max(activityContainer.scrollHeight - activityContainer.clientHeight, 0);
    const scrollDelta = deltaRatio * maxScrollTop;
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, activityContainer.scrollTop + scrollDelta));

    activityContainer.scrollTop = nextScrollTop;

    if (timelineRef.current) {
      timelineRef.current.scrollTop = nextScrollTop;
    }

    setActivityScrollMetrics({
      scrollTop: nextScrollTop,
      viewportHeight: activityContainer.clientHeight,
      scrollHeight: activityContainer.scrollHeight,
    });
  };

  // Render time entries with ghost entry
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
          Number((ghostEntry.endTime.epochNanoseconds - ghostEntry.startTime.epochNanoseconds) / 60_000_000_000n)
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
        : (overlapPositions[entry.id] || { column: 0, totalColumns: 1 });

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
          onDragStart={(e, edge, time) => handleDragStart(e, entry.id, edge, time)}
          onClick={handleEntryClick(entry.id)}
          onSaveEdit={handleSaveEdit(entry.id)}
          onCancelEdit={() => setEditingEntryId(null)}
          onDelete={handleDelete(entry.id)}
          onMerge={canMerge && nextEntryId ? handleMergeEntries(entry.id, nextEntryId) : undefined}
        />
      );
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <DateNavigationHeader
        selectedDate={selectedDate}
        onPrevDay={() => changeDay(-1)}
        onNextDay={() => changeDay(1)}
        onToday={goToToday}
        onDateSelect={onDateChange}
      />

      <div
        className="p-4 relative"
        style={dragging ? { userSelect: 'none' } : {}}
      >
        {dragging && (
          <div
            className="fixed inset-0 z-50"
            style={{ cursor: 'ns-resize' }}
          />
        )}

        <div className="grid grid-cols-5 gap-4">
          {/* Activity Sessions Column */}
          <div className="col-span-3 select-none">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                App Activity
              </h3>
              <button
                onClick={handleManualRefresh}
                disabled={loading}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh activity data"
              >
                <svg
                  className={`w-4 h-4 text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              {timeAgo && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Updated {timeAgo}
                </span>
              )}
            </div>
            <div className="relative bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div className="flex h-full items-stretch">
                <div
                  ref={activityScrollRef}
                  className="relative min-w-0 flex-1 overflow-y-auto overflow-x-visible pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                  onScroll={handleActivityScroll}
                >
                  <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingTop: `${TIMELINE_PADDING_TOP}px`, paddingBottom: '40px' }}>
                    <ActivitySessionsTimeline
                      sessions={visibleSessions}
                      loading={loading}
                      onImportRescueTime={handleImportFromRescueTime}
                      importingRescueTime={importingRescueTime}
                      onSessionContextMenu={handleSessionContextMenu}
                    />
                    <CurrentTimeLine
                      selectedDate={selectedDate}
                      isClient={isClient}
                      currentTime={currentTime}
                    />
                  </div>
                </div>
                <ActivityScrollbarMinimap
                  sessions={mergedVisibleSessions}
                  colorMap={minimapColorMap}
                  scrollTop={activityScrollMetrics.scrollTop}
                  viewportHeight={activityScrollMetrics.viewportHeight}
                  scrollHeight={activityScrollMetrics.scrollHeight}
                  onJumpToRatio={jumpActivityMinimapToRatio}
                  onDragViewport={dragActivityMinimapViewport}
                  isDraggingViewport={isDraggingMinimapViewport}
                  setIsDraggingViewport={setIsDraggingMinimapViewport}
                />
              </div>
            </div>
          </div>

          {/* Time Entries Column */}
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 select-none">
                Project Tracking
              </h3>
              <button
                onClick={handleAutofill}
                disabled={loadingAutofill || hasActiveJobForDate(jobs, `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasActiveJobForDate(jobs, `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`) ? "Autofill in progress..." : "Use AI to suggest time entries based on app activity"}
              >
                <svg
                  className={`w-4 h-4 ${loadingAutofill || hasActiveJobForDate(jobs, `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`) ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {loadingAutofill || hasActiveJobForDate(jobs, `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`) ? (
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
                {loadingAutofill || hasActiveJobForDate(jobs, `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}-${String(selectedDate.day).padStart(2, '0')}`) ? "Processing..." : "Autofill"}
              </button>
            </div>
            <div className="relative bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div
                ref={timelineRef}
                className="relative overflow-y-auto overflow-x-visible cursor-crosshair pr-4"
                style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                onMouseDown={handleTimelineMouseDown}
                onMouseMove={throttle(handleTimelineMouseMove, 20)}
                onMouseUp={handleTimelineMouseUp}
                onMouseLeave={handleTimelineMouseLeave}
                onScroll={throttle(handleTimelineScroll, 20)}
              >
                <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingTop: `${TIMELINE_PADDING_TOP}px`, paddingBottom: '40px' }}>
                  <TimelineHourMarkers />
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800 bg-opacity-50">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                    </div>
                  ) : (
                    <div className="relative ml-12">{renderTimeEntries()}</div>
                  )}
                  <CurrentTimeLine
                    selectedDate={selectedDate}
                    isClient={isClient}
                    currentTime={currentTime}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {appContextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAppContextMenu(null)} />
            <div
              className="fixed z-50 min-w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
              style={{ top: appContextMenu.y, left: appContextMenu.x }}
              role="menu"
            >
              <div className="border-b border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {formatAppTitle(appContextMenu.session.appClass)}
              </div>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={() => void handleRenameApp(appContextMenu.session)}
                role="menuitem"
              >
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={() => void handleHideApp(appContextMenu.session)}
                role="menuitem"
              >
                Hide
              </button>
            </div>
          </>
        )}

        {creatingEntry && (
          <TimeEntryCreationDialog
            startTime={creatingEntry.startTime}
            endTime={creatingEntry.endTime}
            y={creatingEntry.y}
            projects={projects}
            onSubmit={handleCreateEntry}
            onCancel={() => setCreatingEntry(null)}
          />
        )}

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
          <p>
            <strong>Apps:</strong> Hover to see details. Data from external tracking utility.
          </p>
          <p>
            <strong>Project Entries:</strong> Click & drag to create new entries. Click entry to edit. Drag top/bottom edges to resize.
          </p>
          </div>
          <button
            type="button"
            onClick={handleClearDayEntries}
            disabled={loading || timeEntries.length === 0}
            className="shrink-0 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Remove all project tracking entries for this day"
          >
            Clear today's entries
          </button>
        </div>
      </div>
    </div>
  );
}
