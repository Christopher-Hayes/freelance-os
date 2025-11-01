# Freelance-OS Architecture

Complete architecture overview of the freelance-os monorepo.

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Freelance-OS Monorepo                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐
│  Admin Dashboard     │  │  Client Portal       │  │  Activity    │
│  (Next.js - :3000)   │  │  (Next.js - :3001)   │  │  Tracking    │
│                      │  │                      │  │  Utility     │
│  - Analytics         │  │  - Client Auth       │  │  (External)  │
│  - Client CRUD       │  │  - Time View         │  │              │
│  - Project Mgmt      │  │  - Invoice View      │  │  - Monitors  │
│  - Time Tracking     │  │  - Project Status    │  │    apps      │
│  - Invoice Gen       │  │                      │  │  - Tracks    │
│                      │  │                      │  │    time      │
└──────────┬───────────┘  └──────────┬───────────┘  └──────┬───────┘
           │                         │                     │
           │                         │                     │
           └─────────────┬───────────┘                     │
                         │                                 │
                         ▼                                 │
           ┌──────────────────────────┐                    │
           │   Shared Packages        │                    │
           │                          │                    │
           │  @freelance-os/database  │◄───────────────────┘
           │  @freelance-os/types     │   (Direct SQL)
           │  @repo/ui                │
           │  @repo/eslint-config     │
           │  @repo/tailwind-config   │
           │  @repo/typescript-config │
           └──────────────┬───────────┘
                          │
                          ▼
           ┌──────────────────────────┐
           │   PostgreSQL Database    │
           │                          │
           │  - activity_sessions     │
           │  - activity_summaries    │
           │  - clients               │
           │  - projects              │
           │  - time_entries          │
           │  - invoices              │
           └──────────────────────────┘
```

## 📊 Data Flow

### Activity Tracking Flow

```
Activity Tracking Utility
        │
        │ (PostgreSQL connection)
        ▼
INSERT INTO activity_sessions
INSERT INTO activity_summaries
        │
        │
        ▼
Admin Dashboard
        │
        ├─► SELECT * FROM activity_sessions
        │   (for detailed view)
        │
        └─► SELECT * FROM activity_summaries
            (for analytics/charts)
```

### Client Portal Flow

```
Client Login (Email)
        │
        ▼
NextAuth.js Authentication
        │
        ▼
Session with client_id
        │
        ▼
Query Database (filtered by client_id)
        │
        ├─► projects WHERE clientId = session.user.clientId
        ├─► time_entries WHERE project.clientId = session.user.clientId
        └─► invoices WHERE clientId = session.user.clientId
        │
        ▼
Display Client Dashboard
```

### Admin Workflow

```
Admin Dashboard
        │
        ├─► Create/Edit Client
        │   └─► INSERT/UPDATE clients
        │
        ├─► Create/Edit Project
        │   └─► INSERT/UPDATE projects
        │
        ├─► Log Time Entry
        │   └─► INSERT/UPDATE time_entries
        │
        ├─► Generate Invoice
        │   └─► INSERT invoices
        │       └─► Calculate from time_entries
        │
        └─► View Analytics
            └─► Query activity_sessions
                └─► Aggregate and display charts
