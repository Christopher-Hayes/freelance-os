# Freelance-OS Quick Reference

Quick commands and information for working with freelance-os.

## 🚀 Quick Start Commands

```bash
# Install dependencies
pnpm install

# Setup database (first time only)
cd packages/database && pnpm db:generate && pnpm db:push && cd ../..

# Start everything
pnpm dev

# Start specific app
pnpm dev --filter @freelance-os/admin-dashboard
pnpm dev --filter @freelance-os/client-portal
```

## 📍 URLs

- **Admin Dashboard**: http://localhost:3000
- **Client Portal**: http://localhost:3001
- **Prisma Studio**: http://localhost:5555 (run `cd packages/database && pnpm db:studio`)

## 📦 Package Names

Use these when importing or running commands:

- `@freelance-os/database` - Database schema and Prisma client
- `@freelance-os/types` - Shared TypeScript types
- `@freelance-os/admin-dashboard` - Admin app
- `@freelance-os/client-portal` - Client portal app
- `@repo/ui` - Shared UI components
- `@repo/eslint-config` - ESLint config
- `@repo/tailwind-config` - Tailwind config
- `@repo/typescript-config` - TypeScript config

## 🗄️ Database Commands

```bash
cd packages/database

# Generate Prisma client
pnpm db:generate

# Push schema changes (dev)
pnpm db:push

# Create migration
pnpm db:migrate

# Deploy migrations (prod)
pnpm db:migrate:deploy

# Open database GUI
pnpm db:studio

# Seed sample data
pnpm db:seed
```

## 🔧 Development Commands

```bash
# From root directory

# Development
pnpm dev                          # All apps
pnpm dev --filter [package-name]  # Specific app

# Building
pnpm build                        # All apps
pnpm build --filter [package-name] # Specific app

# Type checking
pnpm check-types                  # All packages

# Linting
pnpm lint                         # All packages

# Formatting
pnpm format                       # Format all code
```

## 📊 Database Schema Summary

### Activity Tracking (from utility)
- `activity_sessions` - App usage sessions
- `activity_summaries` - Aggregated data

### Business Management
- `clients` - Client profiles
- `projects` - Projects per client
- `time_entries` - Time tracking
- `invoices` - Invoice management

## 🔑 Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:pass@localhost:5432/freelance_os"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3001"
ADMIN_SECRET="generate-with-openssl-rand-base64-32"

# Generate secrets
openssl rand -base64 32
```

## 🗂️ Directory Structure

```
freelance-os/
├── apps/
│   ├── admin-dashboard/     # Port 3000
│   └── client-portal/       # Port 3001
├── packages/
│   ├── database/            # Prisma + schema
│   ├── types/              # TypeScript types
│   ├── ui/                 # React components
│   ├── eslint-config/
│   ├── tailwind-config/
│   └── typescript-config/
└── [config files]
```

## 📝 Common Tasks

### Add a New Database Model

1. Edit `packages/database/prisma/schema.prisma`
2. Run `pnpm db:generate`
3. Run `pnpm db:push` (or `pnpm db:migrate` for production)
4. Add TypeScript types to `packages/types/src/index.ts`

### Create a New API Route

**Admin Dashboard:**
```typescript
// apps/admin-dashboard/app/api/[endpoint]/route.ts
import { prisma } from '@freelance-os/database';

export async function GET() {
  const data = await prisma.yourModel.findMany();
  return Response.json(data);
}
```

**Client Portal:**
```typescript
// apps/client-portal/app/api/[endpoint]/route.ts
import { prisma } from '@freelance-os/database';
import { getServerSession } from 'next-auth';

export async function GET() {
  const session = await getServerSession();
  // Query with client filter
  const data = await prisma.yourModel.findMany({
    where: { clientId: session.user.clientId }
  });
  return Response.json(data);
}
```

### Use Database in Components

```typescript
import { prisma } from '@freelance-os/database';
import type { Client, Project } from '@freelance-os/types';

// In Server Components (default in Next.js App Router)
export default async function Page() {
  const clients = await prisma.client.findMany();
  
  return (
    <div>
      {clients.map(client => (
        <div key={client.id}>{client.name}</div>
      ))}
    </div>
  );
}
```

### Query Activity Data

```typescript
// Get today's activity
const sessions = await prisma.activitySession.findMany({
  where: {
    startTime: {
      gte: new Date(new Date().setHours(0, 0, 0, 0))
    }
  },
  orderBy: { startTime: 'desc' }
});

// Get activity summary by app
const summary = await prisma.activitySession.groupBy({
  by: ['appClass'],
  _sum: {
    durationSeconds: true
  },
  where: {
    startTime: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    }
  }
});
```

## 🔍 Debugging

### Check Database Connection

```bash
psql "postgresql://freelance_user:password@localhost:5432/freelance_os"
```

### View Database Tables

```sql
\dt                           -- List tables
\d activity_sessions          -- Describe table
SELECT COUNT(*) FROM clients; -- Count records
```

### Check PostgreSQL Status

```bash
sudo systemctl status postgresql
sudo systemctl start postgresql
```

### View Logs

```bash
# PostgreSQL logs (Ubuntu/Debian)
sudo tail -f /var/log/postgresql/postgresql-15-main.log

# Next.js dev server shows logs in terminal
```

## 📚 Import Examples

```typescript
// Database and types
import { prisma } from '@freelance-os/database';
import type { Client, Project, Invoice } from '@freelance-os/types';

// UI components
import { Card, Button } from '@repo/ui';

// Prisma types
import type { Prisma } from '@freelance-os/database';
```

## 🔗 Connect Activity Utility

```bash
# In your active-window utility
./active-window -track -submit \
  -postgres "postgresql://freelance_user:password@localhost:5432/freelance_os"
```

## 🎯 Development Workflow

1. **Start dev servers**: `pnpm dev`
2. **Make changes** to code
3. **Hot reload** happens automatically
4. **Check types**: `pnpm check-types`
5. **Lint**: `pnpm lint`
6. **Format**: `pnpm format`
7. **Commit** changes

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Port in use | Change port in `package.json` or kill process |
| Prisma client not found | Run `cd packages/database && pnpm db:generate` |
| DB connection error | Check PostgreSQL is running |
| Permission denied | Grant privileges in PostgreSQL |
| Module not found | Run `pnpm install` |

## 📖 Documentation

- **Root README**: Project overview and architecture
- **SETUP.md**: Detailed setup instructions
- **packages/database/README.md**: Database documentation
- **apps/admin-dashboard/README.md**: Admin features
- **apps/client-portal/README.md**: Client portal features

---

For detailed instructions, see `SETUP.md` and `README.md`
