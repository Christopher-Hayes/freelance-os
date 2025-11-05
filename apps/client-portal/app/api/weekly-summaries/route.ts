import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { auth } from '@/lib/auth';

// GET /api/weekly-summaries?projectId=1
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    // CRITICAL: Verify the project belongs to the authenticated client
    const project = await prisma.project.findUnique({
      where: { id: parseInt(projectId) },
      select: { clientId: true },
    });

    if (!project || project.clientId !== session.user.clientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch summaries for this project
    const summaries = await prisma.weeklySummary.findMany({
      where: { projectId: parseInt(projectId) },
      orderBy: { weekStart: 'desc' },
      select: {
        id: true,
        projectId: true,
        weekStart: true,
        summary: true,
        // Do NOT expose createdAt/updatedAt to clients
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
