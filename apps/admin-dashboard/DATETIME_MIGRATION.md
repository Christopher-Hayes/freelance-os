# DateTime Migration Examples

## DayTimeline Component Updates

Here are specific examples of how to migrate the DayTimeline component to use the new datetime utilities.

### 1. Current Time Line

**Before:**
```tsx
const renderCurrentTimeLine = () => {
  if (!isClient) return null;
  if (!isToday(selectedDate)) return null;

  const now = new Date();
  const topPosition = Math.round(timeToY(now) + TIMELINE_PADDING_TOP);

  return (
    <div style={{ top: `${topPosition}px` }}>
      {/* ... */}
    </div>
  );
};
```

**After:**
```tsx
import { nowLocal, isToday as isTodayTemporal, parseLocal } from '@/lib/datetime';
import { Temporal } from '@/lib/temporal-polyfill';

const renderCurrentTimeLine = () => {
  if (!isClient) return null;
  
  // Convert selectedDate (JS Date) to Temporal
  const selectedInstant = Temporal.Instant.fromEpochMilliseconds(selectedDate.getTime());
  if (!isTodayTemporal(selectedInstant)) return null;

  const now = nowLocal();
  const topPosition = Math.round(timeToY(now) + TIMELINE_PADDING_TOP);

  return (
    <div style={{ top: `${topPosition}px` }}>
      {/* ... */}
    </div>
  );
};
```

### 2. Time to Y Position Calculation

**Before:**
```tsx
const timeToY = (time: Date): number => {
  const timeDay = new Date(time);
  timeDay.setHours(0, 0, 0, 0);
  const selectedDay = new Date(selectedDate);
  selectedDay.setHours(0, 0, 0, 0);

  const dayDiff = Math.floor((timeDay.getTime() - selectedDay.getTime()) / (1000 * 60 * 60 * 24));

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const totalHours = hours + (dayDiff * 24) + minutes / 60 + seconds / 3600;

  return totalHours * PIXELS_PER_HOUR;
};
```

**After:**
```tsx
import { Temporal } from '@/lib/temporal-polyfill';

const timeToY = (time: Date | Temporal.ZonedDateTime): number => {
  // Convert to ZonedDateTime if needed
  const zdt = time instanceof Date 
    ? Temporal.Instant.fromEpochMilliseconds(time.getTime())
        .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    : time;
    
  // Get the selected date as PlainDate
  const selectedPlainDate = Temporal.Instant.fromEpochMilliseconds(selectedDate.getTime())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
    
  const timePlainDate = zdt.toPlainDate();
  
  // Calculate day difference
  const dayDiff = timePlainDate.since(selectedPlainDate).total({ unit: 'days' });
  
  // Get time components
  const hours = zdt.hour;
  const minutes = zdt.minute;
  const seconds = zdt.second;
  
  const totalHours = hours + (dayDiff * 24) + minutes / 60 + seconds / 3600;
  
  return totalHours * PIXELS_PER_HOUR;
};
```

### 3. Y Position to Time Conversion

**Before:**
```tsx
const yToTime = (y: number, baseDate: Date): Date => {
  const hours = y / PIXELS_PER_HOUR;
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);

  const totalMs = hours * 60 * 60 * 1000;
  date.setTime(date.getTime() + totalMs);

  return date;
};
```

**After:**
```tsx
import { Temporal } from '@/lib/temporal-polyfill';

const yToTime = (y: number, baseDate: Date): Temporal.ZonedDateTime => {
  const hours = y / PIXELS_PER_HOUR;
  
  // Convert base date to PlainDate (local timezone)
  const basePlainDate = Temporal.Instant.fromEpochMilliseconds(baseDate.getTime())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
  
  // Create a ZonedDateTime at midnight
  const midnight = basePlainDate.toZonedDateTime({
    timeZone: Temporal.Now.timeZoneId(),
    plainTime: Temporal.PlainTime.from('00:00:00'),
  });
  
  // Add the calculated hours
  return midnight.add({ hours });
};
```

### 4. Formatting Time for Display

**Before:**
```tsx
{start.toLocaleTimeString("en-US", {
  hour: "numeric",
  minute: "2-digit",
})}
```

**After:**
```tsx
import { formatTime } from '@/lib/datetime';

// If start is already a Temporal.Instant or ISO string:
{formatTime(start, { hour: "numeric", minute: "2-digit" })}

// If start is a Date:
{formatTime(Temporal.Instant.fromEpochMilliseconds(start.getTime()))}
```

### 5. Date Comparison

**Before:**
```tsx
const isToday = (date: Date) => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};
```

**After:**
```tsx
import { isToday } from '@/lib/datetime';

// If date is an Instant or ISO string:
isToday(date)

// If date is a JS Date:
isToday(Temporal.Instant.fromEpochMilliseconds(date.getTime()))
```

### 6. Fetching Data with Date Strings

**Before:**
```tsx
const fetchDayData = async () => {
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(selectedDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const response = await fetch(`/api/time?date=${dateStr}`);
  // ...
};
```

**After:**
```tsx
import { Temporal } from '@/lib/temporal-polyfill';

const fetchDayData = async () => {
  // Convert to PlainDate and format as ISO string
  const plainDate = Temporal.Instant.fromEpochMilliseconds(selectedDate.getTime())
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
  
  const dateStr = plainDate.toString(); // Automatically formats as YYYY-MM-DD

  const response = await fetch(`/api/time?date=${dateStr}`);
  // ...
};
```

### 7. Displaying Relative Times

**Before:**
```tsx
<div>{new Date(entry.createdAt).toLocaleString()}</div>
```

**After:**
```tsx
import { ClientRelativeTime } from '@/components/ClientDateTime';

<ClientRelativeTime value={entry.createdAt} />
// Displays: "2 hours ago", "yesterday", etc.

// Or for full datetime:
import { ClientDateTime } from '@/components/ClientDateTime';

<ClientDateTime value={entry.createdAt} />
```

## Complete Migration Checklist for DayTimeline

- [ ] Replace all `new Date()` calls with Temporal equivalents
- [ ] Update `timeToY` to accept Temporal.ZonedDateTime
- [ ] Update `yToTime` to return Temporal.ZonedDateTime
- [ ] Replace `isToday` with Temporal-based version
- [ ] Update date formatting to use `formatTime`, `formatDate`, etc.
- [ ] Ensure all API calls send/receive UTC ISO strings
- [ ] Replace direct time rendering with `ClientTime` component
- [ ] Add `isClient` check for any real-time features
- [ ] Test hydration (no mismatches)
- [ ] Test in different timezones

## Testing Different Timezones

You can test timezone handling by changing your system timezone or using browser DevTools:

```javascript
// In Chrome DevTools Console
// Override timezone to test
// Settings → Sensors → Location → Set timezone to "America/New_York", "Europe/London", etc.
```

## Common Pitfalls to Avoid

1. **Don't mix Date and Temporal** - Pick one and stick with it in each function
2. **Don't forget timezone** - Always specify timezone when converting
3. **Don't SSR current time** - Always use `isClient` check
4. **Don't format on server** - Use `ClientDateTime` component for display
5. **Don't mutate** - Temporal objects are immutable, always returns new instances
