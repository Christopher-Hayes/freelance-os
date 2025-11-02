# DayTimeline Component Migration Checklist

This checklist guides the migration of `DayTimeline.tsx` to use the new Temporal-based datetime system.

## Pre-Migration

- [x] Install `@js-temporal/polyfill` package
- [x] Create datetime utilities (`lib/datetime.ts`)
- [x] Create `ClientDateTime` components
- [x] Create `useTemporal` hooks
- [x] Update `tsconfig.json` with path mappings
- [x] Import polyfill in root layout

## State Management Updates

- [ ] Add Temporal import: `import { Temporal } from '@/lib/temporal-polyfill';`
- [ ] Update `selectedDate` state type if needed (can stay as Date for now)
- [ ] Ensure `isClient` state exists for current time line

## Function Migrations

### `timeToY(time: Date): number`
- [ ] Update signature to accept `Date | Temporal.ZonedDateTime`
- [ ] Convert Date to Temporal.ZonedDateTime if needed
- [ ] Replace `getHours()`, `getMinutes()`, `getSeconds()` with Temporal equivalents
- [ ] Replace day difference calculation with `Temporal.PlainDate.since()`
- [ ] Test with various times and dates

### `yToTime(y: number, baseDate: Date): Date`
- [ ] Update return type to `Temporal.ZonedDateTime` (or keep Date for backward compatibility)
- [ ] Convert baseDate to Temporal.PlainDate
- [ ] Use `toZonedDateTime()` with midnight time
- [ ] Use `.add({ hours })` instead of millisecond math
- [ ] Test roundtrip: `timeToY(yToTime(y))` should equal `y`

### `formatDate(date: Date): string`
- [ ] Replace with `formatDate()` from `@/lib/datetime`
- [ ] Or use `ClientDate` component directly in JSX

### `isToday(date: Date): boolean`
- [ ] Replace with `isToday()` from `@/lib/datetime`
- [ ] Convert Date to Instant if needed

### `fetchDayData()`
- [ ] Update date formatting to use `Temporal.PlainDate.toString()`
- [ ] Ensure API receives proper `YYYY-MM-DD` format

## Component Updates

### `renderCurrentTimeLine()`
- [ ] Keep `isClient` check at start
- [ ] Replace `new Date()` with `nowLocal()` from `@/lib/datetime`
- [ ] Convert to ZonedDateTime for `timeToY()` calculation
- [ ] Keep `Math.round()` for pixel position to avoid sub-pixel rendering issues

### Time Entry Rendering
- [ ] Replace direct time formatting with utility functions or `ClientTime` component
- [ ] Update tooltip/title attributes with formatted times
- [ ] Consider using `formatDuration()` for duration display

### Activity Session Rendering
- [ ] Same updates as Time Entry rendering
- [ ] Ensure hover tooltips show properly formatted times

### Ghost Entry Display
- [ ] Update time display in ghost entry
- [ ] Use formatting utilities for consistency

## Form/Dialog Updates

### Creation Dialog (`creatingEntry` state)
- [ ] Display times using `ClientTime` component or formatting utilities
- [ ] Ensure start/end times are shown in local timezone
- [ ] Format duration display with `formatDuration()`

### Edit Form
- [ ] Same updates as creation dialog
- [ ] Verify time display in edit mode

## Event Handler Updates

### Mouse Event Handlers
- [ ] `handleTimelineMouseDown` - Ensure time snapping works with Temporal
- [ ] `handleTimelineMouseMove` - Ghost entry time updates
- [ ] `handleTimelineMouseUp` - Final time calculation
- [ ] `handleDragStart` - Initial time capture
- [ ] Drag move handlers - Time adjustment calculations

### Time Snapping Logic
- [ ] Update 15-minute snapping to use Temporal duration math
- [ ] Test that snapping works correctly across hour boundaries

## API Integration

### Fetch Functions
- [ ] Verify `fetchDayData()` sends proper date format to API
- [ ] Ensure API responses have UTC ISO strings
- [ ] Test with various date ranges

### Update Functions
- [ ] Verify time entry create/update sends UTC ISO strings
- [ ] Test timezone handling when creating entries near midnight

## Testing Checklist

### Visual Tests
- [ ] Current time line appears at correct position
- [ ] Time entries appear at correct y-position
- [ ] Activity sessions appear at correct y-position
- [ ] Hour markers align properly
- [ ] Ghost entry follows mouse correctly

### Functional Tests
- [ ] Create new time entry (drag to create)
- [ ] Resize time entry (drag edges)
- [ ] Edit time entry
- [ ] Delete time entry
- [ ] Navigate between days
- [ ] Jump to today

### Edge Cases
- [ ] Midnight crossing (entries that span midnight)
- [ ] DST transitions (if applicable)
- [ ] Very short entries (< 15 minutes)
- [ ] Very long entries (> 24 hours)
- [ ] Overlapping entries

### Timezone Tests
- [ ] Change system timezone and verify display updates
- [ ] Test with timezone offset of UTC+0, UTC-5, UTC+9
- [ ] Verify API sends/receives UTC regardless of local timezone

### Hydration Tests
- [ ] No hydration warnings in browser console
- [ ] Current time line doesn't cause flashing on load
- [ ] Times render consistently between server and client

## Performance Checks

- [ ] No excessive re-renders when time updates
- [ ] Smooth dragging performance
- [ ] No layout shifts during time updates
- [ ] Ghost entry rendering is smooth

## Cleanup

- [ ] Remove any unused Date manipulation code
- [ ] Remove old time formatting functions
- [ ] Add JSDoc comments to updated functions
- [ ] Update inline comments to reference Temporal

## Documentation

- [ ] Add code comments explaining Temporal usage
- [ ] Document any gotchas or edge cases
- [ ] Update component README if exists

## Final Verification

- [ ] Run `pnpm build` to check for type errors
- [ ] Test in production build
- [ ] Verify no console errors or warnings
- [ ] Get code review from team member

## Optional Enhancements

- [ ] Add timezone selector for viewing times in different zones
- [ ] Show UTC time in tooltips alongside local time
- [ ] Add "Copy time as UTC" action
- [ ] Display user's current timezone in UI

## Rollback Plan

If issues arise:
1. Keep old code commented out during migration
2. Feature flag the new implementation if possible
3. Have backup branch with old implementation
4. Document any breaking changes

---

## Notes

- It's OK to keep `selectedDate` as a `Date` object for now - convert to/from Temporal as needed
- Focus on display components first (easiest to test)
- Then update calculation functions
- Finally update event handlers
- Test thoroughly after each section

## Questions/Issues

Track any issues encountered during migration:

- [ ] Issue: ___________
  - Solution: ___________
  - Status: ___________
