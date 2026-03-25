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
          ? `You are improving an existing weekly summary for a client invoice.

Your goal is to take the current summary and make it better — more specific, more detailed, and more useful — while preserving accurate information that's already there.

How to improve:
- Add more specific details from the time entries (e.g. specific features, components, or tasks)
- Make vague bullets more concrete and outcome-focused
- Improve clarity and readability
- Fix any inaccuracies based on the time entry data
- Keep the same general structure unless reorganizing improves readability

Format:
- Start with a single-sentence overview paragraph summarizing the week at a high level
- Follow with a short bullet list of specific items worked on or delivered
- Each bullet should be one concise line — not a full paragraph
- Keep the total summary short (overview sentence + 1-3 bullets is ideal)
- Use markdown formatting for readability (e.g. bold for key deliverables, links if relevant, etc.)

Tone and style:
- Professional but direct — assume the client is familiar with the project and doesn't need hand-holding
- Focus on what was accomplished, not the process
- Do not sound like marketing copy or a sales pitch — just state what happened
- Write in past tense, do not say "I" or "we", just describe the work
- Do not include the total hours (that's shown separately)
- Use standard technical terms where appropriate — no need to over-explain

Provide ONLY the improved markdown summary text, no preamble or explanation.`
          : `You are writing a professional weekly summary for a client invoice.

Your goal is to create a concise, scannable summary of the work accomplished this week using markdown.

Format:
- Start with a single-sentence overview paragraph summarizing the week at a high level
- Follow with a short bullet list of specific items worked on or delivered
- Each bullet should be one concise line — not a full paragraph
- Keep the total summary short (overview sentence + 1-3 bullets is ideal)
- Use markdown formatting for readability (e.g. bold for key deliverables, links if relevant, etc.)

Tone and style:
- Professional but direct — assume the client is familiar with the project and doesn't need hand-holding
- Focus on what was accomplished, not the process
- Do not sound like marketing copy or a sales pitch — just state what happened
- Write in past tense, do not say "I" or "we", just describe the work
- Do not include the total hours (that's shown separately)
- Use standard technical terms where appropriate — no need to over-explain

Provide ONLY the markdown summary text, no preamble or explanation.`,
        prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map((e) => `- ${e.date}: ${e.description || "Work on project"} (${e.hours.toFixed(1)}h)`).join("\n")}
${improveSuffix}

${params.existingSummary ? 'Improve the existing summary now:' : 'Generate the weekly summary now:'}`,
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
      ? `You are a professional assistant improving an existing weekly summary for a client invoice.

Your process:
1. Read the existing summary and the time entries to understand the current state
2. Identify areas where the summary could be more specific, detailed, or accurate
3. Use the available tools to gather additional context that could enrich the summary
4. Rewrite the summary with improvements while preserving accurate information

When to search for context:
- The existing summary is vague and could benefit from specifics
- Time entries mention features/tasks that the summary doesn't cover well
- Additional context from emails, commits, or calendar would make it more detailed
${
  jmapIsEnabled
    ? `
Email search strategy:
- Search for project name, client name, or specific features mentioned
- You can search multiple times with different keywords if needed
- Don't over-search if the summary is already detailed`
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

How to improve:
- Add more specific details from time entries and gathered context
- Make vague bullets more concrete and outcome-focused
- Improve clarity and readability
- Fix any inaccuracies based on the data
- Keep the same general structure unless reorganizing improves readability

Summary format (markdown):
- Start with a single-sentence overview paragraph summarizing the week at a high level
- Follow with 1-3 very short bullet points of specific items worked on or delivered.
- Each bullet should be one concise line — 10 words or less, not a full sentence.
- Keep the total summary short (overview sentence + 1-3 bullets is ideal)

Tone and style:
- Professional but direct — assume the client is familiar with the project
- Focus on what was accomplished, not the process
- No marketing copy or sales-pitch tone — just state what happened
- Write in past tense, describe work objectively
- Do not include total hours (shown separately)
- Use standard technical terms where appropriate
- Provide your summary in markdown format for skimable readability (e.g. bold for key deliverables, links if relevant, etc.)

Provide ONLY the improved markdown summary text, no preamble or explanation.`
      : `You are a professional assistant creating client-friendly weekly summaries for invoices.

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

Summary format (markdown):
- Start with a single-sentence overview paragraph summarizing the week at a high level
- Follow with 1-3 very short bullet points of specific items worked on or delivered.
- Each bullet should be one concise line — 10 words or less, not a full sentence.
- Keep the total summary short (overview sentence + 1-3 bullets is ideal)

Tone and style:
- Professional but direct — assume the client is familiar with the project
- Focus on what was accomplished, not the process
- No marketing copy or sales-pitch tone — just state what happened
- Write in past tense, describe work objectively
- Do not include total hours (shown separately)
- Use standard technical terms where appropriate
- Provider your summary in markdown format for skimable readability (e.g. bold for key deliverables, links if relevant, etc.)`,
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

${params.existingSummary ? 'Please search for additional context, then improve the existing summary.' : 'Please analyze these entries, search for additional context if helpful, then provide the final weekly summary.'}`,
  });

  console.log(`Generated summary with ${result.toolCalls?.length || 0} tool calls`);

  return result.text.trim();
}
