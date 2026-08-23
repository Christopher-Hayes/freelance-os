"use server";

import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";
import {
  type DebugTelemetryOptions,
  generateTextWithTelemetry,
  mergeSessionsForAI,
  formatSessionsForPrompt,
} from "./shared";

/**
 * Generate description for a single time entry based on overlapping activity sessions.
 * Called directly from the TimeEntryCreationDialog component.
 */
export async function generateTimeEntryDescription(
  params: {
    projectId: number;
    startTime: string; // ISO timestamp (Instant format)
    endTime: string;   // ISO timestamp (Instant format)
  },
  telemetry?: DebugTelemetryOptions
): Promise<string> {
  const model = await getAiModel();

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      name: true,
      clientDescription: true,
      privateNotes: true,
      client: { select: { name: true } },
    },
  });

  if (!project) {
    throw new Error(`Project ${params.projectId} not found`);
  }

  const startInstant = Temporal.Instant.from(params.startTime);
  const endInstant = Temporal.Instant.from(params.endTime);

  const sessions = await prisma.activitySession.findMany({
    where: {
      OR: [
        {
          startTime: {
            gte: new Date(startInstant.epochMilliseconds),
            lt: new Date(endInstant.epochMilliseconds),
          },
        },
        {
          endTime: {
            gt: new Date(startInstant.epochMilliseconds),
            lte: new Date(endInstant.epochMilliseconds),
          },
        },
        {
          startTime: { lte: new Date(startInstant.epochMilliseconds) },
          endTime: { gte: new Date(endInstant.epochMilliseconds) },
        },
      ],
    },
    orderBy: { startTime: "asc" },
  });

  if (sessions.length === 0) {
    return "Work on project";
  }

  const mergedSessions = mergeSessionsForAI(
    sessions.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      appClass: s.appClass,
      windowTitle: s.windowTitle,
      durationSeconds: s.durationSeconds,
    }))
  );

  let projectContext = `Project: ${project.name}`;
  projectContext += `\nClient: ${project.client.name}`;
  if (project.clientDescription) {
    projectContext += `\nProject Description: ${project.clientDescription}`;
  }
  if (project.privateNotes) {
    projectContext += `\nMatching hints: ${project.privateNotes}`;
  }

  const { text } = await generateTextWithTelemetry(
    {
      model,
      prompt: `You are a helpful assistant that analyzes computer activity and generates concise descriptions for time entries.

${projectContext}

Time Entry Period: ${params.startTime} to ${params.endTime}

Activity during this period (each "•" is a site/repo with its total time inside that app session):
${formatSessionsForPrompt(mergedSessions, { charBudget: 4000 })}

Based on these activity sessions, generate a SINGLE, concise description (5-10 words) for what was worked on during this time entry.

Guidelines:
- Be specific about what was accomplished or worked on
- Use professional, client-friendly language
- Focus on the most significant activities by duration, using the per-site totals rather than the number of visits
- Avoid generic phrases like "worked on project" or "coding"
- If window titles indicate specific features or tasks, mention them
- Keep it brief and actionable
- Do not use first person ("I did X"), just describe the work

Provide ONLY the description text, no preamble or explanation.`,
    },
    telemetry
      ? {
          ...telemetry,
          inputPreview: params,
        }
      : undefined
  );

  return text.trim();
}
