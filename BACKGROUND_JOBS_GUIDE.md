# Background AI Jobs System

## Overview

A comprehensive job queue system for running long-running AI tasks in the background without blocking the UI. Users can navigate away while jobs process and receive toast notifications when complete.

## Architecture

### Database Schema

**`ai_jobs` table** (via Prisma):
- `id` - Auto-increment primary key
- `type` - Enum: `autofill_time_entries` (extensible for future AI tasks)
- `status` - Enum: `pending`, `processing`, `completed`, `failed`, `cancelled`
- `progress` - Integer 0-100 (percentage)
- `parameters` - JSON (job-specific input data)
- `result` - JSON (job-specific output data)
- `error` - Text (error message if failed)
- Timestamps: `createdAt`, `startedAt`, `completedAt`, `updatedAt`

Indexes: `(type, status)`, `status`, `createdAt`

### API Routes

**POST `/api/jobs`**
- Create new background job
- Immediately returns job object with `pending` status
- Triggers async processing (non-blocking)

**GET `/api/jobs`**
- List all jobs (or `?active=true` for pending/processing only)
- Returns array of job objects

**GET `/api/jobs/[id]`**
- Get specific job status

**DELETE `/api/jobs/[id]`**
- Cancel pending/processing job

### Job Processing

Jobs are processed asynchronously in `processJobAsync()`:
1. Mark job as `processing` with `startedAt` timestamp
2. Route to appropriate handler based on `type`
3. Update `progress` at key milestones (10%, 30%, 50%, 80%, 100%)
4. Store results in `result` JSON field
5. Mark as `completed` with `completedAt` timestamp
6. On error: mark as `failed` with error message

**Autofill Job Handler** (`processAutofillJob`):
- Fetches activity sessions for specified date
- Merges adjacent sessions (reduces AI token usage)
- Fetches projects and existing time entries
- Generates AI suggestions using configured provider
- Creates time entries from suggestions
- Returns count of entries created

## Client-Side Integration

### JobsProvider Context

**`components/JobsProvider.tsx`**
- Global React context wrapping the entire app
- Manages job state and polling
- Polls active jobs every 3 seconds
- Shows toast notifications when jobs complete/fail
- Tracks completed job IDs to prevent duplicate toasts

**Exported hooks/methods**:
```typescript
const {
  jobs,           // All jobs
  activeJobs,     // Pending/processing jobs only
  isLoading,      // Initial load state
  refreshJobs,    // Manual refresh
  createJob,      // Create new job
  cancelJob,      // Cancel job by ID
} = useJobs();
```

### Navbar Jobs Indicator

**`components/JobsIndicator.tsx`**
- Displays when active jobs exist
- Shows badge with job count
- Animated spinner icon
- Dropdown with job details:
  - Job title and description
  - Status badge
  - Progress bar
  - Start time

Only visible when `activeJobs.length > 0`.

### Timeline Integration

**Autofill Button** in `DayTimeline.tsx`:
- Creates job instead of directly calling API
- Checks for active jobs for current date
- Disables button if job already running for that date
- Shows "Processing..." state with spinner
- Refreshes timeline data when job completes

## Job Display Utilities

**`lib/job-utils.ts`**:
- `enrichJobWithDisplay(job)` - Adds display title/description
- `getJobStatusColor(status)` - Returns Tailwind color classes
- `isJobForDate(job, date)` - Check if job is for specific date
- `hasActiveJobForDate(jobs, date)` - Check for active autofill job

## User Experience Flow

1. **User clicks "Autofill"** on timeline
2. Job created with `pending` status → instant response
3. Toast: "Autofill job started! You'll be notified when it completes."
4. Jobs indicator appears in navbar (if not already visible)
5. User can navigate away, button shows "Processing..." on that date
6. Job progresses: 10% → 30% → 50% → 80% → 100%
7. When complete:
   - Toast: "Autofill: Wed, Oct 22 completed: Created 5 time entries"
   - Timeline auto-refreshes (if user is on that date)
   - Jobs indicator updates/hides

## Extensibility

To add new AI job types:

1. **Update Prisma schema** enum:
```prisma
enum AiJobType {
  autofill_time_entries
  generate_invoice_description  // New!
  analyze_productivity           // New!
}
```

2. **Add handler** in `app/api/jobs/route.ts`:
```typescript
case "generate_invoice_description":
  await processInvoiceDescriptionJob(job);
  break;
```

3. **Update display logic** in `lib/job-utils.ts`:
```typescript
case "generate_invoice_description":
  displayTitle = `Generate description for Invoice #${params.invoiceId}`;
  break;
```

4. **Create job** from UI:
```typescript
await createJob("generate_invoice_description", { invoiceId: 123 });
```

## Key Features

✅ **Non-blocking** - Jobs run in background, don't freeze UI  
✅ **Persistent** - State survives page navigation  
✅ **Progress tracking** - 0-100% progress updates  
✅ **Toast notifications** - Auto-notify on completion/failure  
✅ **Visual indicators** - Navbar badge, button states  
✅ **Duplicate prevention** - Can't run same job twice for same date  
✅ **Extensible** - Easy to add new job types  
✅ **Type-safe** - Full TypeScript support throughout  

## Files Created/Modified

### New Files
- `packages/database/prisma/schema.prisma` (added `AiJob` model + enums)
- `packages/types/src/index.ts` (added `AiJob`, `CreateAiJobInput`, `AiJobWithDisplay` types)
- `apps/admin-dashboard/app/api/jobs/route.ts` (job CRUD + processing)
- `apps/admin-dashboard/app/api/jobs/[id]/route.ts` (individual job endpoints)
- `apps/admin-dashboard/lib/job-utils.ts` (display helpers)
- `apps/admin-dashboard/components/JobsProvider.tsx` (React context)
- `apps/admin-dashboard/components/JobsIndicator.tsx` (navbar component)

### Modified Files
- `apps/admin-dashboard/app/layout.tsx` (wrap with JobsProvider, add JobsIndicator)
- `apps/admin-dashboard/app/time/components/DayTimeline.tsx` (integrate job system)

## Future Enhancements

- **Job history view** - Dedicated page to view all past jobs
- **Job cancellation** - Allow cancelling in-progress jobs
- **Job scheduling** - Cron-style recurring jobs
- **Job priority** - Queue management with priorities
- **Batch operations** - Process multiple days at once
- **Job notifications** - Email/push notifications for long jobs
