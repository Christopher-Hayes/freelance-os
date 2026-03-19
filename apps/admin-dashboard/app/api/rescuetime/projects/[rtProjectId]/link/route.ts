import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// POST /api/rescuetime/projects/[rtProjectId]/link
// Body: { projectId: number } — links the RT project to an app project
// Body: {} or { projectId: null } — removes the link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rtProjectId: string }> }
) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "write:projects")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { rtProjectId: rtProjectIdStr } = await params;
    const rtProjectId = parseInt(rtProjectIdStr);

    if (isNaN(rtProjectId)) {
      return NextResponse.json({ error: "Invalid RT project ID" }, { status: 400 });
    }

    const body = await request.json();
    const projectId: number | null = body.projectId ?? null;

    // Verify the RT project exists
    const rtProject = await prisma.rescueTimeProject.findUnique({
      where: { rtProjectId },
    });

    if (!rtProject) {
      return NextResponse.json({ error: "RescueTime project not found" }, { status: 404 });
    }

    if (projectId !== null) {
      // Verify the target app project exists
      const appProject = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, linkedRtProjectId: true },
      });

      if (!appProject) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      // If the app project is already linked to a different RT project, refuse
      if (
        appProject.linkedRtProjectId !== null &&
        appProject.linkedRtProjectId !== rtProjectId
      ) {
        return NextResponse.json(
          { error: `"${appProject.name}" is already linked to a different RescueTime project.` },
          { status: 409 }
        );
      }

      // Link: set linkedRtProjectId on the app project
      await prisma.project.update({
        where: { id: projectId },
        data: { linkedRtProjectId: rtProjectId },
      });
    } else {
      // Unlink: clear any app project that references this RT project
      await prisma.project.updateMany({
        where: { linkedRtProjectId: rtProjectId },
        data: { linkedRtProjectId: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error linking RescueTime project:", error);
    return NextResponse.json(
      { error: "Failed to update link" },
      { status: 500 }
    );
  }
}
