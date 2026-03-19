import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// GET /api/rescuetime/projects — List all RescueTime projects with aggregated stats
export async function GET() {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "read:projects")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const projects = await prisma.rescueTimeProject.findMany({
      orderBy: { name: "asc" },
      include: {
        projectTimes: {
          select: {
            durationSeconds: true,
            date: true,
          },
        },
        linkedProject: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const result = projects.map((p) => {
      const totalSeconds = p.projectTimes.reduce(
        (sum, t) => sum + t.durationSeconds,
        0
      );
      const dates = p.projectTimes.map((t) => t.date).sort();
      return {
        id: p.id,
        rtProjectId: p.rtProjectId,
        name: p.name,
        color: p.color,
        notes: p.notes,
        archivedAt: p.archivedAt,
        billable: p.billable,
        rate: p.rate,
        currency: p.currency,
        rtClientId: p.rtClientId,
        rtClientName: p.rtClientName,
        totalSeconds,
        entryCount: p.projectTimes.length,
        firstDate: dates[0] ?? null,
        lastDate: dates[dates.length - 1] ?? null,
        linkedProject: p.linkedProject
          ? { id: p.linkedProject.id, name: p.linkedProject.name }
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching RescueTime projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch RescueTime projects" },
      { status: 500 }
    );
  }
}
