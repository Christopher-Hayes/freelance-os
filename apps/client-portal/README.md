# Client Portal

Client-facing portal for freelance-os - allowing clients to view their project time tracking, invoices, and project status.

## Features

- 🔐 **Secure Authentication** - Email-based login using NextAuth.js
- ⏱️ **Time Tracking View** - See hours logged on projects
- 📊 **Weekly Breakdown** - Time distribution week-by-week
- 💰 **Invoice Access** - View all invoices and payment status
- 📁 **Project Status** - Monitor project progress and details
- 📧 **Notifications** - Get updates on new invoices and project milestones

## Getting Started

### Prerequisites

- PostgreSQL database set up (see root README)
- Environment variables configured (copy `.env.example` to `.env`)

### Development

```bash
# From the monorepo root
pnpm dev --filter @freelance-os/client-portal

# Or from this directory
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001) to view the client portal.

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
DATABASE_URL="postgresql://freelance_user:password@localhost:5432/freelance_os"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3001"
```

## Project Structure

```
app/
├── api/
│   ├── auth/            # NextAuth.js authentication
│   ├── projects/        # Client's projects endpoint
│   ├── time/            # Time entries endpoint
│   └── invoices/        # Invoices endpoint
├── auth/
│   ├── signin/          # Sign in page
│   └── error/           # Auth error page
├── dashboard/           # Main dashboard
├── projects/            # Project details pages
├── invoices/            # Invoice viewing pages
└── page.tsx             # Landing/login page
```

## Tech Stack

- **Framework**: Next.js 16
- **Database**: PostgreSQL with Prisma
- **Authentication**: NextAuth.js
- **UI**: React 19 + Tailwind CSS
- **Charts**: (To be added - Recharts for time breakdowns)

## Authentication

The portal uses NextAuth.js with email-based authentication (magic links). Clients receive a login link via email.

### Supported Providers

- **Email** (Magic Links) - Primary method
- **Google OAuth** (Optional - to be configured)
- **GitHub OAuth** (Optional - to be configured)

## Client Data Access

Clients can only access their own data:

- ✅ Projects assigned to them
- ✅ Time entries on their projects
- ✅ Invoices issued to them
- ❌ Other clients' data (restricted)
- ❌ Admin analytics (restricted)

## Development Tasks

- [ ] Implement NextAuth.js email provider
- [ ] Build authentication UI
- [ ] Create dashboard layout
- [ ] Add project list view
- [ ] Build time tracking display with charts
- [ ] Create invoice viewing pages
- [ ] Add PDF download for invoices
- [ ] Implement real-time notifications

## API Routes

### Authentication
- `GET /api/auth/signin` - Sign in page
- `POST /api/auth/callback/email` - Email verification callback
- `GET /api/auth/session` - Get current session

### Projects
- `GET /api/projects` - Get client's projects

### Time Tracking
- `GET /api/time?projectId=[id]` - Get time entries for a project
- `GET /api/time/summary?projectId=[id]` - Get weekly summary

### Invoices
- `GET /api/invoices` - Get client's invoices
- `GET /api/invoices/[id]` - Get specific invoice
- `GET /api/invoices/[id]/pdf` - Download invoice as PDF

