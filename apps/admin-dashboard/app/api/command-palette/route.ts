import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth } from "@/lib/auth";
import {
  COMMAND_PALETTE_ACTIONS,
  COMMAND_PALETTE_PAGES,
  filterAndRankCommandPaletteItems,
  type CommandPaletteItem,
} from "@/lib/command-palette";

const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const [clients, projects] = await Promise.all([
      prisma.client.findMany({
        orderBy: { name: "asc" },
        take: 100,
        select: {
          id: true,
          name: true,
          email: true,
          company: true,
          _count: {
            select: {
              projects: true,
            },
          },
        },
      }),
      prisma.project.findMany({
        orderBy: { updatedAt: "desc" },
        take: 150,
        select: {
          id: true,
          name: true,
          status: true,
          client: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const clientItems: CommandPaletteItem[] = clients.map((client) => ({
      id: `client-${client.id}`,
      title: client.name,
      subtitle: client.company
        ? `${client.company} · ${client.email}`
        : `${client.email} · ${client._count.projects} project${client._count.projects === 1 ? "" : "s"}`,
      href: `/clients/${client.id}`,
      category: "client",
      priority: 76,
      keywords: [client.name, client.email, client.company ?? "", "client", "customer"],
      metadata: {
        clientId: client.id,
      },
    }));

    const projectItems: CommandPaletteItem[] = projects.map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      subtitle: `${project.client.name} · ${project.status}`,
      href: `/projects/${project.id}`,
      category: "project",
      priority: 74,
      keywords: [project.name, project.client.name, project.status, "project"],
      metadata: {
        projectId: project.id,
        clientId: project.client.id,
      },
    }));

    const rankedItems = filterAndRankCommandPaletteItems(
      [...COMMAND_PALETTE_PAGES, ...clientItems, ...projectItems, ...COMMAND_PALETTE_ACTIONS],
      query,
      limit
    );

    return NextResponse.json({
      query,
      items: rankedItems,
    });
  } catch (error) {
    console.error("Error building command palette results:", error);
    return NextResponse.json({ error: "Failed to load command palette results" }, { status: 500 });
  }
}
