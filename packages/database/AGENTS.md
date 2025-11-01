# Database Package - Agent Instructions

## Package Overview

This package contains the Prisma schema, client singleton, and database utilities shared by both Next.js apps (admin-dashboard and client-portal).

**Technology**: Prisma 6 + PostgreSQL 15+  
**Pattern**: Singleton client to prevent connection pool exhaustion  
**Location**: `packages/database`

## Critical Patterns

### Always Use the Singleton Client

```typescript
// ✅ CORRECT: Import from package
import { prisma } from '@freelance-os/database';

// ❌ WRONG: Never create new instances
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // NO! Causes connection issues
```

The singleton is defined in `src/client.ts` and handles:
- Connection pooling
- Development query logging
- Hot reload prevention in Next.js dev mode

### After Schema Changes

**Always run these commands in order**:

```bash
cd packages/database

# 1. Generate Prisma Client (updates TypeScript types)
pnpm db:generate

# 2. Push changes to database (development)
pnpm db:push

# OR for production: Create migration
pnpm db:migrate
```

## Database Schema

### Tables Overview

#### Activity Tracking (Read-Only from Apps)
- **`activity_sessions`** - Individual app usage sessions
  - Populated by external Go utility
  - Never written to by Next.js apps
  - Indexed on: `appClass`, `startTime`, `endTime`, `(appClass, startTime)`
  
- **`activity_summaries`** - Aggregated activity data
  - Populated by external Go utility
  - Used for high-level analytics
  - Indexed on: `appClass`, `firstSeen`, `lastSeen`, `submittedAt`

#### Business Data
- **`clients`** - Client information
  - Unique email constraint
  - Cascades deletes to projects and invoices
  
- **`projects`** - Projects per client
  - Status: `active`, `completed`, `on-hold`
  - Cascades deletes to time_entries and invoices (set null)
  
- **`time_entries`** - Manual time tracking
  - Linked to projects (required)
  - Duration stored in **minutes** (not seconds like activity_sessions)
  - Billable flag for invoicing
  
- **`invoices`** - Invoice management
  - Linked to clients (required), projects (optional)
  - Status: `draft`, `sent`, `paid`, `overdue`, `cancelled`
  - Amount as Decimal(10, 2) for precision

### Relationship Patterns

```
Client (1) ──→ (N) Projects
               │
               ├──→ (N) TimeEntries
               └──→ (N) Invoices

Client (1) ──→ (N) Invoices
```

### Cascade Behavior

```typescript
// Deleting a client cascades to:
await prisma.client.delete({ where: { id: clientId } });
// → Deletes all projects for this client
// → Deletes all time entries for those projects
// → Deletes all invoices for this client

// Deleting a project:
await prisma.project.delete({ where: { id: projectId } });
// → Deletes all time entries for this project
// → Sets projectId to NULL on invoices (onDelete: SetNull)
```

## Schema Modification Patterns

### Adding a New Model

```prisma
// prisma/schema.prisma
model Task {
  id          Int      @id @default(autoincrement())
  projectId   Int      @map("project_id")
  title       String
  description String?  @db.Text
  completed   Boolean  @default(false)
  dueDate     DateTime? @map("due_date") @db.Timestamptz
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz
  
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("tasks")
}
```

**Then update Project model:**
```prisma
model Project {
  // ... existing fields
  tasks       Task[]
}
```

**After schema changes:**
```bash
pnpm db:generate
pnpm db:push  # or pnpm db:migrate for production
```

### Adding a New Field

```prisma
model Client {
  // ... existing fields
  phone       String?  // Add new optional field
  timezone    String   @default("UTC")  // With default
}
```

### Adding Indexes

```prisma
model TimeEntry {
  // ... existing fields
  
  @@index([projectId])
  @@index([startTime])
  @@index([endTime])
  @@index([projectId, startTime])  // Composite index
}
```

## Common Query Patterns

### Include Relations
```typescript
// Get client with all projects
const client = await prisma.client.findUnique({
  where: { id: clientId },
  include: {
    projects: true,
    invoices: true
  }
});

// Get client with project count only (more efficient)
const client = await prisma.client.findUnique({
  where: { id: clientId },
  include: {
    _count: {
      select: { projects: true, invoices: true }
    }
  }
});
```

### Filtering Through Relations
```typescript
// Get time entries for a specific client
const timeEntries = await prisma.timeEntry.findMany({
  where: {
    project: {
      clientId: clientId  // Filter through relation
    }
  },
  include: {
    project: {
      select: { name: true, client: true }
    }
  }
});
```

### Aggregations
```typescript
// Total billable hours per project
const projectHours = await prisma.timeEntry.groupBy({
  by: ['projectId'],
  where: { billable: true },
  _sum: {
    durationMinutes: true
  }
});

// Count invoices by status
const invoiceStats = await prisma.invoice.groupBy({
  by: ['status'],
  _count: {
    id: true
  }
});
```

### Date Range Queries
```typescript
// Activity sessions in date range
const sessions = await prisma.activitySession.findMany({
  where: {
    startTime: { gte: startDate },
    endTime: { lte: endDate }
  },
  orderBy: { startTime: 'desc' }
});

// Time entries for current month
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);

const monthlyEntries = await prisma.timeEntry.findMany({
  where: {
    startTime: { gte: startOfMonth }
  }
});
```

