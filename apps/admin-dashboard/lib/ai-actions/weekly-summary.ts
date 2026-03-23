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
    const { text } = await generateTextWithTelemetry(
      {
        model,
        system: `You are writing a professional weekly summary for a client invoice.

Your goal is to create a concise 1-2 sentence summary of the work accomplished this week.

Guidelines:
- Use client-friendly, professional language (avoid technical jargon or shorthand)
- Focus on outcomes and deliverables, not just activities
- Be specific about what was accomplished
- Do not sound like you're bragging or overselling, just state the facts
- Write in past tense, do not say "I did" or "we did", just describe the work
- Do not include the total hours (that's shown separately)
- Do not use bullet points, write in paragraph form
- If project timeline is provided, consider where this week falls in the overall project progress

Provide ONLY the summary text, no preamble or explanation.`,
        prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map((e) => `- ${e.date}: ${e.description || "Work on project"} (${e.hours.toFixed(1)}h)`).join("\n")}

Generate the weekly summary now:`,
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
    instructions: `You are a professional assistant creating client-friendly weekly summaries for invoices.

Your process:
1. Analyze the time entries to understand what work was done this week
2. Determine if the entries are vague/generic and would benefit from additional context
3. If yes, intelligently search for context using the available tools
4. Use the gathered context to write a specific, outcome-focused summary

When to search for context:
- Time entries are vague (e.g., "worked on project", "bug fixes")
- Specific features/deliverables are mentioned that might have email discussions or commits
- Client communications or commit messages would clarify what was accomplished
${
  jmapIsEnabled
    ? `
Email search strategy:
- Search for project name, client name, or specific features mentioned
- You can search multiple times with different keywords if needed
- Don't over-search if entries are already clear`
    : ""
}
${
  calendarEnabled
    ? `
Calendar strategy:
- Search for meetings and events related to this project during the week
- Meeting titles and attendees help identify client-facing work
- Include meeting context in the summary when it adds value (e.g. "discussed X with client")`
    : ""
}
${
  gitForgesEnabled
    ? `
Git commit strategy:
- When calling searchGitCommits, always pass the exact weekly startTime and endTime for this summary window
- Search for commits to find specific code changes related to this project
- Use repo filter to narrow results to the relevant project repository
- Commit messages can provide specific details about what was implemented`
    : ""
}

Summary writing guidelines:
- Client-friendly, professional language (avoid jargon)
- Focus on outcomes and deliverables
- Be specific about accomplishments
- Write in past tense, describe work objectively
- 1-2 sentences, no bullet points
- Use email context to enrich with specific deliverables discussed

Always end by providing your final summary as plain text.`,
  });

  const result = await summaryAgent.generate({
    prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map((e) => `- ${e.date}: ${e.description || "Work on project"} (${e.hours.toFixed(1)}h)`).join("\n")}

Please analyze these entries, search for additional context if helpful, then provide the final weekly summary.`,
  });

  console.log(`Generated summary with ${result.toolCalls?.length || 0} tool calls`);

  return result.text.trim();
}
