# Admin Dashboard - Agent Instructions

## CRITICAL RULES

⚠️ **DO NOT CREATE DOCUMENTATION FILES** - Just implement the features. No GUIDE.md, SUMMARY.md, STATUS.md files unless explicitly requested by the user.

## App Overview

The admin dashboard is the internal management interface for the freelance business. It provides full access to all data without client-based filtering.

**Port**: 3000  
**Auth**: NextAuth.js with admin provider (not yet implemented)  
**Access**: Full database access (no client filtering)

## DateTime Handling ⚠️ CRITICAL

**We use Temporal API for all datetime operations. See `DATETIME_GUIDE.md` for full details.**

### Quick Rules:
- ✅ Server sends UTC ISO strings (`"2025-11-01T14:30:00Z"`)
- ✅ Use `<ClientDateTime value={utcString} />` for display
- ✅ Use `import { formatDateTime, parseUTC } from '@/lib/datetime'` for calculations
- ❌ NEVER use `new Date()` in components (causes hydration errors)
- ❌ NEVER format dates in Server Components
- ❌ NEVER SSR current time or timezone-dependent values

### Example:
```tsx
// ✅ Good
import { ClientDateTime } from '@/components/ClientDateTime';
<ClientDateTime value={entry.startTime} />

// ❌ Bad - causes hydration mismatch
<div>{new Date(entry.startTime).toLocaleString()}</div>
```

See:
- `DATETIME_GUIDE.md` - Complete guide
- `DATETIME_MIGRATION.md` - Migration examples
- `lib/datetime.ts` - Utility functions
- `components/ClientDateTime.tsx` - Display components
- `hooks/useTemporal.ts` - React hooks

## Key Features to Implement

### 1. Client Management (`/clients`)
- List all clients with search/filter
- Create new clients
- Edit client details
- Delete clients (cascades to projects, time entries, invoices)

### 2. Project Management (`/projects`)
- List all projects with client grouping
- Create projects linked to clients
- Update project status (active, completed, on-hold)
- Track project start/end dates

### 3. Time Tracking (`/time`)
- Log manual time entries
- Link time entries to projects
- Calculate duration automatically from start/end times
- Mark entries as billable/non-billable
- Weekly/monthly time reports

### 4. Invoice Generation (`/invoices`)
- Manual invoice creation
- Auto-generate invoices from time entries
- Track invoice status (draft, sent, paid, overdue, cancelled)
- Calculate amounts from hourly rates × time entries
- Generate unique invoice numbers (pattern: `INV-YYYYMMDD-XXX`)

### 5. Activity Analytics (`/analytics`)
- **Use D3.js for all charts**
- Query `activity_sessions` table (read-only)
- Visualizations:
  - Daily activity timeline (bar chart)
  - Top applications by time (pie/donut chart)
  - Weekly trends (line chart)
  - App category breakdown
- Filter by date range
- Aggregate by `appClass`

## API Route Patterns

### Standard CRUD Pattern
```typescript
// app/api/clients/route.ts
import { prisma } from '@freelance-os/database';
import { NextResponse } from 'next/server';

export async function GET() {
  const clients = await prisma.client.findMany({
    include: {
      projects: true,
      _count: { select: { invoices: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const body = await request.json();
  const client = await prisma.client.create({ 
    data: body 
  });
  return NextResponse.json(client, { status: 201 });
}
```

### Dynamic Routes (Next.js 15+ - await params)
```typescript
// app/api/clients/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // MUST await
  const client = await prisma.client.findUnique({
    where: { id: parseInt(id) },
    include: { projects: true, invoices: true }
  });
  
  if (!client) {
    return new Response('Not found', { status: 404 });
  }
  
  return NextResponse.json(client);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const client = await prisma.client.update({
    where: { id: parseInt(id) },
    data: body
  });
  return NextResponse.json(client);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.client.delete({
    where: { id: parseInt(id) }
  });
  return new Response(null, { status: 204 });
}
```

## Server Component Patterns

