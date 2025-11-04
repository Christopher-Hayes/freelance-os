# Client Portal

Client-facing portal for Freelance-OS. Allows clients to view their projects, time entries, and invoices.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your database URL and NextAuth settings

# Run development server
pnpm dev
```

The portal will be available at http://localhost:3001

## 🔐 Authentication

Uses **NextAuth.js v5** with magic link email authentication via Resend.

### Setup Email Provider

1. Sign up at [Resend](https://resend.com)
2. Get your API key
3. Add to `.env.local`:
   ```bash
   AUTH_RESEND_KEY="re_xxxxxxxxxxxxxxxxxxxxx"
   EMAIL_FROM="noreply@yourdomain.com"
   ```

### Development Testing

During development, magic links are logged to the console. Look for output like:
```
Sign in URL: http://localhost:3001/api/auth/callback/resend?token=...
```

See [AUTH_SETUP.md](./AUTH_SETUP.md) for detailed setup and testing instructions.

## 📁 Project Structure

```
app/
├── api/
│   └── auth/[...nextauth]/     # NextAuth API routes
├── auth/
│   ├── signin/                 # Sign in page
│   ├── error/                  # Auth error page
│   └── verify-request/         # Email sent confirmation
├── dashboard/                  # Main dashboard (protected)
├── layout.tsx                  # Root layout
└── page.tsx                    # Landing page (redirects to signin or dashboard)
lib/
└── auth.ts                     # NextAuth configuration
middleware.ts                   # Route protection
types/
└── next-auth.d.ts             # TypeScript types for NextAuth
```

## 🔒 Security

- **All routes are protected** by middleware except `/auth/*`
- **All API routes must filter by `session.user.clientId`**
- Sessions are stored in the database for persistence
- Magic links expire after use or timeout

## 🗄️ Database Access

The portal uses the shared `@freelance-os/database` package:

```typescript
import { prisma } from "@freelance-os/database";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.clientId) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  // ALWAYS filter by clientId
  const projects = await prisma.project.findMany({
    where: { clientId: session.user.clientId },
  });
  
  return Response.json(projects);
}
```

## 🎨 Styling

- **Tailwind CSS** for styling
- **Dark mode** support
- Shared components from `@freelance-os/ui` package

## 📚 Documentation

- [AUTH_SETUP.md](./AUTH_SETUP.md) - Authentication setup and testing
- [AGENTS.md](./AGENTS.md) - AI agent development guidelines
- [Main CHECKLIST.md](../../CHECKLIST.md) - Overall project progress

## 🧪 Testing

```bash
# Run type checking
pnpm type-check

# Run linting
pnpm lint
```

## 🚀 Deployment

See main project README for deployment instructions. The client portal requires:
- PostgreSQL database (shared with admin dashboard)
- Email provider (Resend recommended)
- Environment variables for NextAuth and database

## 📝 Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Random secret for NextAuth (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - Public URL of the portal
- `AUTH_RESEND_KEY` - Resend API key for magic links
- `EMAIL_FROM` - Sender email address

Optional:
- `CLIENT_PORTAL_URL` - Production URL (defaults to NEXTAUTH_URL)


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