```

## 🗄️ Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐
│     Client      │
│─────────────────│
│ id (PK)         │
│ email (unique)  │
│ name            │
│ company         │
└────────┬────────┘
         │
         │ 1:N
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│    Project      │     │   TimeEntry      │
│─────────────────│     │──────────────────│
│ id (PK)         │ 1:N │ id (PK)          │
│ name            │◄────┤ projectId (FK)   │
│ clientId (FK)   │     │ description      │
│ status          │     │ startTime        │
│ startDate       │     │ endTime          │
│ endDate         │     │ durationMinutes  │
└────────┬────────┘     │ billable         │
         │              └──────────────────┘
         │ 1:N
         │
         ▼
┌─────────────────┐
│    Invoice      │
│─────────────────│
│ id (PK)         │
│ invoiceNumber   │
│ clientId (FK)   │
│ projectId (FK)  │
│ amount          │
│ status          │
│ issueDate       │
│ dueDate         │
│ paidDate        │
└─────────────────┘

┌──────────────────────┐
│  ActivitySession     │
│──────────────────────│
│ id (PK)              │
│ startTime            │
│ endTime              │
│ appClass             │
│ windowTitle          │
│ durationSeconds      │
│ createdAt            │
└──────────────────────┘

┌──────────────────────┐
│  ActivitySummary     │
│──────────────────────│
│ id (PK)              │
│ appClass             │
│ activityDetails      │
│ totalDurationSeconds │
│ sessionCount         │
│ firstSeen            │
│ lastSeen             │
│ submittedAt          │
└──────────────────────┘
```

## 🔌 API Architecture

### Admin Dashboard API Routes

```
/api/
├── clients/
│   ├── route.ts           # GET (list), POST (create)
│   └── [id]/
│       └── route.ts       # GET, PUT, DELETE
├── projects/
│   ├── route.ts           # GET (list), POST (create)
│   └── [id]/
│       └── route.ts       # GET, PUT, DELETE
├── time/
│   ├── route.ts           # GET (list), POST (create)
│   └── [id]/
│       └── route.ts       # GET, PUT, DELETE
├── invoices/
│   ├── route.ts           # GET (list), POST (create)
│   └── [id]/
│       └── route.ts       # GET, PUT, DELETE
└── analytics/
    ├── activity/route.ts  # GET activity analytics
    ├── projects/route.ts  # GET project analytics
    └── revenue/route.ts   # GET revenue analytics
```

### Client Portal API Routes

```
/api/
├── auth/
│   └── [...nextauth]/
│       └── route.ts       # NextAuth.js handler
├── projects/
│   └── route.ts           # GET (filtered by clientId)
├── time/
│   ├── route.ts           # GET (filtered by clientId)
│   └── summary/
│       └── route.ts       # GET weekly summary
└── invoices/
    ├── route.ts           # GET (filtered by clientId)
    └── [id]/
        ├── route.ts       # GET
        └── pdf/
            └── route.ts   # GET PDF download
```

## 🔒 Security Architecture

### Authentication Flow

```
Admin Dashboard:
    Request → Check ADMIN_SECRET → Grant/Deny Access

Client Portal:
    Request → NextAuth.js → Email Magic Link → Session
    └─► All queries filtered by session.user.clientId
```

### Data Access Control

```typescript
// Admin Dashboard - Full access
const allClients = await prisma.client.findMany();

// Client Portal - Filtered access
const session = await getServerSession();
const myProjects = await prisma.project.findMany({
  where: {
    clientId: session.user.clientId  // ← Security filter
  }
});
```

## 📦 Package Dependencies

```
apps/admin-dashboard
    ├── @freelance-os/database
    ├── @freelance-os/types
    ├── @repo/ui
    ├── @repo/tailwind-config
    ├── @repo/typescript-config
    └── next, react, etc.

apps/client-portal
    ├── @freelance-os/database
    ├── @freelance-os/types
    ├── @repo/ui
    ├── @repo/tailwind-config
    ├── @repo/typescript-config
    ├── next-auth
    └── next, react, etc.

packages/database
    ├── @prisma/client
    ├── prisma
    └── @repo/typescript-config

packages/types
    └── @repo/typescript-config

packages/ui
    ├── react
    ├── tailwindcss
    └── @repo/typescript-config
```

## 🔄 Development Workflow

```
1. Developer makes changes
           │
           ▼
2. Turborepo detects changes
           │
           ▼
3. Runs affected tasks only
   (build, lint, type-check)
           │
           ▼
4. Next.js Hot Module Replacement
           │
           ▼
5. Browser auto-refreshes
```

## 🚀 Build & Deployment

### Development

