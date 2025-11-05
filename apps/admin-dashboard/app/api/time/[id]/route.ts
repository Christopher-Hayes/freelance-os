import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

// ============================================================================
// Types
// ============================================================================

export type TimeEntryUpdateRequest = {
  projectId?: number;
  startTime?: string; // ISO 8601 datetime string
  endTime?: string; // ISO 8601 datetime string
  durationMinutes?: number;
  description?: string;
  billable?: boolean;
};

export type TimeEntryResponse = {
  id: number;
  projectId: number;
  startTime: string; // UTC ISO string
  endTime: string; // UTC ISO string
  durationMinutes: number;
  description: string;
  billable: boolean;
  project: {
    id: number;
    name: string;
    client: {
      id: number;
      name: string;
      email: string;
      company: string | null;
    };
  };
};

// ============================================================================
// Route Handlers
// ============================================================================

// GET /api/time/[id] - Get a single time entry
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<TimeEntryResponse | { error: string }>> {
  try {
    const { id } = await params;
    const timeEntryId = parseInt(id);

    if (isNaN(timeEntryId)) {
      return NextResponse.json(
        { error: "Invalid time entry ID" },
        { status: 400 }
      );
    }

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
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

    // Convert Date objects to UTC ISO strings for response
    const response: TimeEntryResponse = {
      id: timeEntry.id,
      projectId: timeEntry.projectId,
      startTime: timeEntry.startTime.toISOString(),
      endTime: timeEntry.endTime.toISOString(),
      durationMinutes: timeEntry.durationMinutes,
      description: timeEntry.description || "",
      billable: timeEntry.billable,
      project: {
        id: timeEntry.project.id,
        name: timeEntry.project.name,
        client: {
          id: timeEntry.project.client.id,
          name: timeEntry.project.client.name,
          email: timeEntry.project.client.email,
          company: timeEntry.project.client.company,
        },
      },
    };

    return NextResponse.json(response);
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
): Promise<NextResponse<TimeEntryResponse | { error: string }>> {
  try {
    const { id } = await params;
    const timeEntryId = parseInt(id);
    const body: TimeEntryUpdateRequest = await request.json();
    const { projectId, startTime, endTime, durationMinutes, description, billable } = body;

    if (isNaN(timeEntryId)) {
      return NextResponse.json(
        { error: "Invalid time entry ID" },
        { status: 400 }
      );
    }

    // Check if time entry exists
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    // If projectId is changing, validate new project exists
    if (projectId && parseInt(projectId.toString()) !== existingEntry.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
    }

    const updateData: any = {};
    if (projectId !== undefined) updateData.projectId = projectId;
    if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes;
    if (description !== undefined) updateData.description = description;
    if (billable !== undefined) updateData.billable = billable;

    // Parse datetime strings to UTC (same logic as POST route)
    if (startTime !== undefined) {
      try {
        const startTimeClean = startTime.replace(/\[.*?\]$/, '');
        const startTimeUTC = new Date(startTimeClean);
        if (isNaN(startTimeUTC.getTime())) {
          return NextResponse.json(
            { error: "Invalid startTime format. Expected ISO 8601 string." },
            { status: 400 }
          );
        }
        updateData.startTime = startTimeUTC;
      } catch (parseError) {
        console.error("Error parsing startTime:", parseError);
        return NextResponse.json(
          { error: "Invalid startTime format. Expected ISO 8601 string." },
          { status: 400 }
        );
      }
    }

    if (endTime !== undefined) {
      try {
        const endTimeClean = endTime.replace(/\[.*?\]$/, '');
        const endTimeUTC = new Date(endTimeClean);
        if (isNaN(endTimeUTC.getTime())) {
          return NextResponse.json(
            { error: "Invalid endTime format. Expected ISO 8601 string." },
            { status: 400 }
          );
        }
        updateData.endTime = endTimeUTC;
      } catch (parseError) {
        console.error("Error parsing endTime:", parseError);
        return NextResponse.json(
          { error: "Invalid endTime format. Expected ISO 8601 string." },
          { status: 400 }
        );
      }
    }

    const timeEntry = await prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: updateData,
      include: {
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    // Convert Date objects to UTC ISO strings for response
    const response: TimeEntryResponse = {
      id: timeEntry.id,
      projectId: timeEntry.projectId,
      startTime: timeEntry.startTime.toISOString(),
      endTime: timeEntry.endTime.toISOString(),
      durationMinutes: timeEntry.durationMinutes,
      description: timeEntry.description || "",
      billable: timeEntry.billable,
      project: {
        id: timeEntry.project.id,
        name: timeEntry.project.name,
        client: {
          id: timeEntry.project.client.id,
          name: timeEntry.project.client.name,
          email: timeEntry.project.client.email,
          company: timeEntry.project.client.company,
        },
      },
    };

    return NextResponse.json(response);
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
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { id } = await params;
    const timeEntryId = parseInt(id);

    if (isNaN(timeEntryId)) {
      return NextResponse.json(
        { error: "Invalid time entry ID" },
        { status: 400 }
      );
    }

    // Check if time entry exists
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
    });

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    await prisma.timeEntry.delete({
      where: { id: timeEntryId },
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
