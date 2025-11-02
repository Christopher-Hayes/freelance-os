# DateTime Handling Strategy

## Overview

This application uses a consistent approach for handling dates and times across server and client components:

1. **Server always uses UTC** - All dates stored and transmitted are in UTC ISO format
2. **Client converts to local timezone** - Display components convert UTC to user's local time
3. **Temporal API** - Modern JavaScript temporal API via polyfill for robust datetime handling

## Key Components

### Utility Functions (`lib/datetime.ts`)

```typescript
import { formatDateTime, formatDate, formatTime, formatRelative } from '@/lib/datetime';

// Parse UTC ISO string to Temporal objects
parseUTC(isoString)      // Returns Temporal.Instant
parseLocal(isoString)    // Returns ZonedDateTime in local TZ

// Current time
now()                    // Current UTC instant
nowLocal()              // Current local ZonedDateTime

// Formatting
formatDateTime(instant)  // "Jan 15, 2025, 3:45 PM"
formatDate(instant)      // "Jan 15, 2025"
formatTime(instant)      // "3:45 PM"
formatRelative(instant)  // "2 hours ago"

// Helpers
isToday(instant)         // boolean
isYesterday(instant)     // boolean
formatDuration(minutes)  // "2h 30m"
```

### Client Components (`components/ClientDateTime.tsx`)

```tsx
import { ClientDateTime, ClientDate, ClientTime, ClientRelativeTime } from '@/components/ClientDateTime';

// Full datetime
<ClientDateTime value={utcIsoString} />

// Date only
<ClientDate value={utcIsoString} />

// Time only
<ClientTime value={utcIsoString} />

// Relative time
<ClientRelativeTime value={utcIsoString} />

// Custom formatting
<ClientDateTime 
  value={utcIsoString}
  options={{ dateStyle: 'long', timeStyle: 'medium' }}
  className="text-sm text-gray-600"
/>
```

## Important Rules

### ✅ DO:
- Store all dates in database as UTC timestamps
- Send all dates from API as UTC ISO strings
- Use `ClientDateTime` component for displaying dates in React
- Use Temporal API utilities for date calculations
- Convert to local timezone only for display

### ❌ DON'T:
- Never use `new Date()` directly in components (causes hydration mismatches)
- Never SSR dates/times (timezone differences cause hydration errors)
- Never use `Date.now()`, `Date.toLocaleString()` in server components
- Never store dates in local timezone

## Migration Guide

### Before:
```tsx
// ❌ Bad - causes hydration mismatch
function Component({ timestamp }: { timestamp: string }) {
  const formatted = new Date(timestamp).toLocaleString();
  return <div>{formatted}</div>;
}
```

### After:
```tsx
// ✅ Good - no hydration issues
import { ClientDateTime } from '@/components/ClientDateTime';

function Component({ timestamp }: { timestamp: string }) {
  return <ClientDateTime value={timestamp} />;
}
```

### Before:
```tsx
// ❌ Bad - SSR/client mismatch
function CurrentTime() {
  const now = new Date().toLocaleString();
  return <div>Current time: {now}</div>;
}
```

### After:
```tsx
// ✅ Good - client-only rendering
"use client";
import { useEffect, useState } from 'react';
import { nowLocal, formatDateTime } from '@/lib/datetime';

function CurrentTime() {
  const [time, setTime] = useState('');
  
  useEffect(() => {
    const instant = nowLocal().toInstant();
    setTime(formatDateTime(instant));
  }, []);
  
  if (!time) return null;
  
  return <div>Current time: {time}</div>;
}
```

## API Response Format

All API endpoints should return UTC ISO strings:

```typescript
// ✅ Good
{
  "startTime": "2025-11-01T14:30:00Z",
  "endTime": "2025-11-01T15:30:00Z"
}

// ❌ Bad
{
  "startTime": "2025-11-01T14:30:00-08:00",  // Don't include offset
  "endTime": "Nov 1, 2025 2:30 PM"           // Don't pre-format
}
```

## Database Schema

Use `@db.Timestamptz` in Prisma schema:

```prisma
model TimeEntry {
  id         Int      @id @default(autoincrement())
  startTime  DateTime @map("start_time") @db.Timestamptz
  endTime    DateTime @map("end_time") @db.Timestamptz
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
}
```

## Common Patterns

### Display creation date:
```tsx
<ClientRelativeTime value={item.createdAt} /> {/* "2 hours ago" */}
```

### Display event times:
```tsx
<div>
  <ClientDate value={event.startTime} /> {/* "Jan 15, 2025" */}
  {' at '}
  <ClientTime value={event.startTime} /> {/* "3:45 PM" */}
</div>
```

### Check if date is today (in calculations):
```typescript
import { isToday, parseUTC } from '@/lib/datetime';

if (isToday(entry.startTime)) {
  // Show special UI for today's entries
}
```

### Format duration:
```typescript
import { formatDuration } from '@/lib/datetime';

const duration = formatDuration(entry.durationMinutes); // "2h 30m"
```

## Testing

When testing datetime functionality:

```typescript
import { Temporal } from '@/lib/temporal-polyfill';

// Create test dates
const testDate = Temporal.Instant.from('2025-01-15T14:30:00Z');

// Use in components
<ClientDateTime value={testDate.toString()} />
```

## Browser Support

The `@js-temporal/polyfill` package provides full Temporal API support for all browsers. No special configuration needed.

## Troubleshooting

### Hydration Mismatch Errors

If you see hydration errors related to dates:
1. Ensure you're using `ClientDateTime` component, not formatting in Server Components
2. Check that no `Date` constructors are called during render
3. Verify that the component has `"use client"` directive if using hooks

### Wrong Timezone Displayed

1. Ensure server is sending UTC ISO strings (ending in `Z`)
2. Check browser timezone settings
3. Verify `Temporal.Now.timeZoneId()` returns expected timezone

### Invalid Date Errors

1. Check that ISO strings are properly formatted
2. Ensure dates are valid (not null/undefined)
3. Add error boundaries around datetime components
