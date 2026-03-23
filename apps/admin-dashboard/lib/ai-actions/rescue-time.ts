"use server";

import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { generateObjectWithTelemetry } from "./shared";

/**
 * Use AI to create a new project from a RescueTime project's data.
 *
 * Fetches the RT project and its time statistics, then asks AI to:
 *   - Suggest a clean project name and descriptions
 *   - Match the RT client name to an existing client
 *   - Carry over billable / rate information
 *
 * Returns the newly-created project's id and name.
 */
export async function createProjectFromRescueTime(rtProjectId: number): Promise<{
  projectId: number;
  projectName: string;
  clientId: number;
  clientName: string;
}> {
  const model = await getAiModel();

  const rtProject = await prisma.rescueTimeProject.findUnique({
    where: { rtProjectId },
    include: {
      projectTimes: {
        select: { durationSeconds: true, date: true, comment: true },
      },
    },
  });

  if (!rtProject) {
    throw new Error(`RescueTime project ${rtProjectId} not found`);
  }

  const totalSeconds = rtProject.projectTimes.reduce(
    (sum, t) => sum + t.durationSeconds,
    0
  );
  const sortedDates = rtProject.projectTimes.map((t) => t.date).sort();
  const firstDate = sortedDates[0] ?? null;
  const lastDate = sortedDates[sortedDates.length - 1] ?? null;
  const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

  const sampleComments = rtProject.projectTimes
    .filter((t) => t.comment)
    .slice(0, 20)
    .map((t) => t.comment as string);

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, email: true, company: true },
    orderBy: { name: "asc" },
  });

  if (clients.length === 0) {
    throw new Error(
      "No clients found. Create at least one client before importing a RescueTime project."
    );
  }

  const projectSchema = z.object({
    name: z.string().describe("Clean, professional project name"),
    clientDescription: z
      .string()
      .describe("Client-visible project description (1-2 sentences)"),
    privateNotes: z
      .string()
      .describe(
        "Private matching hints: keywords, repo names, tool names that identify this project in activity data"
      ),
    clientId: z
      .number()
      .describe(
        "ID of the best-matching existing client from the provided list"
      ),
    billable: z.boolean().describe("Whether this project's time is billable"),
    hourlyRate: z
      .number()
      .nullable()
      .describe("Hourly rate in the project's currency, or null if unknown"),
    color: z
      .string()
      .describe(
        "Hex color code for the project (e.g. '#22C55E'). Use the RT color if available, otherwise pick a reasonable default."
      ),
  });

  const clientList = clients
    .map(
      (c) =>
        `  - ID ${c.id}: ${c.name}${c.company ? ` (${c.company})` : ""} <${c.email}>`
    )
    .join("\n");

  const { object } = await generateObjectWithTelemetry({
    model,
    schema: projectSchema,
    prompt: `You are helping a freelancer import a project from their RescueTime time-tracking data into their project management system.

RescueTime project details:
  Name: ${rtProject.name}
  Billable: ${rtProject.billable ?? "unknown"}
  Rate: ${rtProject.rate != null ? `${rtProject.rate} ${rtProject.currency ?? ""}` : "not set"}
  RT client name: ${rtProject.rtClientName ?? "none"}
  Keywords/notes: ${rtProject.notes.length > 0 ? rtProject.notes.join(", ") : "none"}
  Color: ${rtProject.color ?? "none"}
  Archived: ${rtProject.archivedAt ? "yes" : "no"}
  Total tracked: ${totalHours} hours
  Date range: ${firstDate ?? "unknown"} to ${lastDate ?? "unknown"}
${sampleComments.length > 0 ? `  Sample comments: ${sampleComments.slice(0, 5).join(" | ")}` : ""}

Available clients in the system:
${clientList}

Tasks:
1. Choose a clean, professional project name. The RT name "${rtProject.name}" is a good starting point — clean it up if it's cryptic or shorthand.
2. Write a concise client-visible description explaining what the project involves.
3. Write private notes listing keywords, tool names, repo identifiers etc. that would help match future activity sessions to this project. Include the original RT name "${rtProject.name}" as a keyword.
4. Pick the best matching client from the list above. If the RT client name "${rtProject.rtClientName ?? "(none)"}" closely matches one of the clients, prefer that one. Otherwise, pick the most plausible match.
5. Set billable from the RT data (default true if unknown).
6. Set hourlyRate from the RT rate data, or null if not available.
7. Choose a color: use "${rtProject.color ?? "#22C55E"}" if it looks like a valid hex color, otherwise use "#22C55E".`,
  });

  const newProject = await prisma.project.create({
    data: {
      name: object.name,
      clientDescription: object.clientDescription || null,
      privateNotes: object.privateNotes || null,
      clientId: object.clientId,
      status: rtProject.archivedAt ? "completed" : "active",
      color: object.color,
      billable: object.billable,
      hourlyRate: object.hourlyRate ?? null,
      startDate: firstDate ? new Date(firstDate) : null,
      endDate: rtProject.archivedAt ?? (lastDate ? new Date(lastDate) : null),
    },
    include: {
      client: { select: { name: true } },
    },
  });

  return {
    projectId: newProject.id,
    projectName: newProject.name,
    clientId: newProject.clientId,
    clientName: newProject.client.name,
  };
}
