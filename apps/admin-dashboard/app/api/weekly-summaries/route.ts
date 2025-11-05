import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import type { CreateWeeklySummaryInput } from '@freelance-os/types';

// GET /api/weekly-summaries?projectId=1&weekStart=2024-01-01
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const weekStart = searchParams.get('weekStart');

    const where: any = {};
    if (projectId) {
      where.projectId = parseInt(projectId);
    }
    if (weekStart) {
      where.weekStart = new Date(weekStart);
    }

    const summaries = await prisma.weeklySummary.findMany({
      where,
      orderBy: { weekStart: 'desc' },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(summaries);
  } catch (error) {
    console.error('Error fetching weekly summaries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly summaries' },
      { status: 500 }
    );
  }
}

// POST /api/weekly-summaries
export async function POST(request: NextRequest) {
  try {
    const body: CreateWeeklySummaryInput = await request.json();
    
    // Validate required fields
    if (!body.projectId || !body.weekStart || !body.summary) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, weekStart, summary' },
        { status: 400 }
      );
    }

    // Check if summary already exists for this project/week
    const existing = await prisma.weeklySummary.findUnique({
      where: {
        projectId_weekStart: {
          projectId: body.projectId,
          weekStart: new Date(body.weekStart),
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A summary already exists for this project and week. Use PUT to update.' },
        { status: 409 }
      );
    }

    const summary = await prisma.weeklySummary.create({
      data: {
        projectId: body.projectId,
        weekStart: new Date(body.weekStart),
        summary: body.summary,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    console.error('Error creating weekly summary:', error);
    return NextResponse.json(
      { error: 'Failed to create weekly summary' },
      { status: 500 }
    );
  }
}
