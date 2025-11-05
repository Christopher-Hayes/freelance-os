import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import type { UpdateWeeklySummaryInput } from '@freelance-os/types';

// GET /api/weekly-summaries/[id]
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const summaryId = parseInt(id);

    const summary = await prisma.weeklySummary.findUnique({
      where: { id: summaryId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!summary) {
      return NextResponse.json(
        { error: 'Weekly summary not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error fetching weekly summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly summary' },
      { status: 500 }
    );
  }
}

// PUT /api/weekly-summaries/[id]
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const summaryId = parseInt(id);
    const body: UpdateWeeklySummaryInput = await request.json();

    // Check if summary exists
    const existing = await prisma.weeklySummary.findUnique({
      where: { id: summaryId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Weekly summary not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.weeklySummary.update({
      where: { id: summaryId },
      data: {
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

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating weekly summary:', error);
    return NextResponse.json(
      { error: 'Failed to update weekly summary' },
      { status: 500 }
    );
  }
}

// DELETE /api/weekly-summaries/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const summaryId = parseInt(id);

    await prisma.weeklySummary.delete({
      where: { id: summaryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting weekly summary:', error);
    return NextResponse.json(
      { error: 'Failed to delete weekly summary' },
      { status: 500 }
    );
  }
}
