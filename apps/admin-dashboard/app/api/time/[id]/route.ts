import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

// GET /api/time/[id] - Get a single time entry
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: parseInt(id) },
      include: {
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!timeEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(timeEntry);
  } catch (error) {
    console.error("Error fetching time entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch time entry" },
      { status: 500 }
    );
  }
}

// PUT /api/time/[id] - Update a time entry
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { projectId, startTime, endTime, durationMinutes, description, billable } = body;

    // Check if time entry exists
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    // If projectId is changing, validate new project exists
    if (projectId && parseInt(projectId) !== existingEntry.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: parseInt(projectId) },
      });

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
    }

    const updateData: any = {};
    if (projectId !== undefined) updateData.projectId = parseInt(projectId);
    if (startTime !== undefined) updateData.startTime = new Date(startTime);
    if (endTime !== undefined) updateData.endTime = new Date(endTime);
    if (durationMinutes !== undefined)
      updateData.durationMinutes = parseInt(durationMinutes);
    if (description !== undefined) updateData.description = description;
    if (billable !== undefined) updateData.billable = billable;

    const timeEntry = await prisma.timeEntry.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    return NextResponse.json(timeEntry);
  } catch (error) {
    console.error("Error updating time entry:", error);
    return NextResponse.json(
      { error: "Failed to update time entry" },
      { status: 500 }
    );
  }
}

// DELETE /api/time/[id] - Delete a time entry
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if time entry exists
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    await prisma.timeEntry.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting time entry:", error);
    return NextResponse.json(
      { error: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}
