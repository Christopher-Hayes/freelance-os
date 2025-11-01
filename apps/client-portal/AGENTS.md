# Client Portal - Agent Instructions

## App Overview

The client portal is a client-facing interface where clients can view their projects, time tracking, and invoices. All data is filtered by the authenticated client's ID.

**Port**: 3001  
**Auth**: NextAuth.js with email magic link provider (not yet implemented)  
**Access**: Data filtered by `session.user.clientId` (CRITICAL)

## Security-First Design

### CRITICAL RULE: Always Filter by Client ID

Every database query MUST include a client ID filter. Never show data from other clients.

```typescript
// ✅ CORRECT
const session = await getServerSession(authOptions);
const projects = await prisma.project.findMany({
  where: { clientId: session.user.clientId }  // REQUIRED
});

// ❌ WRONG - Security vulnerability!
const projects = await prisma.project.findMany();
```

## Key Features to Implement

### 1. Dashboard (`/dashboard`)
- Overview of client's projects
- Total hours logged this month
- Recent time entries
- Outstanding invoices
- Project status summary

### 2. Projects View (`/projects`)
- List all projects for this client
- Project details (status, dates, description)
- Total hours logged per project
- Recent activity on each project

### 3. Time Tracking View (`/time`)
- View all time entries for client's projects
- Group by week/month
- Filter by project
- Weekly breakdown chart (D3.js)
- Total billable vs non-billable hours

### 4. Invoices View (`/invoices`)
- List all invoices for this client
- Invoice details (amount, status, due date)
- Highlight overdue invoices
- Filter by status (paid, unpaid, overdue)
- Download invoice PDFs (future)

## Authentication Setup

### NextAuth.js with Email Provider
```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@freelance-os/database';

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach clientId to session
      const client = await prisma.client.findUnique({
        where: { email: user.email! },
        select: { id: true }
      });
      
      if (client) {
        session.user.clientId = client.id;
      }
      
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify',
  }
});

export { handler as GET, handler as POST };
```

### Type Extension for Session
```typescript
// types/next-auth.d.ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      clientId: number;  // Add this
    }
  }
}
```

## API Route Patterns

### Always Check Auth and Filter by Client ID
```typescript
// app/api/projects/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { prisma } from '@freelance-os/database';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.clientId) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const projects = await prisma.project.findMany({
    where: {
      clientId: session.user.clientId  // CRITICAL
    },
    include: {
      _count: {
        select: { timeEntries: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  return NextResponse.json(projects);
}
```

### Time Entries with Project Filter
```typescript
// app/api/time/route.ts
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.clientId) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      project: {
        clientId: session.user.clientId  // Filter through relation
      },
      ...(startDate && endDate ? {
        startTime: { gte: new Date(startDate) },
        endTime: { lte: new Date(endDate) }
      } : {})
    },
    include: {
      project: {
        select: { id: true, name: true }
      }
    },
    orderBy: { startTime: 'desc' }
  });
  
  return NextResponse.json(timeEntries);
}
```

### Invoice Access
```typescript
// app/api/invoices/route.ts
export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.clientId) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const invoices = await prisma.invoice.findMany({
    where: {
      clientId: session.user.clientId  // CRITICAL
    },
    include: {
      project: {
        select: { id: true, name: true }
      }
    },
    orderBy: { issueDate: 'desc' }
  });
  
  return NextResponse.json(invoices);
}
```

## Server Component Patterns

