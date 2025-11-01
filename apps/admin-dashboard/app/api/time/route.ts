import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

// GET /api/time - List time entries with optional filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {};

    if (projectId) {
      where.projectId = parseInt(projectId);
    }

    if (clientId) {
      where.project = {
        clientId: parseInt(clientId),
      };
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.startTime.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.startTime.lte = end;
      }
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      include: {
        project: {
          include: {
            client: true,
          },
        },
      },
      orderBy: {
        startTime: "desc",
      },
    });

    // Calculate total duration
    const totalMinutes = timeEntries.reduce(
      (sum, entry) => sum + entry.durationMinutes,
      0
    );
    const totalHours = (totalMinutes / 60).toFixed(2);

    return NextResponse.json({
      timeEntries,
      summary: {
        totalMinutes,
        totalHours: parseFloat(totalHours),
        count: timeEntries.length,
      },
    });
  } catch (error) {
    console.error("Error fetching time entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch time entries" },
      { status: 500 }
    );
  }
}

// POST /api/time - Create a new time entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, startTime, endTime, durationMinutes, description, billable } = body;

    // Validate required fields
    if (!projectId || !startTime || !endTime || !durationMinutes) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, startTime, endTime, durationMinutes" },
        { status: 400 }
      );
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: parseInt(projectId) },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const timeEntry = await prisma.timeEntry.create({
      data: {
        projectId: parseInt(projectId),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        durationMinutes: parseInt(durationMinutes),
        description: description || "",
        billable: billable ?? true, // Default to billable
      },
      include: {
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    return NextResponse.json(timeEntry, { status: 201 });
  } catch (error) {
    console.error("Error creating time entry:", error);
    return NextResponse.json(
      { error: "Failed to create time entry" },
      { status: 500 }
    );
  }
}
