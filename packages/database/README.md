# Database Package

Shared PostgreSQL database schema and Prisma client for freelance-os.

## Setup

1. Create a PostgreSQL database:
```bash
sudo -u postgres psql
CREATE USER freelance_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE freelance_os OWNER freelance_user;
GRANT ALL PRIVILEGES ON DATABASE freelance_os TO freelance_user;
\c freelance_os
GRANT ALL ON SCHEMA public TO freelance_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO freelance_user;
\q
```

2. Set up your environment variables:
```bash
# Create .env file in the root of the monorepo
echo "DATABASE_URL=postgresql://freelance_user:your_secure_password@localhost:5432/freelance_os" > ../../.env
```

3. Generate Prisma client and run migrations:
```bash
pnpm install
pnpm db:generate
pnpm db:push
```

## Database Schema

### Activity Tracking (from existing utility)
- `activity_sessions` - Individual continuous sessions with applications
- `activity_summaries` - Aggregated activity summaries

### Client & Project Management
- `clients` - Client information
- `projects` - Projects associated with clients
- `time_entries` - Time tracking entries for projects
- `invoices` - Invoice management

## Usage

```typescript
import { prisma } from '@freelance-os/database';

// Query examples
const clients = await prisma.client.findMany();
const sessions = await prisma.activitySession.findMany({
  where: {
    startTime: {
      gte: new Date('2025-10-01')
    }
  }
});
```

## Commands

- `pnpm db:generate` - Generate Prisma client
- `pnpm db:push` - Push schema changes to database (dev)
- `pnpm db:migrate` - Create and run migrations (dev)
- `pnpm db:migrate:deploy` - Run migrations (production)
- `pnpm db:studio` - Open Prisma Studio (GUI for database)
