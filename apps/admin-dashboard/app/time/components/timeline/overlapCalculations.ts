import { Temporal } from "@/lib/temporal-polyfill";
import { ActivitySession, TimeEntry } from "./utils";

export interface OverlapPosition {
  column: number;
  totalColumns: number;
  // Optional: number of columns this activity spans (for width calculation)
  // If undefined, spans 1 column. If defined, spans this many columns.
  columnSpan?: number;
}

/**
 * Calculate overlapping positions for activity sessions
 * Uses a "gravity to the left" algorithm to pack sessions into columns optimally
 */
export function calculateActivityOverlaps(
  sessions: ActivitySession[]
): { [key: number]: OverlapPosition } {
  const sessionsWithTimes = sessions.map((session) => ({
    id: session.id,
    appClass: session.appClass,
    start: new Date(session.startTime),
    end: new Date(session.endTime),
  }));

  // Sort sessions by start time, then by end time (longer sessions first)
  const sortedSessions = [...sessionsWithTimes].sort((a, b) => {
    if (a.start.getTime() !== b.start.getTime()) {
      return a.start.getTime() - b.start.getTime();
    }
    // If start times are equal, longer sessions come first
    return b.end.getTime() - a.end.getTime();
  });

  const positions: { [key: number]: OverlapPosition } = {};
  const columnAssignments: { [sessionId: number]: number } = {};
  
  // Track which columns are occupied at any given time
  // Each entry is { sessionId, endTime }
  const columns: Array<{ sessionId: number; endTime: Date } | null> = [];

  // First pass: assign columns using greedy left-packing
  for (const session of sortedSessions) {
    // Find the leftmost available column
    let assignedColumn = -1;
    
    for (let col = 0; col < columns.length; col++) {
      const occupant = columns[col];
      // Column is available if it's empty or the previous session ended before this one starts
      if (!occupant || occupant.endTime <= session.start) {
        assignedColumn = col;
        break;
      }
    }
    
    // If no column was available, create a new one
    if (assignedColumn === -1) {
      assignedColumn = columns.length;
      columns.push(null);
    }
    
    // Assign this session to the column
    columns[assignedColumn] = {
      sessionId: session.id,
      endTime: session.end,
    };
    columnAssignments[session.id] = assignedColumn;
  }

  // Calculate the true maximum concurrent sessions during each session's time period
  const maxColumnMap: { [sessionId: number]: number } = {};
  
  // Debugging: collect all calculation details
  const debugInfo: any[] = [];
  
  for (const session of sessionsWithTimes) {
    // Find all sessions that overlap with this one (including itself)
    const overlapping = sessionsWithTimes.filter((other) => {
      return session.start < other.end && session.end > other.start;
    });
    
    // Collect all time boundaries within this session's duration
    const boundaries = new Set<number>();
    overlapping.forEach((s) => {
      // Only consider boundaries within the current session's time range
      if (s.start >= session.start && s.start < session.end) {
        boundaries.add(s.start.getTime());
      }
      if (s.end > session.start && s.end <= session.end) {
        boundaries.add(s.end.getTime());
      }
    });
    // Always include the session's own start time
    boundaries.add(session.start.getTime());
    
    // Find the maximum number of concurrent sessions at any boundary point
    let maxConcurrent = 0;
    const concurrencyAtBoundaries: any[] = [];
    
    for (const boundaryTime of boundaries) {
      const boundary = new Date(boundaryTime);
      // Count how many sessions are active at this exact moment
      const activeSessions = overlapping.filter((s) => {
        return s.start <= boundary && s.end > boundary;
      });
      const activeCount = activeSessions.length;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      
      concurrencyAtBoundaries.push({
        time: boundary.toISOString(),
        count: activeCount,
        activeIds: activeSessions.map(s => s.id)
      });
    }
    
    // Total columns is based on actual max concurrent, not total overlaps
    maxColumnMap[session.id] = maxConcurrent;
    
    debugInfo.push({
      sessionId: session.id,
      appClass: session.appClass,
      start: session.start.toISOString(),
      end: session.end.toISOString(),
      assignedColumn: columnAssignments[session.id],
      overlappingIds: overlapping.map(s => s.id),
      overlappingCount: overlapping.length,
      maxConcurrent,
      boundaries: concurrencyAtBoundaries
    });
  }
  
  // Propagate the maximum totalColumns across all overlapping sessions
  // This ensures that overlapping sessions have the same width
  const finalMaxColumnMap: { [sessionId: number]: number } = {};
  
  for (const session of sessionsWithTimes) {
    // Find all sessions that overlap with this one
    const overlapping = sessionsWithTimes.filter((other) => {
      return session.start < other.end && session.end > other.start;
    });
    
    // Find the maximum maxConcurrent value among all overlapping sessions
    let maxOfOverlapping = maxColumnMap[session.id] ?? 1;
    overlapping.forEach((other) => {
      maxOfOverlapping = Math.max(maxOfOverlapping, maxColumnMap[other.id] ?? 1);
    });
    
    finalMaxColumnMap[session.id] = maxOfOverlapping;
  }
  
  // Log the debug info to console
  // console.log('🔍 Activity Overlap Calculations:', {
  //   totalSessions: sessionsWithTimes.length,
  //   details: debugInfo
  // });

  // Second pass: build the final position objects
  for (const session of sessionsWithTimes) {
    const column = columnAssignments[session.id] ?? 0;
    const totalColumns = Math.min(finalMaxColumnMap[session.id] ?? 1, 4);
    
    positions[session.id] = {
      column: Math.min(column, totalColumns - 1), // Ensure column doesn't exceed totalColumns
      totalColumns,
    };
  }
  
  // Third pass: expand rightmost activities into unused columns to their right
  for (const session of sessionsWithTimes) {
    const position = positions[session.id];
    if (!position) continue;
    
    const { column, totalColumns } = position;
    
    // Skip if already in the rightmost column
    if (column >= totalColumns - 1) continue;
    
    // Find all sessions that overlap with this one in time
    const overlapping = sessionsWithTimes.filter((other) => {
      return session.start < other.end && session.end > other.start;
    });
    
    // Check if this session is the rightmost among overlapping sessions
    let isRightmost = true;
    for (const other of overlapping) {
      if (other.id === session.id) continue;
      const otherPosition = positions[other.id];
      if (otherPosition && otherPosition.column > column) {
        isRightmost = false;
        break;
      }
    }
    
    // Only expand if this is the rightmost session in the overlap group
    if (!isRightmost) continue;
    
    // Calculate how many columns this activity should span
    // It should span from its current column to the right edge
    const columnsToSpan = totalColumns - column;
    
    // Keep the original column and totalColumns for positioning,
    // but add columnSpan to indicate it should be wider
    positions[session.id] = {
      column,
      totalColumns,
      columnSpan: columnsToSpan,
    };
  }

  // Fourth pass: Remove overlapping sessions by keeping the longer duration one
  // This runs AFTER column expansion to catch any overlaps that occur due to spanning
  const sessionsToRemove = new Set<number>();
  
  for (const session of sessionsWithTimes) {
    if (sessionsToRemove.has(session.id)) continue;
    
    const sessionPosition = positions[session.id];
    if (!sessionPosition) continue;
    
    // Find all sessions that overlap with this one in both time AND position
    const overlappingInPosition = sessionsWithTimes.filter((other) => {
      if (other.id === session.id) return false;
      if (sessionsToRemove.has(other.id)) return false;
      
      const otherPosition = positions[other.id];
      if (!otherPosition) return false;
      
      // Check if they overlap in time
      const timeOverlap = session.start < other.end && session.end > other.start;
      if (!timeOverlap) return false;
      
      // Check if they overlap in position (same column or overlapping column spans)
      const sessionEnd = sessionPosition.column + (sessionPosition.columnSpan ?? 1);
      const otherEnd = otherPosition.column + (otherPosition.columnSpan ?? 1);
      
      const positionOverlap = sessionPosition.column < otherEnd && sessionEnd > otherPosition.column;
      
      return positionOverlap;
    });
    
    // If there are overlapping sessions, remove the shorter ones
    if (overlappingInPosition.length > 0) {
      const sessionDuration = session.end.getTime() - session.start.getTime();
      
      for (const other of overlappingInPosition) {
        const otherDuration = other.end.getTime() - other.start.getTime();
        
        // Remove the shorter session
        if (otherDuration < sessionDuration) {
          sessionsToRemove.add(other.id);
        } else if (otherDuration === sessionDuration && other.id > session.id) {
          // If durations are equal, remove the one with higher ID for consistency
          sessionsToRemove.add(other.id);
        }
      }
    }
  }
  
  // Remove the positions for sessions we're hiding
  for (const sessionId of sessionsToRemove) {
    delete positions[sessionId];
  }

  return positions;
}

