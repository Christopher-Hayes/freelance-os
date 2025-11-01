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

    // Build initial where clause for database query
    let queryStartDate: Date | undefined;
    let queryEndDate: Date | undefined;

    if (startDate) {
      const [year, month, day] = startDate.split('-').map(Number);
      queryStartDate = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
      queryStartDate.setUTCHours(queryStartDate.getUTCHours() - 24); // Query 24 hours before
    }
    if (endDate) {
      const [year, month, day] = endDate.split('-').map(Number);
      queryEndDate = new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999));
      queryEndDate.setUTCHours(queryEndDate.getUTCHours() + 24); // Query 24 hours after
    }

    if (queryStartDate || queryEndDate) {
      where.startTime = {};
      if (queryStartDate) {
        where.startTime.gte = queryStartDate;
      }
      if (queryEndDate) {
        where.startTime.lte = queryEndDate;
      }
    }

    const allTimeEntries = await prisma.timeEntry.findMany({
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

    // Filter entries to only those whose LOCAL date falls within the requested range
    const timeEntries = allTimeEntries.filter((entry) => {
      const localStart = new Date(entry.startTime);
      const localYear = localStart.getFullYear();
      const localMonth = localStart.getMonth() + 1;
      const localDay = localStart.getDate();

      // Check if local date is within range
      if (startDate) {
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        const entryDate = localYear * 10000 + localMonth * 100 + localDay;
        const rangeStart = startYear! * 10000 + startMonth! * 100 + startDay!;
        if (entryDate < rangeStart) return false;
      }
      if (endDate) {
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        const entryDate = localYear * 10000 + localMonth * 100 + localDay;
        const rangeEnd = endYear! * 10000 + endMonth! * 100 + endDay!;
        if (entryDate > rangeEnd) return false;
      }
      return true;
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
