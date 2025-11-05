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

    // Default to last 12 weeks if no range specified
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        project: {
          clientId: authData.clientId,
        },
        startTime: {
          gte: start,
          lte: end,
        },
      },
      select: {
        startTime: true,
        durationMinutes: true,
        billable: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    // Group by week
    const weeklyData: Record<
      string,
      {
        week: string;
        weekStart: string;
        totalHours: number;
        billableHours: number;
        nonBillableHours: number;
        entriesCount: number;
      }
    > = {};

    timeEntries.forEach((entry) => {
      const date = new Date(entry.startTime);
      // Get Monday of the week
      const dayOfWeek = date.getDay();
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      monday.setHours(0, 0, 0, 0);

      const weekKey = monday.toISOString().split("T")[0] as string;

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: weekKey,
          weekStart: monday.toISOString(),
          totalHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          entriesCount: 0,
        };
      }

      const hours = entry.durationMinutes / 60;
      weeklyData[weekKey]!.totalHours += hours;
      weeklyData[weekKey]!.entriesCount += 1;

      if (entry.billable) {
        weeklyData[weekKey]!.billableHours += hours;
      } else {
        weeklyData[weekKey]!.nonBillableHours += hours;
      }
    });

    // Convert to array and sort by week
    const weekly = Object.values(weeklyData)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((week) => ({
        ...week,
        totalHours: parseFloat(week.totalHours.toFixed(2)),
        billableHours: parseFloat(week.billableHours.toFixed(2)),
        nonBillableHours: parseFloat(week.nonBillableHours.toFixed(2)),
      }));

    // Group by project
    const projectData: Record<
      number,
      {
        projectId: number;
        projectName: string;
        totalHours: number;
        billableHours: number;
        entriesCount: number;
      }
    > = {};

    timeEntries.forEach((entry) => {
      const projectId = entry.project.id;

      if (!projectData[projectId]) {
        projectData[projectId] = {
          projectId,
          projectName: entry.project.name,
          totalHours: 0,
          billableHours: 0,
          entriesCount: 0,
        };
      }

      const hours = entry.durationMinutes / 60;
      projectData[projectId].totalHours += hours;
      projectData[projectId].entriesCount += 1;

      if (entry.billable) {
        projectData[projectId].billableHours += hours;
      }
    });

    const byProject = Object.values(projectData)
      .sort((a, b) => b.totalHours - a.totalHours)
      .map((project) => ({
        ...project,
        totalHours: parseFloat(project.totalHours.toFixed(2)),
        billableHours: parseFloat(project.billableHours.toFixed(2)),
      }));

    return NextResponse.json({
      weekly,
      byProject,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching time summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch time summary" },
      { status: 500 }
    );
  }
}
