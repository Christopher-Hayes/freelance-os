"use server";

import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";
import { isJmapEnabled } from "@/lib/jmap-provider";
import { createSentEmailTools } from "@/lib/jmap-actions";
import { isAnyForgeEnabled, createGitCommitTools } from "@/lib/git-actions";
import { isWebdavEnabled } from "@/lib/webdav-provider";
import { createCalendarSearchTools } from "@/lib/webdav-actions";
import { recordTelemetryStep, finishTelemetryRun, markAiTelemetryFailed } from "@/lib/ai-telemetry";
import {
  type DebugTelemetryOptions,
  PROVIDER_OPTIONS,
  maybeCreateTelemetryRun,
  generateObjectWithTelemetry,
  mergeSessionsForAI,
} from "./shared";

/**
 * Generate autofill suggestions for time entries based on activity sessions.
 * Called from the job processor, not directly by client components.
 */
export async function generateAutofillSuggestions(params: {
  date: string;
  projectIds?: number[];
  debugJobId?: number;
}): Promise<{
  suggestions: Array<{
    action: "create" | "update" | "delete";
    existingEntryId: number | null;
    projectId: number;
    description: string;
    startTime: string;
    endTime: string;
    billable: boolean;
  }>;
  activityCount: number;
  mergedCount: number;
}> {
  const plainDate = Temporal.PlainDate.from(params.date);
  const localTz = Temporal.Now.timeZoneId();

  const startOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("00:00:00"));
  const endOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("23:59:59.999"));

  const startInstant = startOfDay.toZonedDateTime(localTz).toInstant();
  const endInstant = endOfDay.toZonedDateTime(localTz).toInstant();

  const sessions = await prisma.activitySession.findMany({
    where: {
      startTime: {
        gte: new Date(startInstant.toString()),
        lte: new Date(endInstant.toString()),
      },
    },
    orderBy: { startTime: "asc" },
  });

  if (sessions.length === 0) {
    return { suggestions: [], activityCount: 0, mergedCount: 0 };
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

  const sortedByDuration = mergedSessions
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 50);

  // Project eligibility rules based on start/end dates and status:
  // 1. Has both dates → include if autofill date falls within range (ignore status)
  // 2. Has only startDate → include if status is active/on_hold and date is after start
  // 3. Has only endDate → include if status is active/on_hold and date is on or before end
  // 4. No dates at all → fall back to status check
  const dayStart = new Date(startInstant.toString());
  const dayEnd = new Date(endInstant.toString());

  const projectDateFilter = {
    OR: [
      // Both dates set: autofill date within range, status irrelevant
      {
        startDate: { not: null, lte: dayEnd },
        endDate: { not: null, gte: dayStart },
      },
      // Only startDate: must be active/on_hold and project has started
      {
        startDate: { not: null, lte: dayEnd },
        endDate: null,
        status: { in: ["active", "on_hold"] },
      },
      // Only endDate: must be active/on_hold and project hasn't ended
      {
        startDate: null,
        endDate: { not: null, gte: dayStart },
        status: { in: ["active", "on_hold"] },
      },
      // No dates: fall back to status only
      {
        startDate: null,
        endDate: null,
        status: { in: ["active", "on_hold"] },
      },
    ],
  };

  const projects = params.projectIds
    ? await prisma.project.findMany({
        where: {
          id: { in: params.projectIds },
          ...projectDateFilter,
        },
        include: { client: { select: { name: true, email: true } } },
      })
    : await prisma.project.findMany({
        where: projectDateFilter,
        include: { client: { select: { name: true, email: true } } },
      });

  if (projects.length === 0) {
    return { suggestions: [], activityCount: sessions.length, mergedCount: sortedByDuration.length };
  }

  const existingEntries = await prisma.timeEntry.findMany({
    where: {
      startTime: {
        gte: new Date(startInstant.toString()),
        lte: new Date(endInstant.toString()),
      },
    },
    select: {
      id: true,
      projectId: true,
      startTime: true,
      endTime: true,
      description: true,
      billable: true,
    },
  });

  const projectsInfo = projects.map((p) => ({
    id: p.id,
    name: p.name,
    clientDescription: p.clientDescription,
    privateNotes: p.privateNotes,
    clientName: p.client.name,
    clientEmail: p.client.email,
    status: p.status,
    billable: p.billable,
  }));

  const existingEntriesInfo = existingEntries.map((entry) => ({
    id: entry.id,
    projectId: entry.projectId,
    startTime: entry.startTime.toISOString(),
    endTime: entry.endTime.toISOString(),
    description: entry.description,
    billable: entry.billable,
  }));

  const timeEntrySuggestionSchema = z.object({
    action: z.enum(["create", "update", "delete"]),
    existingEntryId: z.number().nullable(),
    projectId: z.number(),
    description: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    billable: z.boolean(),
  });

  const autofillResponseSchema = z.object({
    suggestions: z.array(timeEntrySuggestionSchema),
  });

  const aiModel = await getAiModel();

  const jmapIsEnabled = await isJmapEnabled();
  const gitForgesEnabled = await isAnyForgeEnabled();
  const calendarEnabled = await isWebdavEnabled();

  const basePrompt = `You are a helpful assistant that analyzes computer activity and suggests time entries for project tracking.

Today's date: ${params.date} (in ${localTz} timezone)
UTC time range for this date: ${startInstant.toString()} to ${endInstant.toString()}

Available Projects:
${projectsInfo
  .map(
    (p) =>
      `- ID ${p.id}: ${p.name} (Client: ${p.clientName}, Email: ${p.clientEmail})${p.clientDescription ? `\n  Description: ${p.clientDescription}` : ""}${p.privateNotes ? `\n  Matching hints: ${p.privateNotes}` : ""}${p.billable ? " [Billable]" : " [Non-billable]"}`
  )
  .join("\n")}

${
  existingEntriesInfo.length > 0
    ? `Existing Time Entries (you may keep these as-is, refine them with action="update", or remove them with action="delete"):
