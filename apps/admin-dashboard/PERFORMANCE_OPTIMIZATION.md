# Day Timeline Performance Optimization

## Problem
The Day Timeline component was experiencing performance issues when there were many activity sessions. Symptoms included:
- Ghost element lagging behind cursor during hover/drag operations
- Noticeable slowdown on days with high activity session count
- Smooth performance on days with fewer activity sessions

## Root Cause
The performance issue was caused by **unnecessary re-renders** of the activity sessions timeline:

1. **Frequent state updates**: Mouse move events (even throttled) triggered state changes (`ghostEntry`, `draggingNewEntry`) 
2. **Expensive recalculations**: Each re-render recalculated:
   - `mergeAdjacentSessions()` - merges overlapping sessions
   - `calculateActivityOverlaps()` - complex algorithm to calculate positioning
3. **Cascading renders**: All activity session components re-rendered even though they hadn't changed

## Solution
Implemented a multi-layer memoization strategy to prevent unnecessary calculations and re-renders:

### 1. Extracted Memoized Component
Created `ActivitySessionsTimeline` as a separate memoized component:
```typescript
const ActivitySessionsTimeline = memo(function ActivitySessionsTimeline({
  sessions,
  loading,
}: {
  sessions: ActivitySessionType[];
  loading: boolean;
}) {
  // Only re-renders when sessions or loading changes
  // Not affected by dragging, ghost entries, etc.
});
```

**Benefit**: Activity sessions only re-render when the day changes or data refreshes, not on every mouse movement.

### 2. Memoized Expensive Calculations
Used `useMemo` for computationally expensive operations:

```typescript
// Inside ActivitySessionsTimeline
const mergedSessions = useMemo(() => mergeAdjacentSessions(sessions), [sessions]);
const activityOverlapPositions = useMemo(
  () => calculateActivityOverlaps(mergedSessions),
  [mergedSessions]
);
```

**Benefit**: These calculations only run when `sessions` changes, results are cached between renders.

### 3. Memoized Individual Activity Sessions
Wrapped `ActivitySession` component with `React.memo`:

```typescript
const ActivitySession = memo(function ActivitySession({ session, position }: ActivitySessionProps) {
  // ...
});
```

**Benefit**: Individual activity session components only re-render if their specific data changes.

### 4. Kept Time Entry Calculations Optimized
Time entries still use memoization but re-calculate when needed:
```typescript
const overlapPositions = useMemo(
  () => calculateTimeEntryOverlaps(timeEntries, draggedTimes),
  [timeEntries, draggedTimes]
);
```

**Benefit**: Time entries update smoothly during drag operations without affecting activity sessions.

## Performance Impact

### Before Optimization
- **Mouse move event**: Triggers full component re-render
- **Re-calculations per event**: `mergeAdjacentSessions()` + `calculateActivityOverlaps()` for all sessions
- **Components re-rendered**: Entire activity timeline + all session components
- **Result**: Lag proportional to number of activity sessions

### After Optimization
- **Mouse move event**: Updates ghost entry state only
- **Re-calculations per event**: Only `calculateTimeEntryOverlaps()` (for time entries, not activities)
- **Components re-rendered**: Only time entry components and ghost entry
- **Result**: Smooth performance regardless of activity session count

## Key Principle
The optimization follows React's principle: **Separate concerns by their update frequency**

- **Rarely changes**: Activity sessions (only when day changes) → Heavily memoized
- **Frequently changes**: Time entries, ghost entry (during mouse interaction) → Normal reactivity

## Files Modified
1. `apps/admin-dashboard/app/time/components/DayTimeline.tsx`
   - Added `ActivitySessionsTimeline` memoized component
   - Moved activity session rendering into isolated component
   - Added `useMemo` for time entry overlap calculations

2. `apps/admin-dashboard/app/time/components/timeline/ActivitySession.tsx`
   - Wrapped component with `React.memo`
   - No functional changes to rendering logic

## Testing
Test the performance improvement by:
1. Navigate to a day with many activity sessions (>50 sessions)
2. Hover over the project tracking timeline
3. Observe that the ghost element follows cursor smoothly
4. Create/edit time entries by dragging
5. Verify activity sessions don't flicker or re-render during interactions

## Future Considerations
If further optimization is needed:
- Consider virtualizing activity sessions (only render visible ones)
- Implement windowing for very long timelines (24+ hours)
- Profile `calculateActivityOverlaps()` for potential algorithmic improvements
