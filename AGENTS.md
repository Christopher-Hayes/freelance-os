# Freelance-OS - Agent Instructions

## Documentation Policy

**Only create .md files for:**

- README.md (one per app/package - only if missing)
- AGENTS.md (only in `/`, `/apps/admin-dashboard/`, `/apps/client-portal/`, `/packages/database/`)

**Do not create:** GUIDE.md, SUMMARY.md, STATUS.md, FEATURE_*.md, IMPLEMENTATION_*.md, etc.

If you need to document something, add comments in the code or update the relevant AGENTS.md file.

> **Note**: This file contains high-level project architecture. For app/package-specific details, see:
>
> - `apps/admin-dashboard/AGENTS.md` - Admin dashboard patterns
> - `apps/client-portal/AGENTS.md` - Client portal patterns with security
> - `packages/database/AGENTS.md` - Database schema and Prisma patterns

## Debugging Policy

**When debugging, test first — don't reason in circles.**

- Add `console.log` statements to surface actual runtime values (params, query results, decoded strings, etc.)
- Ask the user to hit the failing URL and paste the server output
- Read what the logs say, then fix
- Do NOT spend time tracing code mentally when you can just instrument it and run it
- Remove debug logs once the fix is confirmed

## Project Overview

Freelance-OS is a **Turborepo monorepo** for managing freelance business operations. Two Next.js apps share a PostgreSQL database via Prisma.

### Apps

- **`apps/admin-dashboard`** (:3000) - Full access admin interface
- **`apps/client-portal`** (:3001) - Client-facing portal (data filtered by clientId)

## UI

- Use tailwindcss for styling
- Always support dark mode
- Prefer Server Components (default in Next.js 15+)
- Use shared components from `@repo/ui` package when it makes sense
- Avoid modals - Prefer inline editing, side panels, or page-based flows instead

### Tailwind CSS Configuration

This project uses **Tailwind CSS v4** with a unified configuration to prevent class purging issues.

- Single source of truth: `packages/tailwind-config/shared-styles.css` contains the base Tailwind config
- Content scanning: Each app's `globals.css` uses `@source` to scan the UI package for classes
- No purging issues: UI package classes are preserved because apps scan `packages/ui/src/**/*.{js,ts,jsx,tsx}`
- CSS linter warnings: The `@source` and `@theme` directives will show "Unknown at rule" warnings in CSS linters - this is expected and safe to ignore

Example from `apps/admin-dashboard/app/globals.css`:

```css
@import "tailwindcss";
@import "@repo/tailwind-config";

/* Scan UI package to prevent class purging */
@source "../../../packages/ui/src/**/*.{js,ts,jsx,tsx}";
```

**Do NOT**:

- Create separate Tailwind configs for each app
- Import Tailwind multiple times in the same app
- Remove the `@source` directive from app globals.css files

### DateTime Handling (Temporal API)

Use the Temporal API for all datetime operations to prevent hydration errors.

- Never use `new Date()` or `Date.now()` in components
- Server: Always store/send UTC timestamps (ISO strings ending in 'Z')
- Client: Convert to local timezone only for display
- Components: Use `ClientDateTime`, `ClientDate`, `ClientTime` for rendering
- Utilities: Import from `@/lib/datetime` (parseUTC, formatDateTime, etc.)
- Live updates: Use `useNow()` hook for current time

See `apps/admin-dashboard/DATETIME_GUIDE.md` for complete documentation.

### Packages

- `packages/database` - Prisma schema + singleton client (use this, never create new PrismaClient)
- `packages/types` - Shared TypeScript types (use these, not Prisma-generated types)
- `packages/ui` - Shared React components (imported as `@repo/ui`)
- `packages/*-config` - Shared configs (eslint, tailwind, typescript)

### Important Rules

1. **Database**: Always `import { prisma } from '@freelance-os/database'` (never instantiate `new PrismaClient()`)
2. **Client Portal Security**: ALL queries must filter by `session.user.clientId`
3. Types: Import from `@freelance-os/types` (not `@prisma/client`)
4. UI Components: Import from `@repo/ui` (e.g., `import { Button, EditButton } from '@repo/ui'`)
5. Workspaces: All packages use `workspace:*` protocol

