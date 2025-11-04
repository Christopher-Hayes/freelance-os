# Freelance-OS - Agent Instructions

## CRITICAL RULES

⚠️ **DO NOT CREATE DOCUMENTATION FILES** - Just implement the features. No GUIDE.md, SUMMARY.md, STATUS.md files unless explicitly requested by the user.

> **Note**: This file contains high-level project architecture. For app/package-specific details, see:
> - `apps/admin-dashboard/AGENTS.md` - Admin dashboard patterns
> - `apps/client-portal/AGENTS.md` - Client portal patterns with security
> - `packages/database/AGENTS.md` - Database schema and Prisma patterns

## Project Overview

Freelance-OS is a **Turborepo monorepo** for managing freelance business operations. Two Next.js apps share a PostgreSQL database via Prisma.

### Apps
- **`apps/admin-dashboard`** (:3000) - Full access admin interface
- **`apps/client-portal`** (:3001) - Client-facing portal (data filtered by clientId)

## UI

- Use tailwindcss for styling
- Always support dark mode
- Prefer Server Components (default in Next.js 15+)
- Use shared components from `@freelance-os/ui` package when it makes sense
- **Avoid modals** - Prefer inline editing, side panels, or page-based flows instead

### DateTime Handling (Temporal API)

**CRITICAL**: Use the Temporal API for all datetime operations to prevent hydration errors.

- **Never** use `new Date()` or `Date.now()` in components
- **Server**: Always store/send UTC timestamps (ISO strings ending in 'Z')
- **Client**: Convert to local timezone only for display
- **Components**: Use `ClientDateTime`, `ClientDate`, `ClientTime` for rendering
- **Utilities**: Import from `@/lib/datetime` (parseUTC, formatDateTime, etc.)
- **Live updates**: Use `useNow()` hook for current time

See `apps/admin-dashboard/DATETIME_GUIDE.md` for complete documentation.

### Packages
- **`packages/database`** - Prisma schema + singleton client ⚠️ **Use this, never create new PrismaClient**
- **`packages/types`** - Shared TypeScript types ⚠️ **Use these, not Prisma-generated types**
- **`packages/ui`** - Shared React components
- **`packages/*-config`** - Shared configs (eslint, tailwind, typescript)

### Critical Rules
1. **Database**: Always `import { prisma } from '@freelance-os/database'` (never instantiate `new PrismaClient()`)
2. **Types**: Import from `@freelance-os/types` (not `@prisma/client`)
3. **Client Portal Security**: ALL queries must filter by `session.user.clientId`
4. **Workspaces**: All packages use `workspace:*` protocol

## Data Architecture

### Database Relationships
```
clients → projects → time_entries
clients → invoices
activity_sessions (standalone, external utility)
activity_summaries (standalone, external utility)
```

### Key Data Patterns
- **Cascade deletes**: Deleting client removes all projects, time entries, invoices
- **Duration units**: `time_entries` use minutes, `activity_sessions` use seconds
- **Timestamps**: All dates are UTC (`@db.Timestamptz`)
- **Invoice numbers**: Pattern `INV-YYYYMMDD-XXX`

### Next.js 15+ Conventions
- **Server Components**: Default, query DB directly in components
- **Dynamic route params**: Must `await params` in API routes
  ```typescript
  const { id } = await params; // Required in Next.js 15+
  ```

## Development Workflow

### Quick Start
```bash
pnpm dev                    # Start both apps
pnpm dev --filter @freelance-os/admin-dashboard  # Start one app
```

### Database Commands
```bash
cd packages/database
pnpm db:studio              # GUI at localhost:5555
pnpm db:push                # Push schema (dev)
pnpm db:migrate             # Create migration (prod)
pnpm db:seed                # Load sample data
```

### Adding New Features
1. Update schema in `packages/database/prisma/schema.prisma`
2. Run `pnpm db:generate && pnpm db:push`
3. Add types to `packages/types/src/index.ts`
4. Implement in apps (see app-specific AGENTS.md files)

## Design Philosophy: Activity Sessions vs Time Entries

**These are intentionally separate and independent** (like RescueTime vs Toggl):

### `activity_sessions` - Automatic Tracking
- Populated by external Go utility (direct PostgreSQL connection)
- Raw computer activity data
- **Read-only** from Next.js apps
- Used for analytics and insights

### `time_entries` - Manual Billable Time
- Created manually or via rules engine (future)
- Linked to projects and clients
- Used for invoicing
- **NOT dependent** on activity_sessions

### Future Automation
Rules will generate `time_entries` FROM `activity_sessions`, but they remain separate. Deleting one does NOT affect the other.

## Deployment Architecture

### Technology Decisions
- **Auth**: NextAuth.js for both apps (admin provider + email magic link)
- **Charts**: D3.js for all visualizations (not Recharts/Chart.js)
- **Deployment**: Docker on Coolify + Tailscale for database access

### Production Setup
```
┌─────────────────────────────────────┐
│ Coolify Server (Cloud)              │
│  ├─ admin-dashboard (Docker)        │
│  └─ client-portal (Docker)          │
└──────────────┬──────────────────────┘
               │
          Tailscale VPN
               │
┌──────────────▼──────────────────────┐
│ Local Machine                       │
│  └─ PostgreSQL                      │
└─────────────────────────────────────┘

# Production DATABASE_URL uses Tailscale IP:
DATABASE_URL=postgresql://user:pass@100.x.x.x:5432/freelance_os
```

## Project Status

### ✅ Infrastructure Complete
- Turborepo monorepo with pnpm workspaces
- PostgreSQL database schema with all tables
- Shared packages (database, types, ui, configs)
- Both app scaffolds running (ports 3000/3001)
- Seed script with sample data

### 🚧 To Implement (See CHECKLIST.md)
- Admin dashboard: UI + API routes + NextAuth admin provider
- Client portal: UI + API routes + NextAuth email provider
- Activity analytics (D3.js charts)
- Rules engine for time entry generation
- Invoice PDFs and email notifications

## Quick Reference

### Key Files
- `packages/database/prisma/schema.prisma` - Database schema
- `packages/types/src/index.ts` - Shared TypeScript types
- `packages/database/src/client.ts` - Prisma singleton
- `CHECKLIST.md` - Implementation roadmap
- `ARCHITECTURE.md` - System design and data flows

### Debugging
```bash
# Database issues
psql "postgresql://freelance_user:password@localhost:5432/freelance_os"
cd packages/database && pnpm db:generate
```

### Conventions
- ✅ Use Server Components (Next.js default)
- ✅ Import from `@freelance-os/database` and `@freelance-os/types`
- ✅ Client portal: ALWAYS filter by `session.user.clientId`
- ✅ Durations: minutes (time_entries), seconds (activity_sessions)
- ✅ UTC timestamps everywhere
- ✅ **DateTime handling**: Use Temporal API (see `apps/admin-dashboard/DATETIME_GUIDE.md`)