${existingEntriesInfo
  .map((e) => {
    const project = projects.find((p) => p.id === e.projectId);
    return `- Entry ID ${e.id}: ${project?.name || `Project ${e.projectId}`} (${e.billable ? "Billable" : "Non-billable"}): ${e.startTime} to ${e.endTime}${e.description ? ` - ${e.description}` : ""}`;
  })
  .join("\n")}

`
    : ""
}Activity Sessions (merged, top by duration):
${sortedByDuration
  .map(
    (s) =>
      `- ${s.appClass}${s.windowTitle ? ` - ${s.windowTitle}` : ""} (${Math.round(s.durationSeconds / 60)} minutes, ${s.startTime} to ${s.endTime})`
  )
  .join("\n")}

Based on these activity sessions, suggest how the day's time entries should look. You can both create missing entries and refine existing ones. Group related activities together into logical work blocks.

Guidelines:
- Match activities to projects based on project name, description, and window titles.
- Include both billable AND non-billable projects.
- Group consecutive work on the same project into single entries. Prefer longer entries over many short ones.
- Use APPROXIMATE timestamps to ensure all work is captured. Bridging gaps of 10-15 minutes okay.
- It's better to over report time than underreport.
- For brand new entries, use action="create" and set existingEntryId to null.
- If an existing entry should be improved, use action="update" and set existingEntryId to that entry's ID.
- If an existing entry is clearly wrong (e.g. attributed to a project that represents a minority of the time while the majority of activity clearly belongs to a different project), use action="delete" and set existingEntryId to that entry's ID, then create a correct entry with action="create".
- Updates may refine timeframe, description, billable flag, and even project when the evidence is strong.
- Prefer action="update" over delete+create when the existing entry is roughly correct. Only delete when the entry is too inaccurate to salvage.
- Treat the final combined set of kept existing entries, updated entries, and new entries as a complete day plan: no overlaps after your changes, and no overlaps among your returned suggestions.
- Only return updates or deletes for entries that should actually change. Do not return unchanged existing entries.
- Ignore casual web browsing unless window titles clearly indicate project work.
- Entries should be at minimum 15 minutes long.
- Keep descriptions concise but informative.`;

  // If no integrations are configured, use simple generateObject
  if (!jmapIsEnabled && !gitForgesEnabled && !calendarEnabled) {
    const { object } = await generateObjectWithTelemetry(
      {
        model: aiModel,
        schema: autofillResponseSchema,
        prompt: basePrompt,
      },
      {
        jobId: params.debugJobId,
        functionId: "ai.autofill.generateObject",
        operation: "generateObject",
        metadata: {
          workflow: "autofill_time_entries",
          hasJmap: false,
          hasGitForges: false,
          hasCalendar: false,
          date: params.date,
        },
        inputPreview: {
          date: params.date,
          projectIds: params.projectIds,
          activityCount: sessions.length,
          mergedCount: sortedByDuration.length,
        },
      }
    );

    return {
      suggestions: object.suggestions,
      activityCount: sessions.length,
      mergedCount: sortedByDuration.length,
    };
  }

  // Build agent tools from all enabled integrations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentTools: Record<string, any> = {};

  if (jmapIsEnabled) {
    const sentEmailTools = await createSentEmailTools(startInstant, endInstant);
    Object.assign(agentTools, sentEmailTools);
  }

  if (gitForgesEnabled) {
    const gitTools = await createGitCommitTools(startInstant, endInstant);
    Object.assign(agentTools, gitTools);
  }

  if (calendarEnabled) {
    const calendarTools = await createCalendarSearchTools(startInstant, endInstant);
    Object.assign(agentTools, calendarTools);
  }

  const agentRunId = params.debugJobId
    ? await maybeCreateTelemetryRun({
        jobId: params.debugJobId,
        functionId: "ai.autofill.agent",
        operation: "generateText",
        metadata: {
          workflow: "autofill_time_entries",
          hasJmap: jmapIsEnabled,
          hasGitForges: gitForgesEnabled,
          hasCalendar: calendarEnabled,
          date: params.date,
        },
        inputPreview: JSON.stringify(
          {
            date: params.date,
            projectIds: params.projectIds,
            activityCount: sessions.length,
            mergedCount: sortedByDuration.length,
          },
          null,
          2
        ),
      })
    : undefined;

  const output = Output.object({
    schema: autofillResponseSchema,
    name: "autofillSuggestions",
    description: "Time entry suggestions derived from activity sessions and additional context.",
  });

  const systemParts = [
    `You are a helpful assistant that analyzes computer activity to suggest time entries for project tracking.`,
    ``,
    `Your process:`,
    `1. Review the activity sessions and available projects`,
  ];

  let stepNum = 2;
  if (jmapIsEnabled) {
    systemParts.push(`${stepNum}. Search the user's sent emails for the day to discover client correspondence`);
    stepNum++;
    systemParts.push(`${stepNum}. For important-looking emails, estimate how long the user spent composing them`);
    stepNum++;
  }
  if (calendarEnabled) {
    systemParts.push(`${stepNum}. Search the user's calendar for meetings and appointments that indicate project work`);
    stepNum++;
  }
  if (gitForgesEnabled) {
    systemParts.push(`${stepNum}. Search the user's git commits across GitHub/GitLab/Codeberg to understand what code was worked on`);
    stepNum++;
    systemParts.push(`${stepNum}. Match repository names and commit messages to projects`);
    stepNum++;
  }
  systemParts.push(`${stepNum}. Combine all data sources to produce comprehensive time entry suggestions, including updates to existing entries when helpful`);
  systemParts.push(``);
  systemParts.push(`Prefer activity session data as the primary source for time entry timestamps.`);
  systemParts.push(`When existing time entries are present, treat them as editable drafts rather than immutable records.`);
  systemParts.push(`Only emit action="update" for entries that materially improve the day's record.`);
  systemParts.push(`Use action="delete" (with existingEntryId set) when an existing entry is attributed to the wrong project and is too inaccurate to salvage — then emit a separate action="create" for the correct entry. Prefer update over delete+create when the entry is roughly correct.`);

  if (jmapIsEnabled) {
    systemParts.push(``, `Email strategy:`);
    systemParts.push(`- First, search all sent emails for the day to see who the user corresponded with`);
    systemParts.push(`- Match sent emails to projects by comparing recipient addresses with client emails`);
    systemParts.push(`- Use estimateEmailTime to gauge composition effort for significant emails.`);
  }

  if (calendarEnabled) {
    systemParts.push(``, `Calendar strategy:`);
    systemParts.push(`- Search calendar events for the day to discover meetings and scheduled work`);
    systemParts.push(`- Match event titles, attendees, and descriptions to projects and clients`);
    systemParts.push(`- Client meetings should be attributed to the corresponding project`);
    systemParts.push(`- Use event duration as strong evidence for time spent on that project`);
    systemParts.push(`- Meeting descriptions and attendee lists help identify the correct project`);
  }

  if (gitForgesEnabled) {
    systemParts.push(``, `Git commit strategy:`);
    systemParts.push(`- When calling searchGitCommits, always pass the exact startTime and endTime for the current analysis window`);
    systemParts.push(`- Search for all commits the user made during that window`);
    systemParts.push(`- Match repository names to projects using project names, descriptions, and matching hints`);
    systemParts.push(`- Use commit messages to write more specific time entry descriptions`);
    systemParts.push(`- If a repo filter would help narrow results, use it`);
  }

  let result;
  try {
    result = await generateText({
      model: aiModel,
      tools: agentTools,
      stopWhen: stepCountIs(15),
      output,
      providerOptions: PROVIDER_OPTIONS,
      system: systemParts.join("\n"),
      prompt: basePrompt,
      onStepFinish: agentRunId
        ? async (event) => {
            await recordTelemetryStep(agentRunId, event);
          }
        : undefined,
    });

    if (agentRunId) {
      await finishTelemetryRun(agentRunId, result as unknown as Record<string, unknown>);
    }
  } catch (error) {
    if (agentRunId) {
      await markAiTelemetryFailed(agentRunId, error);
    }
    throw error;
  }

  console.log(`Autofill agent used ${result.toolCalls?.length || 0} tool calls`);

  return {
    suggestions: result.output.suggestions,
    activityCount: sessions.length,
    mergedCount: sortedByDuration.length,
  };
}
