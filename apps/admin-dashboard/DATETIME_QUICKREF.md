# DateTime Quick Reference Card

## 🎯 Golden Rules

1. **Server = UTC** - Always send/receive UTC ISO strings
2. **Client = Local** - Convert to local timezone only for display
3. **Never SSR dates** - Use client components for all datetime rendering
4. **Use Temporal** - Modern API, no more Date() bugs

---

## 📦 Imports

```typescript
// Utilities
import { formatDateTime, formatTime, parseUTC, isToday } from '@/lib/datetime';

// Components
import { ClientDateTime, ClientTime, ClientDate } from '@/components/ClientDateTime';

// Hooks
import { useNow, useIsClient } from '@/hooks/useTemporal';

// Direct API
import { Temporal } from '@/lib/temporal-polyfill';
```

---

## 🎨 Display Components (Most Common)

### Show any datetime from server
```tsx
<ClientDateTime value={utcIsoString} />
```

### Show just the date
```tsx
<ClientDate value={utcIsoString} />
```

### Show just the time
```tsx
<ClientTime value={utcIsoString} />
```

### Show relative time
```tsx
<ClientRelativeTime value={utcIsoString} />
// "2 hours ago", "yesterday", etc.
```

---

## 🔧 Utility Functions

### Format for display (in calculations)
```typescript
formatDateTime(instant)  // "Jan 15, 2025, 3:45 PM"
formatDate(instant)      // "Jan 15, 2025"
formatTime(instant)      // "3:45 PM"
formatRelative(instant)  // "2 hours ago"
```

### Parse from server
```typescript
const instant = parseUTC("2025-11-01T14:30:00Z");
const local = parseLocal("2025-11-01T14:30:00Z");
```

### Current time
```typescript
const nowUtc = now();        // Temporal.Instant
const nowLocal = nowLocal(); // Temporal.ZonedDateTime
```

### Date checks
```typescript
isToday(instant)      // boolean
isYesterday(instant)  // boolean
```

### Duration formatting
```typescript
formatDuration(125)      // "2h 5m"
formatDurationLong(125)  // "2 hours 5 minutes"
```

---

## 🪝 React Hooks

### Live updating current time
```tsx
const now = useNow(1000); // Updates every 1000ms
if (!now) return null; // Handle loading state
```

### Check if mounted on client
```tsx
const isClient = useIsClient();
if (!isClient) return <Skeleton />;
```

---

## ⚠️ Common Mistakes

### ❌ DON'T: Format in Server Component
```tsx
// This causes hydration errors!
export default function Page({ timestamp }) {
  return <div>{new Date(timestamp).toLocaleString()}</div>;
}
```

### ✅ DO: Use Client Component
```tsx
import { ClientDateTime } from '@/components/ClientDateTime';

export default function Page({ timestamp }) {
  return <ClientDateTime value={timestamp} />;
}
```

---

### ❌ DON'T: Use Date() for current time
```tsx
// Hydration mismatch - server time ≠ client time
function Clock() {
  const time = new Date().toLocaleTimeString();
  return <div>{time}</div>;
}
```

### ✅ DO: Use client-only hook
```tsx
"use client";
import { useNow } from '@/hooks/useTemporal';

function Clock() {
  const now = useNow();
  if (!now) return null;
  return <div>{formatTime(now.toInstant())}</div>;
}
```

---

### ❌ DON'T: Store with timezone offset
```json
{
  "startTime": "2025-11-01T14:30:00-08:00"
}
```

### ✅ DO: Store in UTC (Z suffix)
```json
{
  "startTime": "2025-11-01T22:30:00Z"
}
```

---

## 🔄 Type Conversions

### Date → Temporal.Instant
```typescript
const instant = Temporal.Instant.fromEpochMilliseconds(date.getTime());
```

### ISO String → Temporal.Instant
```typescript
const instant = Temporal.Instant.from(isoString);
```

### Temporal.Instant → ISO String
```typescript
const iso = instant.toString();
```

### Temporal.Instant → Date (avoid if possible)
```typescript
const date = new Date(instant.epochMilliseconds);
```

---

## 📊 API Response Format

Always return UTC ISO strings from API routes:

```typescript
// ✅ Good
export async function GET() {
  const entries = await prisma.timeEntry.findMany();
  return NextResponse.json(entries);
  // startTime: "2025-11-01T14:30:00Z"
}
```

---

## 🧪 Testing

```typescript
// Create test instant
const testDate = Temporal.Instant.from('2025-01-15T14:30:00Z');

// Use in component
<ClientDateTime value={testDate.toString()} />

// Format for assertions
const formatted = formatDateTime(testDate);
expect(formatted).toMatch(/Jan 15, 2025/);
```

---

## 📚 Full Documentation

- `DATETIME_GUIDE.md` - Complete guide
- `DATETIME_MIGRATION.md` - Migration examples
- `DATETIME_IMPLEMENTATION.md` - Implementation summary

---

## 🆘 Troubleshooting

**Hydration error?**
→ Make sure you're using `ClientDateTime` component, not formatting in Server Component

**Wrong timezone?**
→ Verify server is sending UTC (ends with `Z`), check `Temporal.Now.timeZoneId()`

**Invalid date?**
→ Check ISO string format, ensure date is valid

**Import error?**
→ Check `tsconfig.json` has `"@/*": ["./*"]` in paths
