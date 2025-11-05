import { NextResponse } from "next/server";
import { getClientAuth } from "@/lib/auth";
import { prisma } from "@freelance-os/database";

export async function GET() {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // CRITICAL: Only fetch projects for the authenticated client
    const projects = await prisma.project.findMany({
      where: {
        clientId: authData.clientId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        client: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
    });

    // Calculate total hours for each project
    const projectsWithHours = await Promise.all(
      projects.map(async (project) => {
        const totalMinutes = await prisma.timeEntry.aggregate({
          where: {
            projectId: project.id,
          },
          _sum: {
            durationMinutes: true,
          },
        });

        return {
          ...project,
          totalHours: totalMinutes._sum.durationMinutes
            ? (totalMinutes._sum.durationMinutes / 60).toFixed(2)
            : "0.00",
        };
      })
    );

    return NextResponse.json(projectsWithHours);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
