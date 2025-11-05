import { NextResponse } from "next/server";
import { getClientAuth } from "@/lib/auth";
import { prisma } from "@freelance-os/database";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
    }

    // CRITICAL: Verify the project belongs to the authenticated client
    const project = await prisma.project.findUnique({
      where: {
        id,
      },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // CRITICAL: Security check - ensure project belongs to this client
    if (project.clientId !== authData.clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get total hours for this project
    const totalMinutes = await prisma.timeEntry.aggregate({
      where: {
        projectId: id,
      },
      _sum: {
        durationMinutes: true,
      },
    });

    // Get recent time entries (last 10)
    const recentTimeEntries = await prisma.timeEntry.findMany({
      where: {
        projectId: id,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 10,
    });

    return NextResponse.json({
      ...project,
      totalHours: totalMinutes._sum?.durationMinutes
        ? (totalMinutes._sum.durationMinutes / 60).toFixed(2)
        : "0.00",
      recentTimeEntries,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}
