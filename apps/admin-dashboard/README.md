# Admin Dashboard

Admin dashboard for freelance-os - manage clients, projects, time tracking, invoices, and view analytics.

## Features

- 📊 **Activity Analytics** - View charts and graphs of your computer usage from activity tracking
- 👥 **Client Management** - Create, edit, and manage client information
- 📁 **Project Management** - Track projects, assign to clients, monitor status
- ⏱️ **Time Tracking** - Log time entries against projects
- 💰 **Invoice Management** - Create, send, and track invoice payments
- 📈 **Financial Overview** - Revenue tracking and financial reporting

## Getting Started

### Prerequisites

- PostgreSQL database set up (see root README)
- Environment variables configured (copy `.env.example` to `.env`)

### Development

```bash
# From the monorepo root
pnpm dev --filter @freelance-os/admin-dashboard

# Or from this directory
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the admin dashboard.

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
DATABASE_URL="postgresql://freelance_user:password@localhost:5432/freelance_os"
ADMIN_SECRET="your-admin-secret"
```

## Project Structure

```
app/
├── api/              # API routes
│   ├── clients/      # Client CRUD endpoints
│   ├── projects/     # Project management endpoints
│   ├── time/         # Time tracking endpoints
│   ├── invoices/     # Invoice management endpoints
│   └── analytics/    # Analytics endpoints
├── clients/          # Client management pages
├── projects/         # Project management pages
├── time/             # Time tracking pages
├── invoices/         # Invoice pages
├── analytics/        # Analytics dashboard
└── page.tsx          # Dashboard home
```

## Tech Stack

- **Framework**: Next.js 16
- **Database**: PostgreSQL with Prisma
- **UI**: React 19 + Tailwind CSS
- **Charts**: (To be added - Recharts/Chart.js)
- **Authentication**: Custom admin secret (to be enhanced)

## Development Tasks

- [ ] Implement authentication middleware
- [ ] Build client management CRUD
- [ ] Create project management interface
- [ ] Add time tracking forms
- [ ] Build invoice generation
- [ ] Add activity analytics charts
- [ ] Implement financial reports

## API Routes

### Clients
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create new client
- `GET /api/clients/[id]` - Get client details
- `PUT /api/clients/[id]` - Update client
- `DELETE /api/clients/[id]` - Delete client

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/[id]` - Get project details
- `PUT /api/projects/[id]` - Update project
- `DELETE /api/projects/[id]` - Delete project

### Time Tracking
- `GET /api/time` - List time entries
- `POST /api/time` - Create time entry
- `PUT /api/time/[id]` - Update time entry
- `DELETE /api/time/[id]` - Delete time entry

### Invoices
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/[id]` - Get invoice details
- `PUT /api/invoices/[id]` - Update invoice
- `DELETE /api/invoices/[id]` - Delete invoice

### Analytics
- `GET /api/analytics/activity` - Activity analytics
- `GET /api/analytics/projects` - Project analytics
- `GET /api/analytics/revenue` - Revenue analytics

