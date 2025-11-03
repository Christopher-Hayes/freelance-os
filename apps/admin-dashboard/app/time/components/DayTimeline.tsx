"use client";

import { useEffect, useState, useRef, useMemo, memo } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
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
  yToTime,
  mergeAdjacentSessions,
  buildAppColorMap,
} from "./timeline/utils";
import {
  calculateActivityOverlaps,
  calculateTimeEntryOverlaps,
  type OverlapPosition,
} from "./timeline/overlapCalculations";
import { debounce, throttle } from "@/lib/util";

// Memoized component for activity sessions timeline - only re-renders when sessions change
const ActivitySessionsTimeline = memo(function ActivitySessionsTimeline({
  sessions,
  loading,
}: {
  sessions: ActivitySessionType[];
  loading: boolean;
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

  // Refs
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Memoized calculations for time entries (these change with dragging)
  const overlapPositions = useMemo(
    () => calculateTimeEntryOverlaps(timeEntries, draggedTimes),
    [timeEntries, draggedTimes]
  );

  // Effects
  useEffect(() => {
    fetchDayData();
  }, [selectedDate]);

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

          fetch(`/api/time/${dragging.entryId}`, {
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
      const response = await fetch("/api/projects");
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
        fetch(`/api/activity-sessions?date=${dateStr}`),
        fetch(`/api/time?startDate=${dateStr}&endDate=${dateStr}`),
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

      const response = await fetch("/api/time", {
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
      alert("Failed to create entry");
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
      const response = await fetch(`/api/time/${entryId}`, {
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
      alert("Failed to update entry");
    }
  };

  const handleDelete = (entryId: number) => async () => {
    if (!confirm("Delete this time entry?")) return;

    try {
      const response = await fetch(`/api/time/${entryId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      await fetchDayData();
      setEditingEntryId(null);
    } catch (error) {
      console.error("Error deleting entry:", error);
      alert("Failed to delete entry");
    }
  };

  const handleActivityScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activityScrollRef.current) {
      activityScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
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

    return entries.map((entry) => {
      const isGhost = entry.id === -1;
      const position = isGhost 
        ? { column: 0, totalColumns: 1 }
        : (overlapPositions[entry.id] || { column: 0, totalColumns: 1 });

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
          onDragStart={(e, edge, time) => handleDragStart(e, entry.id, edge, time)}
          onClick={handleEntryClick(entry.id)}
          onSaveEdit={handleSaveEdit(entry.id)}
          onCancelEdit={() => setEditingEntryId(null)}
          onDelete={handleDelete(entry.id)}
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
              <div
                ref={activityScrollRef}
                className="relative pr-4 overflow-y-auto overflow-x-visible"
                style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                onScroll={handleActivityScroll}
              >
                <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingTop: `${TIMELINE_PADDING_TOP}px`, paddingBottom: '40px' }}>
                  <ActivitySessionsTimeline sessions={sessions} loading={loading} />
                  <CurrentTimeLine 
                    selectedDate={selectedDate} 
                    isClient={isClient} 
                    currentTime={currentTime}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Time Entries Column */}
          <div className="col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 select-none">
              Project Tracking
            </h3>
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

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p>
            <strong>Apps:</strong> Hover to see details. Data from external tracking utility.
          </p>
          <p>
            <strong>Project Entries:</strong> Click & drag to create new entries. Click entry to edit. Drag top/bottom edges to resize.
          </p>
        </div>
      </div>
    </div>
  );
}