### Data Fetching in Pages
```typescript
// app/clients/page.tsx
import { prisma } from '@freelance-os/database';

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    include: {
      _count: { 
        select: { projects: true, invoices: true } 
      }
    },
    orderBy: { name: 'asc' }
  });

  return (
    <div>
      <h1>Clients</h1>
      <ClientList clients={clients} />
    </div>
  );
}
```

### Time Entry Duration Calculation
```typescript
// app/api/time/route.ts
export async function POST(request: Request) {
  const { projectId, description, startTime, endTime, billable } = await request.json();
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  // Calculate duration in minutes
  const durationMinutes = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60)
  );
  
  const timeEntry = await prisma.timeEntry.create({
    data: {
      projectId,
      description,
      startTime: start,
      endTime: end,
      durationMinutes,
      billable: billable ?? true
    }
  });
  
  return NextResponse.json(timeEntry, { status: 201 });
}
```

## D3.js Chart Examples

### Activity Sessions Bar Chart
```typescript
'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface ActivityChartProps {
  sessions: Array<{
    appClass: string;
    totalSeconds: number;
  }>;
}

export function ActivityBarChart({ sessions }: ActivityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !sessions.length) return;

    const margin = { top: 20, right: 30, bottom: 40, left: 90 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Convert seconds to hours
    const data = sessions.map(s => ({
      app: s.appClass,
      hours: s.totalSeconds / 3600
    }));

    // Scales
    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.hours) || 0])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.app))
      .range([0, height])
      .padding(0.1);

    // Bars
    svg.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('y', d => y(d.app)!)
      .attr('height', y.bandwidth())
      .attr('x', 0)
      .attr('width', d => x(d.hours))
      .attr('fill', 'steelblue');

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    svg.append('g')
      .call(d3.axisLeft(y));

  }, [sessions]);

  return <svg ref={svgRef}></svg>;
}
```

## Authentication (When Implementing)

### NextAuth.js Setup
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Admin Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Check against admin credentials
        if (credentials?.username === process.env.ADMIN_USERNAME &&
            credentials?.password === process.env.ADMIN_PASSWORD) {
          return {
            id: '1',
            name: 'Admin',
            email: 'admin@freelance-os.local',
            role: 'admin'
          };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
  }
});

export { handler as GET, handler as POST };
```

### Protected Route Middleware
```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => token?.role === 'admin',
  },
});

export const config = {
  matcher: ['/clients/:path*', '/projects/:path*', '/time/:path*', '/invoices/:path*', '/analytics/:path*']
};
```

## Common Queries

### Get Time Entries with Project and Client Info
```typescript
const timeEntries = await prisma.timeEntry.findMany({
  include: {
    project: {
      include: {
        client: true
      }
    }
  },
  where: {
    startTime: { gte: startDate, lte: endDate }
  },
  orderBy: { startTime: 'desc' }
});
```

### Generate Invoice from Time Entries
```typescript
// app/api/invoices/generate/route.ts
export async function POST(request: Request) {
  const { clientId, projectId, hourlyRate, startDate, endDate } = await request.json();

  // Get billable time entries
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      projectId,
      billable: true,
      startTime: { gte: new Date(startDate) },
      endTime: { lte: new Date(endDate) }
    }
  });

  // Calculate total hours and amount
  const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const totalHours = totalMinutes / 60;
  const amount = totalHours * hourlyRate;

  // Generate invoice number
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await prisma.invoice.count();
  const invoiceNumber = `INV-${today}-${String(count + 1).padStart(3, '0')}`;

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      clientId,
      projectId,
      amount,
      currency: 'USD',
      status: 'draft',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      notes: `${totalHours.toFixed(2)} hours @ $${hourlyRate}/hr`
    }
  });

  return NextResponse.json(invoice, { status: 201 });
}
```

## Important Conventions

1. **No client filtering** - Admin has access to all data
2. **Use Server Components** - Default for data fetching
3. **Calculate durations** - Always store `durationMinutes` for time entries
4. **D3.js for charts** - Not Recharts or Chart.js
5. **Read-only activity data** - Never write to `activity_sessions` or `activity_summaries`
6. **Invoice numbers** - Use pattern `INV-YYYYMMDD-XXX`
7. **Cascade deletes** - Configured in schema, be aware when deleting clients