```bash
pnpm dev
  ├─► turbo run dev
      ├─► @freelance-os/admin-dashboard:dev
      └─► @freelance-os/client-portal:dev
```

### Production Build

```bash
pnpm build
  ├─► turbo run build
      ├─► packages/database:build (prisma generate)
      ├─► packages/ui:build (compile CSS)
      ├─► @freelance-os/admin-dashboard:build
      └─► @freelance-os/client-portal:build
```

### Deployment Options

```
Option 1: Separate Deployments
    Admin Dashboard → Vercel/Railway (admin.yourdomain.com)
    Client Portal   → Vercel/Railway (portal.yourdomain.com)
    Database        → Self-hosted PostgreSQL

Option 2: Single VPS
    Nginx Reverse Proxy
        ├─► :3000 → admin.yourdomain.com
        ├─► :3001 → portal.yourdomain.com
        └─► PostgreSQL on same server

Option 3: Docker Compose
    docker-compose.yml
        ├─► admin-dashboard container
        ├─► client-portal container
        └─► postgres container
```

## 📈 Scaling Considerations

### Database Optimization

```sql
-- Already included in schema:
CREATE INDEX idx_sessions_app_class ON activity_sessions(app_class);
CREATE INDEX idx_sessions_start_time ON activity_sessions(start_time);
CREATE INDEX idx_summaries_app_class ON activity_summaries(app_class);
```

### Caching Strategy

```typescript
// Example: Cache client data
import { cache } from 'react';

export const getClients = cache(async () => {
  return await prisma.client.findMany();
});
```

### Performance Tips

- Use Next.js server components for data fetching
- Implement pagination for large datasets
- Use database indexes (already in schema)
- Cache frequent queries
- Use `revalidatePath()` for on-demand revalidation

## 🧪 Testing Strategy

```
packages/database/
    └── tests/
        ├── schema.test.ts
        └── queries.test.ts

apps/admin-dashboard/
    └── __tests__/
        ├── api/
        └── components/

apps/client-portal/
    └── __tests__/
        ├── api/
        └── components/
```

## 📝 Adding New Features

### Example: Add "Tasks" Feature

1. **Update Database Schema**
   ```prisma
   // packages/database/prisma/schema.prisma
   model Task {
     id        Int      @id @default(autoincrement())
     projectId Int
     title     String
     completed Boolean  @default(false)
     project   Project  @relation(fields: [projectId], references: [id])
   }
   ```

2. **Generate Types**
   ```bash
   cd packages/database
   pnpm db:generate
   pnpm db:migrate
   ```

3. **Add TypeScript Types**
   ```typescript
   // packages/types/src/index.ts
   export interface Task {
     id: number;
     projectId: number;
     title: string;
     completed: boolean;
   }
   ```

4. **Create API Route**
   ```typescript
   // apps/admin-dashboard/app/api/tasks/route.ts
   import { prisma } from '@freelance-os/database';
   
   export async function GET() {
     const tasks = await prisma.task.findMany();
     return Response.json(tasks);
   }
   ```

5. **Build UI Component**
   ```typescript
   // apps/admin-dashboard/app/tasks/page.tsx
   import { prisma } from '@freelance-os/database';
   
   export default async function TasksPage() {
     const tasks = await prisma.task.findMany();
     return <div>{/* render tasks */}</div>;
   }
   ```

## 🎯 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Next.js 16 |
| **Styling** | Tailwind CSS 4 |
| **Backend** | Next.js API Routes |
| **Database** | PostgreSQL 15+ |
| **ORM** | Prisma 6 |
| **Auth** | NextAuth.js (client portal) |
| **Monorepo** | Turborepo, pnpm workspaces |
| **Language** | TypeScript 5.9 |
| **Package Manager** | pnpm 10.19 |

---

For implementation details, see:
- `SETUP.md` - Setup instructions
- `QUICK_REFERENCE.md` - Quick commands
- `README.md` - Project overview
