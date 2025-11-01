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
    color: string; // Hex color code
    client: {
      name: string;
    };
  };
}

interface DayTimelineProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onCreateEntry?: (startTime: Date, endTime: Date) => void; // Made optional since we'll handle creation internally
}

interface Project {
  id: number;
  name: string;
  color: string; // Hex color code
  clientId: number;
  client: {
    name: string;
  };
}

const PIXELS_PER_HOUR = 60; // Height of one hour in pixels
const HOUR_HEIGHT = PIXELS_PER_HOUR;
const TIMELINE_PADDING_TOP = 16; // Padding at the top of the timeline
const TIMELINE_DRAG_OFFSET = -8;

export default function DayTimeline({
  selectedDate,
  onDateChange,
}: DayTimelineProps) {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);

  // New entry creation state
  const [creatingEntry, setCreatingEntry] = useState<{
    startTime: Date;
    endTime: Date;
    y: number; // Y position for the dialog
  } | null>(null);
  const [ghostEntry, setGhostEntry] = useState<{
    startTime: Date;
    endTime: Date;
  } | null>(null);
  const [draggingNewEntry, setDraggingNewEntry] = useState<{
    startY: number;
    startTime: Date;
  } | null>(null);

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
            // lastSession.windowTitle = combined.length > 100
            //   ? combined.substring(0, 97) + '...'
            //   : combined;
            lastSession.windowTitle = combined
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

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  //  Start the timelines partway zoomed down on mount
  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) {
      timeline.scrollTop = timeline.scrollHeight * 0.3;
    }
  }, []);

  // Handle escape key to close creation dialog
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && creatingEntry) {
        setCreatingEntry(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [creatingEntry]);

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
    // Check if the time is on a different day than selectedDate
    const timeDay = new Date(time);
    timeDay.setHours(0, 0, 0, 0);
    const selectedDay = new Date(selectedDate);
    selectedDay.setHours(0, 0, 0, 0);

    const dayDiff = Math.floor((timeDay.getTime() - selectedDay.getTime()) / (1000 * 60 * 60 * 24));

    const hours = time.getHours();
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();

    // If it's the next day, add 24 hours to the position
    const totalHours = hours + (dayDiff * 24) + minutes / 60 + seconds / 3600;

    return totalHours * PIXELS_PER_HOUR;
  };

  // Convert Y position to time
  const yToTime = (y: number, baseDate: Date): Date => {
    const hours = y / PIXELS_PER_HOUR;
    const date = new Date(baseDate);
    date.setHours(0, 0, 0, 0);

    // Add the calculated hours
    const totalMs = hours * 60 * 60 * 1000;
    date.setTime(date.getTime() + totalMs);

    return date;
  };

  // Handle clicking on empty space to create new entry
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    if (justFinishedDragging) {
      setJustFinishedDragging(false);
      return;
    }
    if ((e.target as HTMLElement).closest(".timeline-entry")) return;
    if ((e.target as HTMLElement).closest(".timeline-session")) return;

    // Check if clicking on scrollbar
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX;
    const isScrollbar = clickX > rect.right - 20; // Scrollbar is typically 15-20px wide
    if (isScrollbar) return;

    // Close any open edit forms
    setEditingEntryId(null);

    const scrollTop = timelineRef.current?.scrollTop || 0;
    const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
    const clickTime = yToTime(y, selectedDate);

    // Snap to 15-minute intervals
    const minutes = clickTime.getMinutes();
    const snappedMinutes = Math.round(minutes / 15) * 15;
    clickTime.setMinutes(snappedMinutes, 0, 0);

    // Start dragging to create new entry
    setDraggingNewEntry({
      startY: y,
      startTime: clickTime,
    });
  };

  // Handle mouse move for ghost entry and new entry dragging
  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return; // Don't show ghost when resizing existing entry
    if ((e.target as HTMLElement).closest(".timeline-entry")) {
      setGhostEntry(null);
      return;
    }

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scrollTop = timelineRef.current?.scrollTop || 0;
    const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
    const hoverTime = yToTime(y, selectedDate);

    // Snap to 15-minute intervals
    const minutes = hoverTime.getMinutes();
    const snappedMinutes = Math.round(minutes / 15) * 15;
    hoverTime.setMinutes(snappedMinutes, 0, 0);

    if (draggingNewEntry) {
      // Update ghost entry while dragging
      const startTime = draggingNewEntry.startTime;
      const endTime = hoverTime;

      // Ensure start is before end
      if (endTime > startTime) {
        setGhostEntry({ startTime, endTime });
      } else if (endTime < startTime) {
        setGhostEntry({ startTime: endTime, endTime: startTime });
      }
    } else {
      // Show ghost entry with default 1-hour duration
      const endTime = new Date(hoverTime);
      endTime.setHours(endTime.getHours() + 1);
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

    // Snap to 15-minute intervals
    const minutes = endTimeRaw.getMinutes();
    const snappedMinutes = Math.round(minutes / 15) * 15;
    endTimeRaw.setMinutes(snappedMinutes, 0, 0);

    let startTime = draggingNewEntry.startTime;
    let endTime = endTimeRaw;

    // Ensure start is before end
    if (endTime < startTime) {
      [startTime, endTime] = [endTime, startTime];
    }

    // Default to 1 hour duration if the drag was very small (less than 15 minutes)
    const durationMs = endTime.getTime() - startTime.getTime();
    const minDuration = 15 * 60 * 1000; // 15 minutes
    if (durationMs < minDuration) {
      // Use 1 hour as default (matching the ghost entry)
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    // Calculate dialog position - center it on screen
    const viewportHeight = window.innerHeight;
    const dialogHeight = 500; // Approximate dialog height
    const idealY = Math.max(20, Math.min(viewportHeight - dialogHeight - 20, (viewportHeight - dialogHeight) / 2));

    // Open creation dialog
    setCreatingEntry({
      startTime,
      endTime,
      y: idealY,
    });

    setDraggingNewEntry(null);
    setGhostEntry(null);
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

      // Account for scroll offset and padding
      const scrollTop = timelineRef.current?.scrollTop || 0;
      const y = e.clientY - rect.top + scrollTop - TIMELINE_PADDING_TOP + TIMELINE_DRAG_OFFSET;
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

  // Handle creating a new entry from the dialog
  const handleCreateEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!creatingEntry) return;

    const formData = new FormData(e.currentTarget);
    const projectId = parseInt(formData.get('projectId') as string);
    const description = formData.get('description') as string;
    const billable = formData.get('billable') === 'on';

    try {
      const durationMinutes = Math.round(
        (creatingEntry.endTime.getTime() - creatingEntry.startTime.getTime()) / 60000
      );

      const response = await fetch("/api/time", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          description: description || null,
          startTime: creatingEntry.startTime.toISOString(),
          endTime: creatingEntry.endTime.toISOString(),
          durationMinutes,
          billable,
        }),
      });

      if (!response.ok) throw new Error("Failed to create");

      // Refresh data
      await fetchDayData();
      setCreatingEntry(null);
    } catch (error) {
      console.error("Error creating entry:", error);
      alert("Failed to create entry");
    }
  };

  const renderHourMarkers = () => {
    const hours = [];
    for (let i = 0; i <= 24; i++) {
      const label = i === 0 ? "12 AM"
        : i < 12 ? `${i} AM`
          : i === 12 ? "12 PM"
            : i === 24 ? "12 AM"
              : `${i - 12} PM`;

      hours.push(
        <div
          key={i}
          data-is-noon-midnight={i % 12 === 0 ? "true" : "false"}
          className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-800 data-[is-noon-midnight=true]:border-t-3 even:border-dashed"
          style={{ top: `${i * HOUR_HEIGHT + TIMELINE_PADDING_TOP}px`, width: 'calc(100% + 1rem)' }}
        >
          <span className="absolute -top-2 left-1 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 px-1 select-none">
            {label}
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
      const top = timeToY(start) + TIMELINE_PADDING_TOP;
      const bottom = timeToY(end) + TIMELINE_PADDING_TOP;
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
            <div className="flex flex-wrap text-xs text-blue-800 dark:text-blue-200 truncate">
              {(height > 35 && session.windowTitle) ? (
                <>
                  <div className="font-semibold truncate mb-0.5">{session.appClass}</div>
                  <div className="w-full text-blue-600 dark:text-blue-300 text-[10px]">
                    {session.windowTitle.split(' / ').map((title, index) => (
                      <div key={index} className="truncate">
                        {/* remove everything after the last " - ", including the " - " */}
                        {title.slice(0, title.lastIndexOf(' - ') > 0 ? title.lastIndexOf(' - ') : title.length)}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="truncate">
                  <span className="font-semibold">{session.appClass}</span>
                  {/* split by " - " and then only keep everything before the first " - " */}
                  <span className="text-[10px] text-blue-600 dark:text-blue-300">{session.windowTitle ? ` - ${session.windowTitle.split(' / ').map(title => title.slice(0, title.indexOf(' - ') > 0 ? title.indexOf(' - ') : title.length)).join(' - ')}` : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const renderTimeEntries = () => {
    const entries = [...timeEntries];
    
    // Add ghost entry if present
    if (ghostEntry) {
      entries.push({
        id: -1, // Temporary ID for ghost
        projectId: 0,
        description: null,
        startTime: ghostEntry.startTime.toISOString(),
        endTime: ghostEntry.endTime.toISOString(),
        durationMinutes: Math.round(
          (ghostEntry.endTime.getTime() - ghostEntry.startTime.getTime()) / 60000
        ),
        billable: true,
        project: {
          id: 0,
          name: "New Entry",
          color: "#9CA3AF", // Gray for ghost
          client: {
            name: "Click & Drag",
          },
        },
      } as TimeEntry);
    }

    return entries.map((entry) => {
      const isGhost = entry.id === -1;
      
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

      // Get overlap position (skip for ghost)
      const position = isGhost 
        ? { column: 0, totalColumns: 1 }
        : (overlapPositions[entry.id] || { column: 0, totalColumns: 1 });
      const widthPercent = 100 / position.totalColumns;
      const leftPercent = (position.column / position.totalColumns) * 100;

      // Add small gap between overlapping entries
      const gap = position.totalColumns > 1 ? 1 : 0; // 1% gap on each side

      // Use project color with alpha for background
      const projectColor = entry.project.color || '#22C55E';
      
      // Convert hex to RGB for alpha transparency
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1]!, 16),
          g: parseInt(result[2]!, 16),
          b: parseInt(result[3]!, 16)
        } : { r: 34, g: 197, b: 94 }; // Default green
      };

      const rgb = hexToRgb(projectColor);
      const colorScheme = isGhost
        ? { bg: 'rgba(156, 163, 175, 0.2)', bgDark: 'rgba(156, 163, 175, 0.3)', border: 'rgb(156, 163, 175)', text: 'rgb(75, 85, 99)', textDark: 'rgb(156, 163, 175)' }
        : { 
            bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
            bgDark: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`,
            border: projectColor,
            text: projectColor,
            textDark: projectColor
          };

      const handleEntryClick = (e: React.MouseEvent) => {
        if (isGhost) return; // Don't allow clicking ghost entries
        
        // Don't trigger if clicking on resize handles
        if ((e.target as HTMLElement).classList.contains('cursor-ns-resize')) {
          return;
        }
        // Don't trigger if clicking on form elements
        if ((e.target as HTMLElement).closest('form')) {
          return;
        }
        // Don't trigger if currently dragging
        if (dragging) {
          return;
        }
        // Toggle editing mode
        setEditingEntryId(editingEntryId === entry.id ? null : entry.id);
      };

      const isEditing = editingEntryId === entry.id;

      const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const formData = new FormData(e.currentTarget);
        const projectId = parseInt(formData.get('projectId') as string);
        const description = formData.get('description') as string;
        const billable = formData.get('billable') === 'on';

        try {
          const response = await fetch(`/api/time/${entry.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              projectId,
              description: description || null,
              billable,
            }),
          });

          if (!response.ok) throw new Error("Failed to update");

          // Refresh data
          await fetchDayData();
          setEditingEntryId(null);
        } catch (error) {
          console.error("Error updating entry:", error);
          alert("Failed to update entry");
        }
      };

      const handleDelete = async () => {
        if (!confirm("Delete this time entry?")) return;

        try {
          const response = await fetch(`/api/time/${entry.id}`, {
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

      return (
        <div
          key={entry.id}
          className={`timeline-entry absolute flex items-center border-2 rounded px-2 ${isDraggingThis ? "opacity-70" : ""
            } ${isGhost ? "opacity-50 border-dashed pointer-events-none" : ""} ${isEditing ? "overflow-visible z-50" : "overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"}`}
          style={{
            top: `${top}px`,
            height: `${height}px`,
            minHeight: "20px",
            left: `calc(${leftPercent}% + ${gap}px)`,
            right: `calc(${100 - leftPercent - widthPercent}% + ${gap}px)`,
            backgroundColor: colorScheme.bg,
            borderColor: colorScheme.border,
          }}
          onClick={isEditing ? undefined : handleEntryClick}
        >
          {/* Don't render resize handles or content for ghost entries */}
          {!isGhost && (
            <>
              {/* Top resize handle */}
              <div
                className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10"
                style={{ 
                  backgroundColor: colorScheme.border,
                  opacity: 1
                }}
                onMouseDown={(e) => handleDragStart(e, entry.id, "top", start)}
              />

              {/* Content or Edit Form */}
              {isEditing ? (
                <div className="absolute z-20 top-0 left-0 right-0 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded shadow-2xl p-3 max-w-full w-[340px]" style={{ minHeight: '200px' }}>
                  <form onSubmit={handleSaveEdit} className="space-y-2">
                    <div>
                      <header className="flex justify-between gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <label id="project-label">
                          Project
                        </label>

                        <div className="flex gap-2 items-center">
                          <label htmlFor={`billable-${entry.id}`} className="text-xs text-gray-700 dark:text-gray-300">
                            Billable
                          </label>
                          <input
                            type="checkbox"
                            name="billable"
                            id={`billable-${entry.id}`}
                            defaultChecked={entry.billable}
                          />
                        </div>

                      </header>
                      <select
                        name="projectId"
                        defaultValue={entry.projectId}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.client.name} - {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <textarea
                        name="description"
                        defaultValue={entry.description || ''}
                        rows={2}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-2">
                      <span>
                        {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        {" - "}
                        {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span>
                        ({Math.round((end.getTime() - start.getTime()) / 60000)} min)
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <div className="grow flex gap-2 flex-wrap" >
                        <button
                          type="submit"
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEntryId(null);
                          }}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete();
                        }}
                        className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="py-2 text-xs">
                  <div className="font-semibold truncate" style={{ color: isDraggingThis ? colorScheme.text : colorScheme.text }}>
                    {entry.project.name}
                  </div>
                  {height > 40 && (
                    <div className="text-[10px] truncate" style={{ color: colorScheme.text, opacity: 0.8 }}>
                      {entry.project.client.name}
                      {(height < 70 && entry.description) ? ` - ${entry.description}` : ""}
                    </div>
                  )}
                  {height >= 70 && entry.description && (
                    <div className="text-[10px] truncate mt-1" style={{ color: colorScheme.text, opacity: 0.7 }}>
                      {entry.description}
                    </div>
                  )}
                  {height > 100 && (
                    <div className="text-[10px] mt-1" style={{ color: colorScheme.text, opacity: 0.7 }}>
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
              )}

              {/* Bottom resize handle */}
              <div
                className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10"
                style={{ 
                  backgroundColor: colorScheme.border,
                  opacity: 1
                }}
                onMouseDown={(e) => handleDragStart(e, entry.id, "bottom", end)}
              />
            </>
          )}
          
          {/* Ghost entry content */}
          {isGhost && (
            <div className="py-2 text-xs text-center">
              <div className="font-semibold text-gray-500 dark:text-gray-400">
                {draggingNewEntry ? "Release to create" : "Click & drag to create"}
              </div>
              {height > 35 && (
                <div className="text-gray-400 dark:text-gray-500 text-[10px] mt-1">
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
              {height > 50 && (
                <div className="text-gray-400 dark:text-gray-500 text-[10px]">
                  ({Math.round((end.getTime() - start.getTime()) / 60000)} min)
                </div>
              )}
            </div>
          )}
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
            className={`px-3 py-1 rounded text-sm font-medium ${isToday(selectedDate)
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
      <div
        className="p-4 relative"
        style={dragging ? {
          userSelect: 'none'
        } : {}}
      >
        {/* Overlay during drag to prevent cursor flickering */}
        {dragging && (
          <div
            className="fixed inset-0 z-50"
            style={{ cursor: 'ns-resize' }}
          />
        )}
        <div className="grid grid-cols-2 gap-4">
          {/* Activity Sessions Column */}
          <div className="select-none">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Activity Sessions
            </h3>
            <div className="relative bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div
                ref={activityScrollRef}
                className="relative pr-4 overflow-y-auto overflow-x-visible"
                style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                onScroll={handleActivityScroll}
              >
                <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingTop: `${TIMELINE_PADDING_TOP}px`, paddingBottom: '40px' }}>
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
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 select-none">
              Project Time Entries
            </h3>
            <div className="relative bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div
                ref={timelineRef}
                className="relative overflow-y-auto overflow-x-visible cursor-crosshair pr-4"
                style={{ height: `${24 * HOUR_HEIGHT + 40}px`, maxHeight: "640px" }}
                onMouseDown={handleTimelineMouseDown}
                onMouseMove={handleTimelineMouseMove}
                onMouseUp={handleTimelineMouseUp}
                onMouseLeave={handleTimelineMouseLeave}
                onScroll={handleTimelineScroll}
              >
                <div className="relative" style={{ height: `${24 * HOUR_HEIGHT + 40}px`, paddingTop: `${TIMELINE_PADDING_TOP}px`, paddingBottom: '40px' }}>
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

        {/* Creation Dialog */}
        {creatingEntry && (
          <>
            {/* Backdrop - subtle and allows clicking through */}
            <div 
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setCreatingEntry(null)}
            />
            
            {/* Dialog */}
            <div 
              className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none" 
              style={{ paddingTop: `${creatingEntry.y}px` }}
            >
              <div className="bg-white dark:bg-gray-800 border-2 border-green-500 rounded-lg shadow-2xl p-4 w-[400px] pointer-events-auto">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Create Time Entry
                </h3>
                <form onSubmit={handleCreateEntry} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project
                  </label>
                  <select
                    name="projectId"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                    required
                    autoFocus
                  >
                    <option value="">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.client.name} - {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="What did you work on?"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="billable"
                    id="new-billable"
                    defaultChecked={true}
                  />
                  <label htmlFor="new-billable" className="text-sm text-gray-700 dark:text-gray-300">
                    Billable
                  </label>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Start:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {creatingEntry.startTime.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600 dark:text-gray-400">End:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {creatingEntry.endTime.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                    <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {Math.round(
                        (creatingEntry.endTime.getTime() - creatingEntry.startTime.getTime()) /
                          60000
                      )}{" "}
                      minutes
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                  >
                    Create Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingEntry(null)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
          </>
        )}

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <p>
            <strong>Activity Sessions:</strong> Hover to see details. Data from external tracking utility.
          </p>
          <p>
            <strong>Project Entries:</strong> Click & drag to create new entries. Click entry to edit. Drag top/bottom edges to resize.
          </p>
        </div>
      </div>
    </div>
  );
}
