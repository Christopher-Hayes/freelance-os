# Freelance-OS

A unified monorepo for managing your freelance business operations - from activity tracking to client management, invoicing, and analytics.

## 🏗️ Architecture

This monorepo contains:

### Apps

- **`apps/admin-dashboard`** - Admin dashboard for analytics, charts, and business management (port 3010)
- **`apps/client-portal`** - Client-facing portal for viewing time tracking, invoices, and project status (port 3011)

### Packages

- **`packages/database`** - Shared PostgreSQL database schema and Prisma client
- **`packages/types`** - Shared TypeScript types
- **`packages/ui`** - Shared React UI components
- **`packages/eslint-config`** - Shared ESLint configurations
- **`packages/tailwind-config`** - Shared Tailwind CSS configuration
- **`packages/typescript-config`** - Shared TypeScript configurations

## 🎯 Features

### Activity Tracking

- Integrates with your existing activity tracking utility
- Stores `activity_sessions` and `activity_summaries` in PostgreSQL
- View detailed analytics and charts in the admin dashboard

### Client Management

- Create and manage client profiles
- Track projects per client
- View client-specific analytics

### Time Tracking

- Log time entries per project
- Billable vs non-billable tracking
- Weekly/monthly breakdowns visible to clients

### Invoice Management

- Create and send invoices
- Track payment status (draft, sent, paid, overdue, cancelled)
- Clients can view their invoices in the portal

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20
- pnpm 10.19.0 (included via packageManager field)
- PostgreSQL 15+

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up PostgreSQL Database

Create a PostgreSQL database and user:

```bash
sudo -u postgres psql
```

```sql
CREATE USER freelance_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE freelance_os OWNER freelance_user;
GRANT ALL PRIVILEGES ON DATABASE freelance_os TO freelance_user;

\c freelance_os

GRANT ALL ON SCHEMA public TO freelance_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO freelance_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO freelance_user;

\q
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Database connection
DATABASE_URL="postgresql://freelance_user:your_secure_password@localhost:5432/freelance_os"

# Next Auth (for client portal authentication)
NEXTAUTH_SECRET="your-nextauth-secret-generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3011"

# Admin Dashboard Auth
ADMIN_SECRET="your-admin-secret"
```

### 4. Initialize Database Schema

```bash
# Generate Prisma client and push schema to database
cd packages/database
pnpm install
pnpm db:generate
pnpm db:push

# Optional: Seed with sample data
pnpm db:seed
```

### 5. Start Development Servers

```bash
# From root directory
pnpm dev
```

This will start:

- Admin Dashboard: <http://localhost:3000>
- Client Portal: <http://localhost:3001>

## 📁 Project Structure

```
freelance-os/
├── apps/
│   ├── admin-dashboard/     # Admin analytics & management
│   └── client-portal/       # Client-facing portal
├── packages/
│   ├── database/            # Prisma schema & client
│   ├── types/              # Shared TypeScript types
│   ├── ui/                 # Shared React components
│   ├── eslint-config/      # ESLint configurations
│   ├── tailwind-config/    # Tailwind configurations
│   └── typescript-config/  # TypeScript configurations
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 🗄️ Database Schema

### Activity Tracking (from existing utility)

- `activity_sessions` - Individual app usage sessions
- `activity_summaries` - Aggregated activity data

### Business Management

- `clients` - Client information and contact details
- `projects` - Projects associated with clients
- `time_entries` - Time tracking entries per project
- `invoices` - Invoice generation and payment tracking

## 🔧 Development

### Available Scripts

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm dev --filter @freelance-os/admin-dashboard  # Start only admin dashboard
pnpm dev --filter @freelance-os/client-portal    # Start only client portal

# Building
pnpm build            # Build all apps

# Type Checking
pnpm check-types      # Type check all packages

# Linting
pnpm lint             # Lint all packages

# Formatting
pnpm format           # Format code with Prettier

# Database
pnpm db:setup         # Set up database schema
pnpm db:migrate       # Run database migrations
```

### Database Management

```bash
cd packages/database

# Generate Prisma client
pnpm db:generate

# Push schema changes (development)
pnpm db:push

# Create migration (production-ready)
pnpm db:migrate

# Open Prisma Studio (database GUI)
pnpm db:studio

# Seed database with sample data
pnpm db:seed
```

## 🔗 Integration with Activity Tracking Utility

Your existing activity tracking utility can connect directly to the same PostgreSQL database:

```bash
# In your activity tracking utility
./active-window -track -submit -postgres "postgresql://freelance_user:your_secure_password@localhost:5432/freelance_os"
```

The utility will continue to populate `activity_sessions` and `activity_summaries` tables, which the admin dashboard can then visualize.

## 📊 Admin Dashboard Features

- **Activity Analytics** - Charts and graphs of your computer usage
- **Client Management** - CRUD operations for clients
- **Project Management** - Track projects and their status
- **Time Tracking** - Log and edit time entries
- **Invoice Generation** - Create and manage invoices
- **Financial Overview** - Revenue tracking and reporting

## 👥 Client Portal Features

- **Time Tracking View** - Clients can see hours logged on their projects
- **Weekly Breakdown** - Distribution of time week-by-week
- **Invoice Access** - View all invoices and payment status
- **Project Status** - See current project progress

## 🔒 Security

- Client portal uses NextAuth.js for authentication
- Clients can only access their own data
- Admin dashboard requires separate authentication
- Database connection uses SSL in production
- Environment variables for sensitive configuration

## 📝 Adding New Features

1. **Add database models**: Edit `packages/database/prisma/schema.prisma`
2. **Generate types**: Run `pnpm db:generate`
3. **Add shared types**: Update `packages/types/src/index.ts`
4. **Build UI components**: Add to `packages/ui/src/`
5. **Use in apps**: Import from `@freelance-os/database`, `@freelance-os/types`, `@repo/ui`

## 🆘 Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql "postgresql://freelance_user:your_secure_password@localhost:5432/freelance_os"
```

### Prisma Client Not Found

```bash
cd packages/database
pnpm db:generate
```

### Port Already in Use

```bash
# Change ports in app package.json files
# admin-dashboard: "dev": "next dev"
# client-portal: "dev": "next dev --port 3010"
```

## AI Disclosure

![AI: in the loop](./LABEL_AI IN-THE-LOOP_black.svg)

This project is developed with AI tools in the loop.