/**
 * Calculate overlapping positions for time entries
 */
export function calculateTimeEntryOverlaps(
  timeEntries: TimeEntry[],
  draggedTimes: { [key: number]: { startTime: Temporal.ZonedDateTime; endTime: Temporal.ZonedDateTime } }
): { [key: number]: OverlapPosition } {
  const tz = Temporal.Now.timeZoneId();
  const entriesWithTimes = timeEntries.map((entry) => {
    const draggedEntry = draggedTimes[entry.id];
    return {
      id: entry.id,
      start: draggedEntry
        ? draggedEntry.startTime
        : Temporal.Instant.from(entry.startTime).toZonedDateTimeISO(tz),
      end: draggedEntry
        ? draggedEntry.endTime
        : Temporal.Instant.from(entry.endTime).toZonedDateTimeISO(tz),
    };
  });

  const positions: { [key: number]: OverlapPosition } = {};

  entriesWithTimes.forEach((entry) => {
    const overlappingEntries = entriesWithTimes.filter((other) => {
      if (entry.id === other.id) return false;
      return Temporal.ZonedDateTime.compare(entry.start, other.end) < 0 && 
             Temporal.ZonedDateTime.compare(entry.end, other.start) > 0;
    });

    if (overlappingEntries.length === 0) {
      positions[entry.id] = { column: 0, totalColumns: 1 };
      return;
    }

    const overlapGroup = [entry, ...overlappingEntries];
    const allTimes = new Set<bigint>();
    overlapGroup.forEach((e) => {
      allTimes.add(e.start.epochNanoseconds);
      allTimes.add(e.end.epochNanoseconds);
    });

    const sortedTimes = Array.from(allTimes).sort((a, b) => Number(a - b));
    let maxConcurrent = 0;
    const concurrentGroups: number[][] = [];

    for (let i = 0; i < sortedTimes.length - 1; i++) {
      const currentTime = sortedTimes[i];
      if (currentTime === undefined) continue;
      const checkTimeNanos = currentTime + 1n;
      const concurrent = overlapGroup.filter((e) => {
        return e.start.epochNanoseconds <= checkTimeNanos && e.end.epochNanoseconds > checkTimeNanos;
      });

      if (concurrent.length > maxConcurrent) {
        maxConcurrent = concurrent.length;
      }

      concurrentGroups.push(concurrent.map((e) => e.id));
    }

    const largestGroupWithEntry = concurrentGroups
      .filter((group) => group.includes(entry.id))
      .reduce((largest, current) => {
        return current.length > largest.length ? current : largest;
      }, [] as number[]);

    const sortedGroup = largestGroupWithEntry.sort((a, b) => a - b);
    const column = sortedGroup.indexOf(entry.id);

    positions[entry.id] = {
      column: column >= 0 ? column : 0,
      totalColumns: Math.min(maxConcurrent, 4),
    };
  });

  return positions;
}