### Transactions
```typescript
// Create client and project atomically
const result = await prisma.$transaction(async (tx) => {
  const client = await tx.client.create({
    data: {
      email: 'client@example.com',
      name: 'Client Name'
    }
  });

  const project = await tx.project.create({
    data: {
      name: 'New Project',
      clientId: client.id,
      status: 'active'
    }
  });

  return { client, project };
});
```

## Seeding Data

The seed script (`src/seed.ts`) populates the database with sample data for development.

### Running the Seed Script
```bash
cd packages/database
pnpm db:seed
```

### Seed Script Pattern
```typescript
// src/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (development only!)
  await prisma.timeEntry.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();

  // Create sample clients
  const client1 = await prisma.client.create({
    data: {
      email: 'john@example.com',
      name: 'John Doe',
      company: 'Acme Corp',
      projects: {
        create: [
          {
            name: 'Website Redesign',
            description: 'Complete overhaul of company website',
            status: 'active',
            startDate: new Date('2025-01-01')
          }
        ]
      }
    }
  });

  console.log('Seed completed:', { client1 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## Migration Strategies

### Development (Fast Iteration)
```bash
# Push schema changes directly (no migration files)
pnpm db:push
```

### Production (Version Controlled)
```bash
# Create migration file
pnpm db:migrate

# This creates a file in prisma/migrations/
# Commit this to version control
```

### Reset Database (Development Only!)
```bash
# ⚠️ WARNING: Deletes all data!
pnpm prisma db push --force-reset
pnpm db:seed  # Reload sample data
```

## Type Safety

### Use Custom Types, Not Prisma Types
When sharing types between packages, prefer custom types from `@freelance-os/types`:

```typescript
// ✅ CORRECT: Use custom types
import type { Client, Project } from '@freelance-os/types';

// ❌ AVOID: Don't export Prisma types directly
import type { Client } from '@prisma/client';
```

### When Prisma Types Are Needed
```typescript
// For complex queries with includes
import type { Prisma } from '@prisma/client';

type ClientWithProjects = Prisma.ClientGetPayload<{
  include: { projects: true }
}>;

type ProjectWithCounts = Prisma.ProjectGetPayload<{
  include: {
    _count: {
      select: { timeEntries: true }
    }
  }
}>;
```

## Database Utilities

### Prisma Studio (Database GUI)
```bash
cd packages/database
pnpm db:studio
```
Opens at: http://localhost:5555

Use this to:
- Browse table data
- Manually edit records
- Test queries
- Debug relationships

### Connection String Format
```bash
# Development (local)
DATABASE_URL="postgresql://freelance_user:password@localhost:5432/freelance_os"

# Production (Tailscale)
DATABASE_URL="postgresql://freelance_user:password@100.x.x.x:5432/freelance_os"
```

## Important Conventions

1. **Snake_case for database columns** - Use `@map()` to convert from camelCase
   ```prisma
   createdAt DateTime @map("created_at")
   ```

2. **UTC timestamps** - All dates use `@db.Timestamptz` (PostgreSQL timezone)
   ```prisma
   startTime DateTime @map("start_time") @db.Timestamptz
   ```

3. **Singular table names with @map** - Model is singular, table is plural
   ```prisma
   model Client {
     @@map("clients")
   }
   ```

4. **Duration units**:
   - `activity_sessions.durationSeconds` - in seconds
   - `time_entries.durationMinutes` - in minutes

5. **Indexes on foreign keys** - Always index relations
   ```prisma
   @@index([clientId])
   @@index([projectId])
   ```

6. **Cascade deletes** - Configured for parent-child relationships
   ```prisma
   onDelete: Cascade  // Delete children
   onDelete: SetNull  // Preserve children, null the FK
   ```

7. **Decimal for currency** - Use `@db.Decimal(10, 2)` for money
   ```prisma
   amount Decimal @db.Decimal(10, 2)
   ```

## Troubleshooting

### Prisma Client Not Found
```bash
cd packages/database
rm -rf node_modules/.prisma
pnpm db:generate
```

### Migration Conflicts
```bash
# If migrations are out of sync
pnpm prisma migrate reset  # ⚠️ Deletes data!
pnpm db:seed
```

### Connection Pool Exhausted
This happens when you create multiple PrismaClient instances. **Always use the singleton from `@freelance-os/database`**.

### Schema Changes Not Reflecting
```bash
# Ensure you regenerate the client
cd packages/database
pnpm db:generate

# Then restart your Next.js dev server
cd ../..
pnpm dev
```

## Testing Database Queries

### Direct PostgreSQL Access
```bash
psql "postgresql://freelance_user:password@localhost:5432/freelance_os"
```

Common commands:
```sql
\dt              -- List tables
\d clients       -- Describe table
\di              -- List indexes
SELECT * FROM activity_sessions LIMIT 10;
```

### Query Logging
The client singleton enables query logging in development:

```typescript
// src/client.ts
log: process.env.NODE_ENV === 'development' 
  ? ['query', 'error', 'warn'] 
  : ['error']
```

This logs all queries to the console during development.
