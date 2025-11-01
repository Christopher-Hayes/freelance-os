import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import type { ProjectStatus } from '@freelance-os/types';

// GET /api/projects/[id] - Get a single project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          },
        },
        timeEntries: {
          orderBy: { startTime: 'desc' },
          take: 10,
          select: {
            id: true,
            description: true,
            startTime: true,
            durationMinutes: true,
            billable: true,
          },
        },
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Calculate total hours
    const result = await prisma.timeEntry.aggregate({
      where: { projectId },
      _sum: { durationMinutes: true },
    });

    const projectWithHours = {
      ...project,
      totalHours: result._sum?.durationMinutes
        ? Math.round((result._sum.durationMinutes / 60) * 100) / 100
        : 0,
    };

    return NextResponse.json(projectWithHours);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    const body = await request.json();
    const { name, description, clientId, status, startDate, endDate } = body;

    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!existingProject) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // If clientId is being changed, verify new client exists
    if (clientId && parseInt(clientId) !== existingProject.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: parseInt(clientId) },
      });

      if (!client) {
        return NextResponse.json(
          { error: 'Client not found' },
          { status: 404 }
        );
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (clientId !== undefined) updateData.clientId = parseInt(clientId);
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) {
      updateData.startDate = startDate ? new Date(startDate) : null;
    }
    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : null;
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
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

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);

    // Check if project exists and count time entries
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const timeEntriesCount = project._count.timeEntries;

    // Delete project (cascade will delete time entries)
    await prisma.project.delete({
      where: { id: projectId },
    });

    return NextResponse.json({
      message: 'Project deleted successfully',
      deletedTimeEntries: timeEntriesCount,
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
