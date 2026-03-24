import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { getAdminAuth, hasPermission } from '@/lib/auth';

// PUT /api/projects/[id]/highlights/[highlightId] - Update a highlight
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; highlightId: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(authData, 'write:projects')) {
      return NextResponse.json({ error: 'Forbidden - Missing permission: write:projects' }, { status: 403 });
    }

    const { id, highlightId } = await params;
    const projectId = parseInt(id);
    const hId = parseInt(highlightId);

    if (isNaN(projectId) || isNaN(hId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Verify highlight exists and belongs to this project
    const existing = await prisma.projectHighlight.findFirst({
      where: { id: hId, projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Highlight not found' }, { status: 404 });
    }

    const body = await request.json();
    const { date, label, emoji } = body;

    const updateData: any = {};
    if (date !== undefined) updateData.date = new Date(date);
    if (label !== undefined) {
      if (label.length > 100) {
        return NextResponse.json({ error: 'Label must be 100 characters or less' }, { status: 400 });
      }
      updateData.label = label.trim();
    }
    if (emoji !== undefined) updateData.emoji = emoji?.trim() || null;

    const highlight = await prisma.projectHighlight.update({
      where: { id: hId },
      data: updateData,
    });

    return NextResponse.json(highlight);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A highlight with this date and label already exists' }, { status: 409 });
    }
    console.error('Error updating project highlight:', error);
    return NextResponse.json({ error: 'Failed to update highlight' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/highlights/[highlightId] - Delete a highlight
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; highlightId: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(authData, 'write:projects')) {
      return NextResponse.json({ error: 'Forbidden - Missing permission: write:projects' }, { status: 403 });
    }

    const { id, highlightId } = await params;
    const projectId = parseInt(id);
    const hId = parseInt(highlightId);

    if (isNaN(projectId) || isNaN(hId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Verify highlight exists and belongs to this project
    const existing = await prisma.projectHighlight.findFirst({
      where: { id: hId, projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Highlight not found' }, { status: 404 });
    }

    await prisma.projectHighlight.delete({ where: { id: hId } });

    return NextResponse.json({ success: true, message: 'Highlight deleted' });
  } catch (error) {
    console.error('Error deleting project highlight:', error);
    return NextResponse.json({ error: 'Failed to delete highlight' }, { status: 500 });
  }
}
