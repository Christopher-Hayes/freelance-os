import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import type { ProjectStatus } from '@freelance-os/types';
import { getAdminAuth } from '@/lib/auth';

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');

    const where: any = {};
    if (clientId) {
      where.clientId = parseInt(clientId);
    }
    if (status) {
      where.status = status;
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate total hours for each project
    const projectsWithHours = await Promise.all(
      projects.map(async (project) => {
        const result = await prisma.timeEntry.aggregate({
          where: { projectId: project.id },
          _sum: { durationMinutes: true },
        });
        
        return {
          ...project,
          totalHours: result._sum.durationMinutes 
            ? Math.round((result._sum.durationMinutes / 60) * 100) / 100 
            : 0,
        };
      })
    );

    return NextResponse.json(projectsWithHours);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, clientDescription, privateNotes, clientId, status, color, billable, startDate, endDate } = body;

    // Validation
    if (!name || !clientId) {
      return NextResponse.json(
        { error: 'Name and client are required' },
        { status: 400 }
      );
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: parseInt(clientId) },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        clientDescription,
        privateNotes,
        clientId: parseInt(clientId),
        status: status || 'active',
        color: color || '#22C55E', // Default green if not provided
        billable: billable ?? true, // Default true if not provided
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
