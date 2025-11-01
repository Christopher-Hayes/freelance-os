"use client";

import { useEffect, useState, useRef } from "react";

interface ActivitySession {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
}

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
    client: {
      name: string;
    };
  };
}

interface DayTimelineProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onCreateEntry: (startTime: Date, endTime: Date) => void;
}

const PIXELS_PER_HOUR = 60; // Height of one hour in pixels
const HOUR_HEIGHT = PIXELS_PER_HOUR;

export default function DayTimeline({
  selectedDate,
  onDateChange,
  onCreateEntry,
}: DayTimelineProps) {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<{
    entryId: number;
    edge: "top" | "bottom";
    initialY: number;
    initialTime: Date;
  } | null>(null);
  const [draggedTimes, setDraggedTimes] = useState<{
    [key: number]: { startTime: Date; endTime: Date };
  }>({});
  const [justFinishedDragging, setJustFinishedDragging] = useState(false);

  // Refs for syncing scroll
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Merge adjacent sessions for the same app within 1 hour
  const mergedSessions = (() => {
    // First, sort sessions by start time
    const sortedSessions = [...sessions].sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    // Then merge adjacent sessions with the same app
    return sortedSessions.reduce((acc, session) => {
      if (acc.length === 0) {
        // Deep copy to avoid mutations
        return [{ ...session }];
      }

      const lastSession = acc[acc.length - 1]!;
      const lastEnd = new Date(lastSession.endTime);
      const currentStart = new Date(session.startTime);
      const currentEnd = new Date(session.endTime);
      
      // Check if same app and within 1 hour gap (or overlapping)
      const timeDiffMs = currentStart.getTime() - lastEnd.getTime();
      const timeDiffMinutes = timeDiffMs / (1000 * 60);
      
      // Merge if same app AND (overlapping OR gap is less than 5 minutes)
      if (
        lastSession.appClass === session.appClass &&
        timeDiffMinutes <= 5 // Allow up to 5 minute gaps
      ) {
        // Merge: extend the last session's end time
        lastSession.endTime = currentEnd > lastEnd ? session.endTime : lastSession.endTime;
        
        // Add durations, including gap time if positive
        const gapSeconds = timeDiffMs > 0 ? Math.floor(timeDiffMs / 1000) : 0;
        lastSession.durationSeconds += session.durationSeconds + gapSeconds;
        
        // Combine window titles if different and not too long
        if (session.windowTitle && session.windowTitle !== lastSession.windowTitle) {
          const currentTitle = lastSession.windowTitle || '';
          const newTitle = session.windowTitle;
          // Only add if it's not already included and keep it reasonable
          if (!currentTitle.includes(newTitle)) {
            const combined = currentTitle ? `${currentTitle} / ${newTitle}` : newTitle;
            // Limit combined title length to avoid clutter
            lastSession.windowTitle = combined.length > 100 
              ? combined.substring(0, 97) + '...'
              : combined;
          }
        }
        return acc;
      } else {
        // Not mergeable, add as new session (deep copy)
        return [...acc, { ...session }];
      }
    }, [] as ActivitySession[]);
  })();

  // Calculate overlapping entries and their positions
  const calculateOverlaps = () => {
    // Get all entries with their current times (including dragged times)
    const entriesWithTimes = timeEntries.map((entry) => {
      const draggedEntry = draggedTimes[entry.id];
      return {
        id: entry.id,
        start: draggedEntry
          ? new Date(draggedEntry.startTime)
          : new Date(entry.startTime),
        end: draggedEntry
          ? new Date(draggedEntry.endTime)
          : new Date(entry.endTime),
      };
    });

    // For each entry, find which OTHER entries overlap with it at ANY point in its duration
    const positions: {
      [key: number]: { column: number; totalColumns: number };
    } = {};

    entriesWithTimes.forEach((entry) => {
      // Find all entries that overlap with this entry
      const overlappingEntries = entriesWithTimes.filter((other) => {
        if (entry.id === other.id) return false;
        return entry.start < other.end && entry.end > other.start;
      });

      if (overlappingEntries.length === 0) {
        // No overlaps, use full width
        positions[entry.id] = { column: 0, totalColumns: 1 };
        return;
      }

      // Create a group of all entries that overlap with this one (including itself)
      const overlapGroup = [entry, ...overlappingEntries];

      // Find the maximum number of entries that overlap at any single point in time
      // Collect all unique start and end times in the overlap group
      const allTimes = new Set<number>();
      overlapGroup.forEach((e) => {
        allTimes.add(e.start.getTime());
        allTimes.add(e.end.getTime());
      });

      const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
      
      let maxConcurrent = 0;
      const concurrentGroups: number[][] = [];

      // For each time segment, count how many entries are active
      for (let i = 0; i < sortedTimes.length - 1; i++) {
        const currentTime = sortedTimes[i];
        if (currentTime === undefined) continue;
        const checkTime = new Date(currentTime + 1); // Sample point in the middle
        const concurrent = overlapGroup.filter((e) => {
          return checkTime >= e.start && checkTime < e.end;
        });
        
        if (concurrent.length > maxConcurrent) {
          maxConcurrent = concurrent.length;
        }
        
        // Store this concurrent group
        concurrentGroups.push(concurrent.map((e) => e.id));
      }

      // Find the largest concurrent group that includes this entry
      const largestGroupWithEntry = concurrentGroups
        .filter((group) => group.includes(entry.id))
        .reduce((largest, current) => {
          return current.length > largest.length ? current : largest;
        }, [] as number[]);

      // Sort by ID for consistent column assignment
      const sortedGroup = largestGroupWithEntry.sort((a, b) => a - b);
      const column = sortedGroup.indexOf(entry.id);
      
      positions[entry.id] = {
        column: column >= 0 ? column : 0,
        totalColumns: Math.min(maxConcurrent, 4),
      };
    });

    return positions;
  };

  const overlapPositions = calculateOverlaps();

  // Sync scroll between activity sessions and time entries
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

  // Fetch data for the selected date
  useEffect(() => {
    fetchDayData();
  }, [selectedDate]);

  const fetchDayData = async () => {
    setLoading(true);
    // Format the date in local timezone (YYYY-MM-DD)
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    try {
      const [sessionsRes, entriesRes] = await Promise.all([
        fetch(`/api/activity-sessions?date=${dateStr}`),
        fetch(
          `/api/time?startDate=${dateStr}&endDate=${dateStr}`
        ),
      ]);

      const sessionsData = await sessionsRes.json();
      const entriesData = await entriesRes.json();

      console.log("Timeline fetched sessions:", sessionsData);
      console.log("Timeline fetched entries:", entriesData);

      setSessions(sessionsData.sessions || []);
      setTimeEntries(entriesData.timeEntries || []);
    } catch (error) {
      console.error("Error fetching day data:", error);
    } finally {
      setLoading(false);
    }
  };

  const changeDay = (delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + delta);
    onDateChange(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to midnight local time
    onDateChange(today);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Convert a time to Y position in pixels (0 = midnight)
  const timeToY = (time: Date): number => {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    return ((hours + minutes / 60 + seconds / 3600) * PIXELS_PER_HOUR);
  };

  // Convert Y position to time
  const yToTime = (y: number, baseDate: Date): Date => {
    const hours = y / PIXELS_PER_HOUR;
    const date = new Date(baseDate);
    date.setHours(0, 0, 0, 0);
    date.setMilliseconds(hours * 60 * 60 * 1000);
    return date;
  };

  // Handle clicking on empty space to create new entry
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    if (justFinishedDragging) {
      setJustFinishedDragging(false);
      return;
    }
    if ((e.target as HTMLElement).closest(".timeline-entry")) return;
    if ((e.target as HTMLElement).closest(".timeline-session")) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const clickTime = yToTime(y, selectedDate);
    
    // Create a 1-hour block by default
    const endTime = new Date(clickTime);
    endTime.setHours(endTime.getHours() + 1);

    onCreateEntry(clickTime, endTime);
  };

  // Handle drag start
  const handleDragStart = (
    e: React.MouseEvent,
    entryId: number,
    edge: "top" | "bottom",
    initialTime: Date
  ) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    setDragging({
      entryId,
      edge,
      initialY: e.clientY,
      initialTime,
    });
  };

  // Handle drag move
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Account for scroll offset
      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop;
      const newTime = yToTime(y, selectedDate);

      // Snap to 15-minute intervals
      const minutes = newTime.getMinutes();
      const snappedMinutes = Math.round(minutes / 15) * 15;
      newTime.setMinutes(snappedMinutes, 0, 0);

      const entry = timeEntries.find((e) => e.id === dragging.entryId);
      if (!entry) return;

      // Get the current times (either from drag state or original entry)
      const draggedEntry = draggedTimes[dragging.entryId];
      const currentStart = draggedEntry
        ? new Date(draggedEntry.startTime)
        : new Date(entry.startTime);
      const currentEnd = draggedEntry
        ? new Date(draggedEntry.endTime)
        : new Date(entry.endTime);

      // Update local state optimistically (no API call yet)
      if (dragging.edge === "top") {
        // Don't allow start to go past end
        if (newTime < currentEnd) {
          setDraggedTimes((prev) => ({
            ...prev,
            [dragging.entryId]: { startTime: newTime, endTime: currentEnd },
          }));
        }
      } else {
        // Don't allow end to go before start
        if (newTime > currentStart) {
          setDraggedTimes((prev) => ({
            ...prev,
            [dragging.entryId]: { startTime: currentStart, endTime: newTime },
          }));
        }
      }
    };

    const handleMouseUp = async () => {
      // Now that dragging is complete, save to API
      if (dragging) {
        const draggedEntry = draggedTimes[dragging.entryId];
        if (draggedEntry) {
          const { startTime, endTime } = draggedEntry;
          
          // Optimistically update the local state immediately
          setTimeEntries((prev) =>
            prev.map((entry) =>
              entry.id === dragging.entryId
                ? {
                    ...entry,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    durationMinutes: Math.round(
                      (endTime.getTime() - startTime.getTime()) / 60000
                    ),
                  }
                : entry
            )
          );
          
          // Update via API (fire and forget)
          const durationMinutes = Math.round(
            (endTime.getTime() - startTime.getTime()) / 1000 / 60
          );

          fetch(`/api/time/${dragging.entryId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              durationMinutes,
            }),
          }).catch((err) => {
            console.error("Error updating time entry:", err);
            // On error, refresh to get the correct state from server
            fetchDayData();
          });
        }
        
        // Set flag to prevent click event from firing
        setJustFinishedDragging(true);
      }
      
      setDragging(null);
      setDraggedTimes({});
      // Don't refresh - the optimistic update is enough
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, timeEntries, draggedTimes, selectedDate]);

  const renderHourMarkers = () => {
    const hours = [];
    for (let i = 0; i < 24; i++) {
      hours.push(
        <div
          key={i}
          className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
          style={{ top: `${i * HOUR_HEIGHT}px` }}
        >
          <span className="absolute -top-2 left-1 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 px-1">
            {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
          </span>
        </div>
      );
    }
    return hours;
  };

  const renderSessions = () => {
    return mergedSessions.map((session) => {
      const start = new Date(session.startTime);
      const end = new Date(session.endTime);
      const top = timeToY(start);
      const bottom = timeToY(end);
      const height = bottom - top;

      return (
        <div
          key={session.id}
          className="timeline-session absolute left-0 right-0 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded px-1 overflow-hidden cursor-help"
          style={{
            top: `${top}px`,
            height: `${height}px`,
            minHeight: "2px",
          }}
          title={`${session.appClass}\n${session.windowTitle || ""}\n${Math.round(session.durationSeconds / 60)} min`}
        >
          {height > 20 && (
            <div className="text-xs text-blue-800 dark:text-blue-200 truncate">
              <div className="font-semibold truncate">{session.appClass}</div>
              {height > 35 && session.windowTitle && (
                <div className="text-blue-600 dark:text-blue-300 truncate text-[10px]">
                  {session.windowTitle}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const renderTimeEntries = () => {
    return timeEntries.map((entry) => {
      // Use dragged times if this entry is being dragged, otherwise use original times
      const draggedEntry = draggedTimes[entry.id];
      const start = draggedEntry
        ? new Date(draggedEntry.startTime)
        : new Date(entry.startTime);
      const end = draggedEntry
        ? new Date(draggedEntry.endTime)
        : new Date(entry.endTime);
      
      const top = timeToY(start);
      const bottom = timeToY(end);
      const height = bottom - top;

      const isDraggingThis = dragging?.entryId === entry.id;

      // Get overlap position
      const position = overlapPositions[entry.id] || { column: 0, totalColumns: 1 };
      const widthPercent = 100 / position.totalColumns;
      const leftPercent = (position.column / position.totalColumns) * 100;
      
      // Add small gap between overlapping entries
      const gap = position.totalColumns > 1 ? 1 : 0; // 1% gap on each side

      // Color variations for overlapping entries (4 different shades)
      const colors = [
        { bg: 'rgba(34, 197, 94, 0.15)', bgDark: 'rgba(34, 197, 94, 0.25)', border: 'rgb(34, 197, 94)' },
        { bg: 'rgba(16, 185, 129, 0.15)', bgDark: 'rgba(16, 185, 129, 0.25)', border: 'rgb(16, 185, 129)' },
        { bg: 'rgba(5, 150, 105, 0.15)', bgDark: 'rgba(5, 150, 105, 0.25)', border: 'rgb(5, 150, 105)' },
        { bg: 'rgba(4, 120, 87, 0.15)', bgDark: 'rgba(4, 120, 87, 0.25)', border: 'rgb(4, 120, 87)' },
      ] as const;
      const colorScheme = colors[position.column % 4]!;

      return (
        <div
          key={entry.id}
          className={`timeline-entry absolute border-2 rounded px-2 overflow-hidden ${
            isDraggingThis ? "opacity-70" : ""
          }`}
          style={{
            top: `${top}px`,
            height: `${height}px`,
            minHeight: "20px",
            left: `calc(${leftPercent}% + ${gap}px)`,
            right: `calc(${100 - leftPercent - widthPercent}% + ${gap}px)`,
            backgroundColor: isDraggingThis 
              ? 'rgba(34, 197, 94, 0.2)' 
              : colorScheme.bg,
            borderColor: colorScheme.border,
          }}
        >
          {/* Top resize handle */}
          <div
            className="absolute top-0 left-0 right-0 h-2 bg-green-600 dark:bg-green-500 cursor-ns-resize hover:bg-green-700 dark:hover:bg-green-400"
            onMouseDown={(e) => handleDragStart(e, entry.id, "top", start)}
          />
          
          {/* Content */}
          <div className="py-2 text-xs">
            <div className="font-semibold text-green-900 dark:text-green-100 truncate">
              {entry.project.name}
            </div>
            {height > 35 && (
              <div className="text-green-700 dark:text-green-200 text-[10px] truncate">
                {entry.project.client.name}
              </div>
            )}
            {height > 50 && entry.description && (
              <div className="text-green-600 dark:text-green-300 text-[10px] truncate mt-1">
                {entry.description}
              </div>
            )}
            {height > 65 && (
              <div className="text-green-600 dark:text-green-300 text-[10px] mt-1">
                {start.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {" - "}
                {end.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>

          {/* Bottom resize handle */}
          <div
            className="absolute bottom-0 left-0 right-0 h-2 bg-green-600 dark:bg-green-500 cursor-ns-resize hover:bg-green-700 dark:hover:bg-green-400"
            onMouseDown={(e) => handleDragStart(e, entry.id, "bottom", end)}
          />
        </div>
      );
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => changeDay(-1)}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm"
          >
            ← Prev
          </button>
          <button
            onClick={goToToday}
            className={`px-3 py-1 rounded text-sm font-medium ${
              isToday(selectedDate)
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => changeDay(1)}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm"
          >
            Next →
          </button>
        </div>
        <div className="text-center font-semibold text-gray-900 dark:text-gray-100">
          {formatDate(selectedDate)}
        </div>
      </div>

      {/* Timeline */}
      <div className="p-4" style={dragging ? { userSelect: 'none' } : {}}>
        <div className="grid grid-cols-2 gap-4">
          {/* Activity Sessions Column */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Activity Sessions
            </h3>
            <div className="relative bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div
                ref={activityScrollRef}
                className="relative overflow-y-auto"
                style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                onScroll={handleActivityScroll}
              >
                <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingBottom: '40px' }}>
                  {renderHourMarkers()}
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800 bg-opacity-50">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                    </div>
                  ) : (
                    <div className="relative ml-12">{renderSessions()}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Time Entries Column */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Project Time Entries
            </h3>
            <div className="relative bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div
                ref={timelineRef}
                className="relative overflow-y-auto cursor-crosshair"
                style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                onClick={handleTimelineClick}
                onScroll={handleTimelineScroll}
              >
                <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingBottom: '40px' }}>
                  {renderHourMarkers()}
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-800 bg-opacity-50">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                    </div>
                  ) : (
                    <div className="relative ml-12">{renderTimeEntries()}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p>
            <strong>Activity Sessions:</strong> Hover to see details. Data from external tracking utility.
          </p>
          <p>
            <strong>Project Entries:</strong> Click empty space to create. Drag top/bottom edges to resize.
          </p>
        </div>
      </div>
    </div>
  );
}