### Dashboard Page
```typescript
// app/dashboard/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { prisma } from '@freelance-os/database';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.clientId) {
    redirect('/auth/signin');
  }
  
  const clientId = session.user.clientId;
  
  // Fetch all dashboard data
  const [projects, recentTimeEntries, invoices] = await Promise.all([
    prisma.project.findMany({
      where: { clientId },
      include: {
        _count: { select: { timeEntries: true } }
      }
    }),
    prisma.timeEntry.findMany({
      where: {
        project: { clientId }
      },
      take: 10,
      orderBy: { startTime: 'desc' },
      include: { project: true }
    }),
    prisma.invoice.findMany({
      where: { clientId },
      orderBy: { issueDate: 'desc' }
    })
  ]);
  
  // Calculate total hours this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const monthlyEntries = await prisma.timeEntry.findMany({
    where: {
      project: { clientId },
      startTime: { gte: startOfMonth }
    },
    select: { durationMinutes: true }
  });
  
  const totalHoursThisMonth = monthlyEntries.reduce(
    (sum, entry) => sum + entry.durationMinutes, 0
  ) / 60;
  
  return (
    <div>
      <h1>Welcome, {session.user.name}</h1>
      <DashboardSummary
        projects={projects}
        recentTimeEntries={recentTimeEntries}
        invoices={invoices}
        totalHoursThisMonth={totalHoursThisMonth}
      />
    </div>
  );
}
```

## D3.js Chart Examples

### Weekly Time Breakdown
```typescript
'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface WeeklyChartProps {
  timeEntries: Array<{
    startTime: Date;
    durationMinutes: number;
  }>;
}

export function WeeklyBreakdownChart({ timeEntries }: WeeklyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !timeEntries.length) return;

    // Group by week
    const weeklyData = d3.rollup(
      timeEntries,
      entries => d3.sum(entries, d => d.durationMinutes) / 60, // Convert to hours
      d => d3.timeWeek.floor(new Date(d.startTime))
    );

    const data = Array.from(weeklyData, ([week, hours]) => ({
      week,
      hours
    })).sort((a, b) => a.week.getTime() - b.week.getTime());

    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.week) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.hours) || 0])
      .nice()
      .range([height, 0]);

    // Line generator
    const line = d3.line<{ week: Date; hours: number }>()
      .x(d => x(d.week))
      .y(d => y(d.hours));

    // Draw line
    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', 'steelblue')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    svg.append('g')
      .call(d3.axisLeft(y))
      .append('text')
      .attr('fill', '#000')
      .attr('transform', 'rotate(-90)')
      .attr('y', 6)
      .attr('dy', '0.71em')
      .attr('text-anchor', 'end')
      .text('Hours');

  }, [timeEntries]);

  return <svg ref={svgRef}></svg>;
}
```

## Middleware for Route Protection

```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token?.clientId,
  },
  pages: {
    signIn: '/auth/signin',
  }
});

export const config = {
  matcher: ['/dashboard/:path*', '/projects/:path*', '/time/:path*', '/invoices/:path*']
};
```

## Common Queries

### Get Client's Project Statistics
```typescript
const projectStats = await prisma.project.findMany({
  where: { clientId: session.user.clientId },
  include: {
    timeEntries: {
      select: {
        durationMinutes: true,
        billable: true
      }
    },
    _count: {
      select: { timeEntries: true }
    }
  }
});

// Calculate totals per project
const enrichedProjects = projectStats.map(project => ({
  ...project,
  totalHours: project.timeEntries.reduce(
    (sum, entry) => sum + entry.durationMinutes, 0
  ) / 60,
  billableHours: project.timeEntries
    .filter(e => e.billable)
    .reduce((sum, entry) => sum + entry.durationMinutes, 0) / 60
}));
```

### Outstanding Invoices
```typescript
const outstandingInvoices = await prisma.invoice.findMany({
  where: {
    clientId: session.user.clientId,
    status: { in: ['sent', 'overdue'] },
    paidDate: null
  },
  orderBy: { dueDate: 'asc' }
});

// Mark overdue
const today = new Date();
const invoicesWithStatus = outstandingInvoices.map(invoice => ({
  ...invoice,
  isOverdue: new Date(invoice.dueDate) < today && invoice.status !== 'paid'
}));
```

## Important Conventions

1. **ALWAYS filter by clientId** - Every query must be scoped to the authenticated client
2. **Check session on every request** - Both in API routes and server components
3. **Use NextAuth.js** - Email magic link provider for passwordless auth
4. **Read-only access** - Clients can only view, not create/edit data
5. **D3.js for charts** - Consistent with admin dashboard
6. **Handle missing data gracefully** - Show empty states when no projects/invoices exist
7. **Highlight urgent items** - Overdue invoices, upcoming due dates