## Data Architecture

### Database Relationships

```
clients → projects → time_entries
clients → invoices
activity_sessions (standalone, external utility)
activity_summaries (standalone, external utility)
```

### Key Data Patterns

- Cascade deletes: Deleting client removes all projects, time entries, invoices
- Duration units: `time_entries` use minutes, `activity_sessions` use seconds
- Timestamps: All dates are UTC (`@db.Timestamptz`)
- Invoice numbers: Pattern `INV-YYYYMMDD-XXX`

### Next.js 15+ Conventions

- Server Components: Default, query DB directly in components
- Dynamic route params: Must `await params` in API routes

  ```typescript
  const { id } = await params; // Required in Next.js 15+
  ```

### API Routes vs Server Actions

Choose the appropriate pattern based on intended usage:

**Use API Routes (`app/api/*/route.ts`) for:**

- Database models (clients, projects, invoices, time entries, etc.)
- Resources that admins/users may want to integrate with external software
- Operations that benefit from being API-accessible for automation
- Any endpoint you'd want to document for external use

**Use Server Actions (`lib/*-actions.ts`) for:**

- Internal utilities (AI/LLM calls, file processing, etc.)
- Operations with no value as a public/external API
- Single-purpose helper functions
- Background job processing logic

**Examples:**

- ✅ API Route: `GET /api/invoices` - Users may want to integrate with accounting software
- ✅ API Route: `POST /api/time` - Could be used with time-tracking browser extensions
- ✅ Server Action: `generateCode()` - AI code generation is internal-only
- ✅ Server Action: `generateAutofillSuggestions()` - LLM logic called by jobs processor
- ✅ Server Action: `processImage()` - File manipulation utilities

**Pattern:**

```typescript
// lib/ai-actions.ts (Server Actions)
"use server";
export async function generateCode(endpoint: any, language: string) { ... }

// app/api/invoices/route.ts (API Routes)
export async function GET(request: NextRequest) { ... }
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
```

**⚠️ CRITICAL: Never run `pnpm db:seed` on a database with existing data!**

- The seed script is ONLY for populating empty databases
- Always check if database has data before seeding
- Running seed on production will create duplicate/test data

### Adding New Features

1. Update schema in `packages/database/prisma/schema.prisma`
2. Run `pnpm db:generate && pnpm db:push`
3. Add types to `packages/types/src/index.ts`
4. Restart TypeScript server in VS Code to pick up new Prisma types
   - Use Command Palette → "TypeScript: Restart TS Server"
   - Or the `typescript.restartTsServer` command
5. Implement in apps (see app-specific AGENTS.md files)
6. **NEVER run seed scripts to test changes** - use the running apps instead

## Design Philosophy: Activity Sessions vs Time Entries

These are intentionally separate and independent (like RescueTime vs Toggl):

### `activity_sessions` - Automatic Tracking

- Populated by external Go utility (direct PostgreSQL connection)
- Raw computer activity data
- Read-only from Next.js apps
- Used for analytics and insights

### `time_entries` - Manual Billable Time

- Created manually or via rules engine (future)
- Linked to projects and clients
- Used for invoicing
- NOT dependent on activity_sessions

### Future Automation

Rules will generate `time_entries` FROM `activity_sessions`, but they remain separate. Deleting one does NOT affect the other.

## Deployment Architecture

### Technology Decisions

- Auth: NextAuth.js for both apps (admin provider + email magic link)
- Charts: D3.js for all visualizations (not Recharts/Chart.js)
- Deployment: Docker on Coolify + Tailscale for database access

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
- ✅ **Client portal: ALWAYS filter by `session.user.clientId`** (security critical)
- ✅ Durations: minutes (time_entries), seconds (activity_sessions)
- ✅ UTC timestamps everywhere
- ✅ DateTime handling: Use Temporal API (see `apps/admin-dashboard/DATETIME_GUIDE.md`)
