import { NextResponse } from "next/server";
import { getClientAuth } from "@/lib/auth";
import { prisma } from "@freelance-os/database";

export async function GET(request: Request) {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const projectId = searchParams.get("projectId");

    // Build filter conditions
    const whereConditions: any = {
      project: {
        clientId: authData.clientId, // CRITICAL: Filter through relation
      },
    };

    // Add date range filter if provided
    if (startDate && endDate) {
      whereConditions.startTime = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // Add project filter if provided
    if (projectId) {
      whereConditions.projectId = parseInt(projectId);
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: whereConditions,
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startTime: "desc",
      },
    });

    // Calculate totals
    const totalMinutes = timeEntries.reduce(
      (sum, entry) => sum + entry.durationMinutes,
      0
    );
    const billableMinutes = timeEntries
      .filter((entry) => entry.billable)
      .reduce((sum, entry) => sum + entry.durationMinutes, 0);

    return NextResponse.json({
      timeEntries,
      summary: {
        totalHours: (totalMinutes / 60).toFixed(2),
        billableHours: (billableMinutes / 60).toFixed(2),
        nonBillableHours: ((totalMinutes - billableMinutes) / 60).toFixed(2),
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
