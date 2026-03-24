import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { getAdminAuth, hasPermission } from '@/lib/auth';

// GET /api/projects/[id]/highlights - List highlights for a project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(authData, 'read:projects')) {
      return NextResponse.json({ error: 'Forbidden - Missing permission: read:projects' }, { status: 403 });
    }

    const { id } = await params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const highlights = await prisma.projectHighlight.findMany({
      where: { projectId },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json(highlights);
  } catch (error) {
    console.error('Error fetching project highlights:', error);
    return NextResponse.json({ error: 'Failed to fetch highlights' }, { status: 500 });
  }
}

// POST /api/projects/[id]/highlights - Create a highlight
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(authData, 'write:projects')) {
      return NextResponse.json({ error: 'Forbidden - Missing permission: write:projects' }, { status: 403 });
    }

    const { id } = await params;
    const projectId = parseInt(id);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const { date, label, emoji, source } = body;

    if (!date || !label) {
      return NextResponse.json({ error: 'Date and label are required' }, { status: 400 });
    }

    if (label.length > 100) {
      return NextResponse.json({ error: 'Label must be 100 characters or less' }, { status: 400 });
    }

    const highlight = await prisma.projectHighlight.create({
      data: {
        projectId,
        date: new Date(date),
        label: label.trim(),
        emoji: emoji?.trim() || null,
        source: source || 'manual',
      },
    });

    return NextResponse.json(highlight, { status: 201 });
  } catch (error: any) {
    // Handle unique constraint violation (duplicate highlight)
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A highlight with this date and label already exists' }, { status: 409 });
    }
    console.error('Error creating project highlight:', error);
    return NextResponse.json({ error: 'Failed to create highlight' }, { status: 500 });
  }
}
