import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getMostUsedApp, getTopProject, getHoursInRange } from "@/lib/activity-actions";
import { Temporal } from "@js-temporal/polyfill";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// ============================================================================
// Types
// ============================================================================

export type TimeEntryCreateRequest = {
  projectId: number;
  startTime: string; // ISO 8601 datetime string (e.g., "2025-11-02T00:00:00-04:00[America/New_York]")
  endTime: string; // ISO 8601 datetime string
  durationMinutes: number;
  description?: string;
  billable?: boolean;
};

export type TimeEntryListParams = {
  projectId?: string;
  clientId?: string;
  startDate?: string; // YYYY-MM-DD format
  endDate?: string; // YYYY-MM-DD format
};

export type TimeEntryListResponse = {
  timeEntries: Array<{
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
  }>;
  summary: {
    totalMinutes: number;
    totalHours: number;
    count: number;
    topAppThisWeek?: {
      appClass: string;
      hours: number;
    } | null;
    topProjectThisMonth?: {
      projectName: string;
      hours: number;
    } | null;
    hoursThisMonth?: number;
  };
};

export type TimeEntryCreateResponse = {
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
    };
  };
};

// ============================================================================
// Route Handlers
// ============================================================================

// GET /api/time - List time entries with optional filters
export async function GET(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "read:time")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: read:time" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const contextDate = searchParams.get("contextDate"); // For summary calculations

    const where: any = {};

    if (projectId) {
      where.projectId = parseInt(projectId);
    }

    if (clientId) {
      where.project = {
        clientId: parseInt(clientId),
      };
    }

    // Build date range using Temporal for consistent UTC handling
    // Time entries are stored as UTC, so query exact UTC day boundaries
    let queryStartDate: Date | undefined;
    let queryEndDate: Date | undefined;

    if (startDate) {
      const sd = Temporal.PlainDate.from(startDate);
      queryStartDate = new Date(sd.toZonedDateTime('UTC').toInstant().epochMilliseconds);
    }
    if (endDate) {
      const ed = Temporal.PlainDate.from(endDate);
      queryEndDate = new Date(
        ed.toZonedDateTime({ timeZone: 'UTC', plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant().epochMilliseconds
      );
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

    // Calculate additional metrics using Temporal
    // Use contextDate if provided, otherwise use today
    const referenceDate = contextDate 
      ? Temporal.PlainDate.from(contextDate)
      : Temporal.Now.plainDateISO();
    
    // 1. Most used app this week (Monday to reference date)
    // dayOfWeek: 1=Monday, 2=Tuesday, ..., 7=Sunday
    // So subtract (dayOfWeek - 1) days to get to Sunday
    const weekStart = referenceDate.subtract({ days: referenceDate.dayOfWeek - 1 });
    const weekEnd = referenceDate.add({ days: 7 - referenceDate.dayOfWeek });
    const topAppThisWeek = await getMostUsedApp(weekStart, weekEnd);

    // 2. Hours recorded this month
    const monthStart = Temporal.PlainDate.from({ 
      year: referenceDate.year, 
      month: referenceDate.month, 
      day: 1 
    });
    const monthEnd = Temporal.PlainDate.from({
      year: referenceDate.year,
      month: referenceDate.month,
      day: referenceDate.daysInMonth,
    });
    const hoursThisMonth = await getHoursInRange(monthStart, monthEnd);

    // 3. Project with most time spent this month
    const topProjectThisMonth = await getTopProject(monthStart, monthEnd);

    return NextResponse.json({
      timeEntries,
      summary: {
        totalMinutes,
        totalHours: parseFloat(totalHours),
        count: timeEntries.length,
        topAppThisWeek,
        topProjectThisMonth,
        hoursThisMonth,
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
export async function POST(request: Request): Promise<NextResponse<TimeEntryCreateResponse | { error: string }>> {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "write:time")) {
      return NextResponse.json({ error: "Forbidden - Missing permission: write:time" }, { status: 403 });
    }

    const body: TimeEntryCreateRequest = await request.json();
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
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Parse Temporal datetime strings to UTC
    // Client sends: "2025-11-02T00:00:00-04:00[America/New_York]"
    // We need to extract the ISO string and convert to UTC
    let startTimeUTC: Date;
    let endTimeUTC: Date;

    try {
      // Remove the timezone annotation if present (e.g., "[America/New_York]")
      const startTimeClean = startTime.replace(/\[.*?\]$/, '');
      const endTimeClean = endTime.replace(/\[.*?\]$/, '');
      
      // Parse as ISO string - JavaScript Date will handle timezone offsets
      startTimeUTC = new Date(startTimeClean);
      endTimeUTC = new Date(endTimeClean);

      // Validate dates are valid
      if (isNaN(startTimeUTC.getTime()) || isNaN(endTimeUTC.getTime())) {
        throw new Error("Invalid date format");
      }
    } catch (parseError) {
      console.error("Error parsing datetime:", parseError);
      return NextResponse.json(
        { error: "Invalid datetime format. Expected ISO 8601 string." },
        { status: 400 }
      );
    }

    const timeEntry = await prisma.timeEntry.create({
      data: {
        projectId,
        startTime: startTimeUTC,
        endTime: endTimeUTC,
        durationMinutes,
        description: description || "",
        billable: billable ?? true, // Default to billable
      },
      include: {
        project: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Convert Date objects to UTC ISO strings for response
    const response: TimeEntryCreateResponse = {
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
        },
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating time entry:", error);
    return NextResponse.json(
      { error: "Failed to create time entry" },
      { status: 500 }
    );
  }
}
