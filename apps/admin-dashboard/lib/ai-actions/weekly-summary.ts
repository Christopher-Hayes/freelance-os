"use server";

import { ToolLoopAgent as Agent, stepCountIs } from "ai";
import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";
import { isJmapEnabled } from "@/lib/jmap-provider";
import { createEmailSearchTools } from "@/lib/jmap-actions";
import { isAnyForgeEnabled, createGitCommitTools } from "@/lib/git-actions";
import { isWebdavEnabled } from "@/lib/webdav-provider";
import { createCalendarSearchTools } from "@/lib/webdav-actions";
import {
  type DebugTelemetryOptions,
  PROVIDER_OPTIONS,
  generateTextWithTelemetry,
} from "./shared";

/**
 * Generate a client-friendly weekly summary based on time entry descriptions.
 * Uses an AI agent with JMAP/git/calendar tools for intelligent context gathering.
 */
export async function generateWeeklySummary(
  params: {
    projectId: number;
    weekStart: string; // ISO date string (YYYY-MM-DD)
    weekEnd: string;   // ISO date string (YYYY-MM-DD)
    entries: Array<{
      date: string;
      description: string | null;
      hours: number;
    }>;
    existingSummary?: string; // When provided, AI improves the existing summary instead of writing from scratch
  },
  telemetry?: DebugTelemetryOptions
): Promise<string> {
  const model = await getAiModel();

  const weekStart = Temporal.PlainDate.from(params.weekStart);
  const weekEnd = Temporal.PlainDate.from(params.weekEnd);

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      name: true,
      clientDescription: true,
      privateNotes: true,
      startDate: true,
      endDate: true,
      client: { select: { name: true, email: true } },
    },
  });

  if (!project) {
    throw new Error(`Project ${params.projectId} not found`);
  }

  const totalHours = params.entries.reduce((sum, e) => sum + e.hours, 0);

  let projectContext = `Project: ${project.name}`;
  projectContext += `\nClient: ${project.client.name} (${project.client.email})`;
  if (project.clientDescription) {
    projectContext += `\nProject Description: ${project.clientDescription}`;
  }
  if (project.privateNotes) {
    projectContext += `\nInternal Notes: ${project.privateNotes}`;
  }
  if (project.startDate || project.endDate) {
    projectContext += `\nProject Timeline:`;
    if (project.startDate) {
      projectContext += ` Started ${project.startDate.toISOString().split("T")[0]}`;
    }
    if (project.endDate) {
      projectContext += `${project.startDate ? "," : ""} Due ${project.endDate.toISOString().split("T")[0]}`;
    }
  }

  const jmapIsEnabled = await isJmapEnabled();
  const gitForgesEnabled = await isAnyForgeEnabled();
  const calendarEnabled = await isWebdavEnabled();

  const localTz = Temporal.Now.timeZoneId();
  const weekStartInstant = weekStart
    .toPlainDateTime(Temporal.PlainTime.from("00:00:00"))
    .toZonedDateTime(localTz)
    .toInstant();
  const weekEndInstant = weekEnd
    .toPlainDateTime(Temporal.PlainTime.from("23:59:59"))
    .toZonedDateTime(localTz)
    .toInstant();

  if (!jmapIsEnabled && !gitForgesEnabled && !calendarEnabled) {
    const improveSuffix = params.existingSummary
      ? `\n\nExisting Summary (improve this — add more detail, make it more specific, but preserve the overall structure and any accurate information):\n${params.existingSummary}`
      : '';

    const { text } = await generateTextWithTelemetry(
      {
        model,
        system: params.existingSummary
          ? `You are improving an existing weekly summary for a client invoice. Make it more specific and detailed using the time entry data, while preserving accurate information that's already there. Output short markdown: a brief overview followed by a few bullet points of specific work done. No more than 3 bullet points, keep the bullets concise. Bold important points. No total hours. Output only the summary.`
          : `You are writing a weekly summary for a client invoice. Output short markdown: a brief overview followed by a few bullet points of specific work done. Be specific and outcome-focused. No more than 3 bullet points, keep the bullets concise. Bold important points. No total hours. Output only the summary.`,
        prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map((e) => `- ${e.date}: ${e.description || "Work on project"} (${e.hours.toFixed(1)}h)`).join("\n")}
${improveSuffix}
`,
      },
      telemetry
        ? {
            ...telemetry,
            inputPreview: {
              projectId: params.projectId,
              weekStart: params.weekStart,
              weekEnd: params.weekEnd,
              entryCount: params.entries.length,
            },
          }
        : undefined
    );

    return text.trim();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryAgentTools: Record<string, any> = {};

  if (jmapIsEnabled) {
    const emailTools = await createEmailSearchTools(weekStartInstant, weekEndInstant);
    Object.assign(summaryAgentTools, emailTools);
  }

  if (gitForgesEnabled) {
    const gitTools = await createGitCommitTools(weekStartInstant, weekEndInstant);
    Object.assign(summaryAgentTools, gitTools);
  }

  if (calendarEnabled) {
    const calendarTools = await createCalendarSearchTools(weekStartInstant, weekEndInstant);
    Object.assign(summaryAgentTools, calendarTools);
  }

  const summaryAgent = new Agent({
    model: model,
    stopWhen: stepCountIs(10),
    tools: summaryAgentTools,
    providerOptions: PROVIDER_OPTIONS,
    instructions: params.existingSummary
      ? `You are improving an existing weekly summary for a client invoice. Use the available tools to gather additional context that could make it more specific, then rewrite with improvements while preserving accurate information.
${
  gitForgesEnabled
    ? `\nWhen calling searchGitCommits, always pass the exact weekly startTime and endTime for this summary window.`
    : ""
}
Output short markdown: a brief overview followed by a few specific bullet points. No total hours. Output only the summary.`
      : `You are writing a weekly summary for a client invoice. If the time entries are vague, use the available tools to find more specific context (emails, commits, calendar events), then write the summary.
${
  gitForgesEnabled
    ? `\nWhen calling searchGitCommits, always pass the exact weekly startTime and endTime for this summary window.`
    : ""
}
Output short markdown: a brief overview followed by a few specific bullet points. No total hours. Output only the summary.`,
  });

  const agentImproveSuffix = params.existingSummary
    ? `\n\nExisting Summary (improve this — add more detail, make it more specific, but preserve accurate information):\n${params.existingSummary}`
    : '';

  const result = await summaryAgent.generate({
    prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map((e) => `- ${e.date}: ${e.description || "Work on project"} (${e.hours.toFixed(1)}h)`).join("\n")}
${agentImproveSuffix}
`,
  });

  console.log(`Generated summary with ${result.toolCalls?.length || 0} tool calls`);

  return result.text.trim();
}
