"use server";

import {
  generateText,
  ToolLoopAgent as Agent,
  Output,
  stepCountIs,
} from "ai";
import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";
import { headers } from 'next/headers';
import { isJmapEnabled } from "@/lib/jmap-provider";
import { createEmailSearchTools, createSentEmailTools } from "@/lib/jmap-actions";
import { isAnyForgeEnabled, createGitCommitTools } from "@/lib/git-actions";
import {
  createTelemetryRun,
  recordTelemetryStep,
  finishTelemetryRun,
  markAiTelemetryFailed,
} from "@/lib/ai-telemetry";

type DebugTelemetryOptions = {
  jobId?: number;
  functionId: string;
  metadata?: Record<string, unknown>;
  inputPreview?: unknown;
  operation?: string;
};

const PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: "medium", // 'minimal' | 'low' | 'medium' | 'high'
  },
  google: {
    reasoningEffort: "medium", // 'minimal' | 'low' | 'medium' | 'high'
  },
}

/**
 * Create a telemetry run (if a jobId is provided) and return the runId.
 * Returns undefined when telemetry is not requested.
 */
async function maybeCreateTelemetryRun(
  telemetry?: DebugTelemetryOptions
): Promise<number | undefined> {
  if (!telemetry?.jobId) return undefined;

  return createTelemetryRun({
    jobId: telemetry.jobId,
    functionId: telemetry.functionId,
    operation: telemetry.operation,
    metadata: telemetry.metadata,
    inputPreview:
      typeof telemetry.inputPreview === "string"
        ? telemetry.inputPreview
        : JSON.stringify(telemetry.inputPreview, null, 2),
  });
}

async function generateTextWithTelemetry(
  params: Parameters<typeof generateText>[0],
  telemetry?: DebugTelemetryOptions
) {
  const runId = await maybeCreateTelemetryRun(telemetry);

  try {
    const result = await generateText({
      ...params,
      // Wire the SDK's native onStepFinish callback to record each step
      onStepFinish: runId
        ? async (event) => {
          await recordTelemetryStep(runId, event);
        }
        : params.onStepFinish,
    });

    // After completion, record summary from the result object
    if (runId) {
      await finishTelemetryRun(runId, result as unknown as Record<string, unknown>);
    }

    return result;
  } catch (error) {
    if (runId) {
      await markAiTelemetryFailed(runId, error);
    }
    throw error;
  }
}

async function generateObjectWithTelemetry<TSchema extends z.ZodTypeAny>(
  params: {
    model: Awaited<ReturnType<typeof getAiModel>>;
    schema: TSchema;
    prompt: string;
  },
  telemetry?: DebugTelemetryOptions
): Promise<{ object: z.infer<TSchema> }> {
  const runId = await maybeCreateTelemetryRun(telemetry);

  try {
    const result = await generateText({
      model: params.model,
      output: Output.object({ schema: params.schema }),
      prompt: params.prompt,
      providerOptions: PROVIDER_OPTIONS,
      // Wire onStepFinish so structured-output calls also record steps
      onStepFinish: runId
        ? async (event) => {
          await recordTelemetryStep(runId, event);
        }
        : undefined,
    });

    if (runId) {
      await finishTelemetryRun(runId, result as unknown as Record<string, unknown>);
    }

    return { object: result.output as z.infer<TSchema> };
  } catch (error) {
    if (runId) {
      await markAiTelemetryFailed(runId, error);
    }
    throw error;
  }
}

/**
 * Generate code snippet for API endpoint using AI
 */
export async function generateCode(endpoint: {
  method: string;
  path: string;
  description: string;
  queryParams?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
  body?: string;
}, language: string, telemetry?: DebugTelemetryOptions): Promise<string> {
  const model = await getAiModel();
  const origin = (await headers()).get("origin") || "http://localhost:3010";

  const languageMap: Record<string, string> = {
    "curl": "cURL",
    "javascript-fetch": "JavaScript using fetch API",
    "javascript-axios": "JavaScript using axios library",
    "python-requests": "Python using requests library",
    "python-httpx": "Python using httpx library",
    "go": "Go using net/http package",
    "php": "PHP using Guzzle library",
    "ruby": "Ruby using net/http",
  };

  const fullLanguage = languageMap[language] || language;

  // Build the prompt for code generation
  let prompt = `Generate a ${fullLanguage} code snippet for the following API endpoint:\n
Method: ${endpoint.method}
Path: ${endpoint.path}
Description: ${endpoint.description}\n\n`;

  if (endpoint.queryParams && endpoint.queryParams.length > 0) {
    prompt += `Query Parameters:\n`;
    endpoint.queryParams.forEach((param: any) => {
      prompt += `- ${param.name} (${param.type})${param.required ? " [required]" : ""}: ${param.description || ""}\n`;
    });
    prompt += "\n";
  }

  if (endpoint.body) {
    prompt += `Request Body Example:\n${endpoint.body}\n\n`;
  }

  prompt += `Requirements:\n
Generate ONLY the code, no explanations or markdown formatting. Just raw code ready to copy-paste.
Keep it concise and to the point.
Include authentication header placeholder (Bearer token).
Use ONLY the query parameters listed above - DO NOT fabricate or add additional query parameters.
Prefer working example values for query parameters and body over placeholders.
Use the full URL: ${origin}${endpoint.path}`;

  const { text } = await generateTextWithTelemetry({
    model,
    prompt,
  }, telemetry ? {
    ...telemetry,
    inputPreview: { endpoint, language },
  } : undefined);

  return text.trim();
}

/**
 * Generate autofill suggestions for time entries based on activity sessions
 * This is called from the job processor, not directly by client components
 */
export async function generateAutofillSuggestions(params: {
  date: string;
  projectIds?: number[];
  debugJobId?: number;
}): Promise<{
  suggestions: Array<{
    projectId: number;
    description: string;
    startTime: string;
    endTime: string;
    billable: boolean;
  }>;
  activityCount: number;
  mergedCount: number;
}> {
  // Parse the date and convert to local timezone boundaries
  const plainDate = Temporal.PlainDate.from(params.date);
  const localTz = Temporal.Now.timeZoneId();

  // Create start of day (00:00:00) and end of day (23:59:59.999) in local timezone
  const startOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("00:00:00"));
  const endOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("23:59:59.999"));

  // Convert to ZonedDateTime in local timezone, then to Instant (UTC) for database query
  const startInstant = startOfDay.toZonedDateTime(localTz).toInstant();
  const endInstant = endOfDay.toZonedDateTime(localTz).toInstant();

  // Fetch activity sessions for the day
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
    return {
      suggestions: [],
      activityCount: 0,
      mergedCount: 0,
    };
  }

  // Merge sessions to reduce data volume
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

  // Limit to top 50 by duration
  const sortedByDuration = mergedSessions
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 50);

  // Fetch projects
  const projects = params.projectIds
    ? await prisma.project.findMany({
      where: {
        id: { in: params.projectIds },
        status: { in: ["active", "on_hold"] },
      },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })
    : await prisma.project.findMany({
      where: {
        status: { in: ["active", "on_hold"] },
      },
      include: {
        client: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

  if (projects.length === 0) {
    return {
      suggestions: [],
      activityCount: sessions.length,
      mergedCount: sortedByDuration.length,
    };
  }

  // Fetch existing time entries for the day to avoid overlaps
  const existingEntries = await prisma.timeEntry.findMany({
    where: {
      startTime: {
        gte: new Date(startInstant.toString()),
        lte: new Date(endInstant.toString()),
      },
    },
    select: {
      projectId: true,
      startTime: true,
      endTime: true,
      description: true,
    },
  });

  // Prepare data for AI
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
    projectId: entry.projectId,
    startTime: entry.startTime.toISOString(),
    endTime: entry.endTime.toISOString(),
    description: entry.description,
  }));

  // Generate suggestions using AI
  const timeEntrySuggestionSchema = z.object({
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

  // Check if JMAP is available for sent email analysis
  const jmapIsEnabled = await isJmapEnabled();
  // Check if any git forge (GitHub, GitLab, Codeberg) is configured
  const gitForgesEnabled = await isAnyForgeEnabled();

  const basePrompt = `You are a helpful assistant that analyzes computer activity and suggests time entries for project tracking.

Today's date: ${params.date} (in ${localTz} timezone)
UTC time range for this date: ${startInstant.toString()} to ${endInstant.toString()}

Available Projects:
${projectsInfo.map((p) => `- ID ${p.id}: ${p.name} (Client: ${p.clientName}, Email: ${p.clientEmail})${p.clientDescription ? `\n  Description: ${p.clientDescription}` : ''}${p.privateNotes ? `\n  Matching hints: ${p.privateNotes}` : ''}${p.billable ? ' [Billable]' : ' [Non-billable]'}`).join("\n")}

${existingEntriesInfo.length > 0 ? `Existing Time Entries (DO NOT OVERLAP WITH THESE):
${existingEntriesInfo.map((e) => {
    const project = projects.find((p) => p.id === e.projectId);
    return `- ${project?.name || `Project ${e.projectId}`}: ${e.startTime} to ${e.endTime}${e.description ? ` - ${e.description}` : ''}`;
  }).join("\n")}

` : ''}Activity Sessions (merged, top by duration):
${sortedByDuration
      .map(
        (s) => `- ${s.appClass}${s.windowTitle ? ` - ${s.windowTitle}` : ""} (${Math.round(s.durationSeconds / 60)} minutes, ${s.startTime} to ${s.endTime})`
      )
      .join("\n")}

Based on these activity sessions, suggest time entries that should be created for work. Group related activities together into logical work blocks.

Guidelines:
- Match activities to projects based on project name, description, and window titles.
- Include both billable AND non-billable projects.
- Group consecutive work on the same project into single entries. Prefer longer entries over many short ones.
- Use APPROXIMATE timestamps to ensure all work is captured. Bridging gaps of 10-15 minutes okay.
- It's better to over report time than underreport.
- DO NOT create any entries that overlap with the existing time entries, and do not have your entries overlap each other.
- Ignore casual web browsing unless window titles clearly indicate project work.
- Entries should be at minimum 15 minutes long.
- Keep descriptions concise but informative.`;

  // If neither JMAP nor git forges are configured, use simple generateObject
  if (!jmapIsEnabled && !gitForgesEnabled) {
    const { object } = await generateObjectWithTelemetry({
      model: aiModel,
      schema: autofillResponseSchema,
      prompt: basePrompt,
    }, {
      jobId: params.debugJobId,
      functionId: "ai.autofill.generateObject",
      operation: "generateObject",
      metadata: {
        workflow: "autofill_time_entries",
        hasJmap: false,
        hasGitForges: false,
        date: params.date,
      },
      inputPreview: {
        date: params.date,
        projectIds: params.projectIds,
        activityCount: sessions.length,
        mergedCount: sortedByDuration.length,
      },
    });

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

  // Create telemetry run for the agent path
  const agentRunId = params.debugJobId
    ? await maybeCreateTelemetryRun({
      jobId: params.debugJobId,
      functionId: "ai.autofill.agent",
      operation: "generateText",
      metadata: {
        workflow: "autofill_time_entries",
        hasJmap: jmapIsEnabled,
        hasGitForges: gitForgesEnabled,
        date: params.date,
      },
      inputPreview: JSON.stringify({
        date: params.date,
        projectIds: params.projectIds,
        activityCount: sessions.length,
        mergedCount: sortedByDuration.length,
      }, null, 2),
    })
    : undefined;

  const output = Output.object({
    schema: autofillResponseSchema,
    name: "autofillSuggestions",
    description: "Time entry suggestions derived from activity sessions and additional context.",
  });

  // Build system prompt dynamically based on available integrations
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
  if (gitForgesEnabled) {
    systemParts.push(`${stepNum}. Search the user's git commits across GitHub/GitLab/Codeberg to understand what code was worked on`);
    stepNum++;
    systemParts.push(`${stepNum}. Match repository names and commit messages to projects`);
    stepNum++;
  }
  systemParts.push(`${stepNum}. Combine all data sources to produce comprehensive time entry suggestions`);

  systemParts.push(``);
  systemParts.push(`Prefer activity session data as the primary source for time entry timestamps.`);

  if (jmapIsEnabled) {
    systemParts.push(``);
    systemParts.push(`Email strategy:`);
    systemParts.push(`- First, search all sent emails for the day to see who the user corresponded with`);
    systemParts.push(`- Match sent emails to projects by comparing recipient addresses with client emails`);
    systemParts.push(`- Use estimateEmailTime to gauge composition effort for significant emails.`);
  }

  if (gitForgesEnabled) {
    systemParts.push(``);
    systemParts.push(`Git commit strategy:`);
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
      stopWhen: stepCountIs(12),
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

    // Record completion telemetry for the agent run
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

/**
 * Helper function to merge adjacent sessions
 */
type ActivitySessionForAI = {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
  subSessions?: ActivitySessionForAI[];
};

function cloneActivitySessionForAI(session: ActivitySessionForAI): ActivitySessionForAI {
  return {
    id: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    appClass: session.appClass,
    windowTitle: session.windowTitle,
    durationSeconds: session.durationSeconds,
  };
}

function mergeSessionsForAI(sessions: ActivitySessionForAI[]): ActivitySessionForAI[] {
  if (sessions.length === 0) return [];

  const MERGE_GAP_MINUTES = 10;
  const INTERVAL_CHUNK_MINUTES = 15;
  const INTERVAL_BREAKDOWN_THRESHOLD_MINUTES = 30;
  const MAX_DESCRIPTION_LENGTH = 500;

  const sorted = [...sessions].sort((a, b) => {
    const aInstant = Temporal.Instant.from(a.startTime);
    const bInstant = Temporal.Instant.from(b.startTime);
    return Temporal.Instant.compare(aInstant, bInstant);
  });

  const stripTrailingAppName = (title: string) => {
    const lastDash = title.lastIndexOf(" - ");
    if (lastDash > 0) {
      return title.slice(0, lastDash);
    }
    return title;
  };

  const truncateTitle = (title: string) =>
    title.length > MAX_DESCRIPTION_LENGTH
      ? `${title.substring(0, MAX_DESCRIPTION_LENGTH)}...`
      : title;

  const formatIntervalLabel = (instant: Temporal.Instant) => {
    const zdt = instant.toZonedDateTimeISO("UTC");
    const hour = zdt.hour;
    const minute = zdt.minute;
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
  };

  const describeSessionTitles = (session: ActivitySessionForAI) => {
    const subSessions = session.subSessions ?? [session];
    const distinctTitles = Array.from(
      new Set(
        subSessions
          .map((sub) => sub.windowTitle?.trim())
          .filter((title): title is string => Boolean(title))
          .map(stripTrailingAppName)
      )
    );

    if (session.durationSeconds < INTERVAL_BREAKDOWN_THRESHOLD_MINUTES * 60) {
      return truncateTitle(distinctTitles.slice(0, 3).join(" / "));
    }

    const sessionStart = Temporal.Instant.from(session.startTime);
    const sessionEnd = Temporal.Instant.from(session.endTime);
    const chunkSeconds = INTERVAL_CHUNK_MINUTES * 60;
    const intervalSummaries: string[] = [];

    for (
      let intervalStart = sessionStart;
      Temporal.Instant.compare(intervalStart, sessionEnd) < 0;
      intervalStart = intervalStart.add({ minutes: INTERVAL_CHUNK_MINUTES })
    ) {
      const intervalEndCandidate = intervalStart.add({ minutes: INTERVAL_CHUNK_MINUTES });
      const intervalEnd = Temporal.Instant.compare(intervalEndCandidate, sessionEnd) > 0
        ? sessionEnd
        : intervalEndCandidate;

      let bestTitle = "";
      let bestOverlapSeconds = 0;

      for (const sub of subSessions) {
        if (!sub.windowTitle?.trim()) continue;

        const subStart = Temporal.Instant.from(sub.startTime);
        const subEnd = Temporal.Instant.from(sub.endTime);
        const overlapStart = Temporal.Instant.compare(intervalStart, subStart) > 0 ? intervalStart : subStart;
        const overlapEnd = Temporal.Instant.compare(intervalEnd, subEnd) < 0 ? intervalEnd : subEnd;

        if (Temporal.Instant.compare(overlapStart, overlapEnd) >= 0) continue;

        const overlapNs = overlapEnd.epochNanoseconds - overlapStart.epochNanoseconds;
        const overlapSeconds = Number(overlapNs / 1_000_000_000n);

        if (overlapSeconds > bestOverlapSeconds) {
          bestOverlapSeconds = overlapSeconds;
          bestTitle = stripTrailingAppName(sub.windowTitle);
        }
      }

      if (bestTitle && bestOverlapSeconds >= Math.min(chunkSeconds / 3, chunkSeconds)) {
        const label = formatIntervalLabel(intervalStart);
        const summary = `${label}: ${bestTitle}`;
        if (intervalSummaries.at(-1) !== summary) {
          intervalSummaries.push(summary);
        }
      }
    }

    if (intervalSummaries.length > 0) {
      return truncateTitle(intervalSummaries.join(" | "));
    }

    return truncateTitle(distinctTitles.slice(0, 5).join(" / "));
  };

  const merged: ActivitySessionForAI[] = [];

  for (const session of sorted) {
    const currentStart = Temporal.Instant.from(session.startTime);
    const currentEnd = Temporal.Instant.from(session.endTime);

    let existingIndex = -1;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i];
      if (!m) continue;
      if (m.appClass !== session.appClass) continue;

      const mEnd = Temporal.Instant.from(m.endTime);
      const gapNs = currentStart.epochNanoseconds - mEnd.epochNanoseconds;
      const gapMinutes = Number(gapNs) / (1_000_000_000 * 60);

      if (gapMinutes <= MERGE_GAP_MINUTES) {
        existingIndex = i;
        break;
      }
    }

    if (existingIndex >= 0) {
      const existing = merged[existingIndex];
      if (!existing) {
        continue;
      }
      existing.subSessions = existing.subSessions ?? [
        cloneActivitySessionForAI(existing),
      ];
      existing.subSessions.push(cloneActivitySessionForAI(session));
      const existingEnd = Temporal.Instant.from(existing.endTime);

      if (Temporal.Instant.compare(currentEnd, existingEnd) > 0) {
        existing.endTime = session.endTime;
      }

      const existingStart = Temporal.Instant.from(existing.startTime);
      const existingEndInstant = Temporal.Instant.from(existing.endTime);
      const newDurationNs = existingEndInstant.epochNanoseconds - existingStart.epochNanoseconds;
      existing.durationSeconds = Math.floor(Number(newDurationNs) / 1_000_000_000);

      existing.windowTitle = describeSessionTitles(existing);
    } else {
      const truncated: ActivitySessionForAI = {
        ...session,
        subSessions: [
          cloneActivitySessionForAI(session),
        ],
      };
      truncated.windowTitle = truncated.windowTitle
        ? describeSessionTitles(truncated)
        : truncated.windowTitle;
      merged.push(truncated);
    }
  }

  // Remove any sessions shorter than 5 minutes after merging
  return merged.filter((s) => s.durationSeconds >= 300);
}

/**
 * Generate a client-friendly weekly summary based on time entry descriptions
 * Uses an AI agent with JMAP search tools for intelligent email context gathering
 */
export async function generateWeeklySummary(params: {
  projectId: number;
  weekStart: string; // ISO date string (YYYY-MM-DD)
  weekEnd: string;   // ISO date string (YYYY-MM-DD)
  entries: Array<{
    date: string;
    description: string | null;
    hours: number;
  }>;
}, telemetry?: DebugTelemetryOptions): Promise<string> {
  const model = await getAiModel();

  // Convert string dates to Temporal.PlainDate
  const weekStart = Temporal.PlainDate.from(params.weekStart);
  const weekEnd = Temporal.PlainDate.from(params.weekEnd);

  // Fetch project details
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      name: true,
      clientDescription: true,
      privateNotes: true,
      startDate: true,
      endDate: true,
      client: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project ${params.projectId} not found`);
  }

  const totalHours = params.entries.reduce((sum, e) => sum + e.hours, 0);

  // Build project context
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
      projectContext += ` Started ${project.startDate.toISOString().split('T')[0]}`;
    }
    if (project.endDate) {
      projectContext += `${project.startDate ? ',' : ''} Due ${project.endDate.toISOString().split('T')[0]}`;
    }
  }

  // Check if JMAP is available
  const jmapIsEnabled = await isJmapEnabled();
  // Check if any git forge is configured
  const gitForgesEnabled = await isAnyForgeEnabled();

  // Convert dates to Instants for tool scoping
  const weekStartInstant = weekStart.toPlainDateTime(Temporal.PlainTime.from("00:00:00")).toZonedDateTime("UTC").toInstant();
  const weekEndInstant = weekEnd.toPlainDateTime(Temporal.PlainTime.from("23:59:59")).toZonedDateTime("UTC").toInstant();

  if (!jmapIsEnabled && !gitForgesEnabled) {
    // Fallback to simple generation without email context
    const { text } = await generateTextWithTelemetry({
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
${params.entries.map(e => `- ${e.date}: ${e.description || 'Work on project'} (${e.hours.toFixed(1)}h)`).join('\n')}

Generate the weekly summary now:`,
    }, telemetry ? {
      ...telemetry,
      inputPreview: {
        projectId: params.projectId,
        weekStart: params.weekStart,
        weekEnd: params.weekEnd,
        entryCount: params.entries.length,
      },
    } : undefined);

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
${jmapIsEnabled ? `
Email search strategy:
- Search for project name, client name, or specific features mentioned
- You can search multiple times with different keywords if needed
- Don't over-search if entries are already clear` : ''}
${gitForgesEnabled ? `
Git commit strategy:
- When calling searchGitCommits, always pass the exact weekly startTime and endTime for this summary window
- Search for commits to find specific code changes related to this project
- Use repo filter to narrow results to the relevant project repository
- Commit messages can provide specific details about what was implemented` : ''}

Summary writing guidelines:
- Client-friendly, professional language (avoid jargon)
- Focus on outcomes and deliverables
- Be specific about accomplishments
- Write in past tense, describe work objectively
- 1-2 sentences, no bullet points
- Use email context to enrich with specific deliverables discussed

Always end by providing your final summary as plain text.`,
  });

  // Use generateText with tools for intelligent email gathering
  const result = await summaryAgent.generate({
    prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map(e => `- ${e.date}: ${e.description || 'Work on project'} (${e.hours.toFixed(1)}h)`).join('\n')}

Please analyze these entries, search for additional context if helpful, then provide the final weekly summary.`,
  });

  console.log(`Generated summary with ${result.toolCalls?.length || 0} tool calls`);

  return result.text.trim();
}

/**
 * Generate description for a single time entry based on overlapping activities
 * This is called directly from the TimeEntryCreationDialog component
 */
export async function generateTimeEntryDescription(params: {
  projectId: number;
  startTime: string; // ISO timestamp (Instant format)
  endTime: string;   // ISO timestamp (Instant format)
}, telemetry?: DebugTelemetryOptions): Promise<string> {
  const model = await getAiModel();

  // Fetch project details
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      name: true,
      clientDescription: true,
      privateNotes: true,
      client: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project ${params.projectId} not found`);
  }

  // Parse timestamps using Temporal and convert to Date for Prisma
  const startInstant = Temporal.Instant.from(params.startTime);
  const endInstant = Temporal.Instant.from(params.endTime);

  // Fetch activity sessions that overlap with this time entry
  const sessions = await prisma.activitySession.findMany({
    where: {
      OR: [
        // Session starts during the time entry
        {
          startTime: {
            gte: new Date(startInstant.epochMilliseconds),
            lt: new Date(endInstant.epochMilliseconds),
          },
        },
        // Session ends during the time entry
        {
          endTime: {
            gt: new Date(startInstant.epochMilliseconds),
            lte: new Date(endInstant.epochMilliseconds),
          },
        },
        // Session completely encompasses the time entry
        {
          startTime: {
            lte: new Date(startInstant.epochMilliseconds),
          },
          endTime: {
            gte: new Date(endInstant.epochMilliseconds),
          },
        },
      ],
    },
    orderBy: { startTime: "asc" },
  });

  if (sessions.length === 0) {
    return "Work on project"; // Fallback if no activity data
  }

  // Merge sessions to reduce data volume
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

  // Sort by duration and take top 10
  // const topSessions = mergedSessions
  //   .sort((a, b) => b.durationSeconds - a.durationSeconds)
  //   .slice(0, 10);

  // Build project context
  let projectContext = `Project: ${project.name}`;
  projectContext += `\nClient: ${project.client.name}`;
  if (project.clientDescription) {
    projectContext += `\nProject Description: ${project.clientDescription}`;
  }
  if (project.privateNotes) {
    projectContext += `\nMatching hints: ${project.privateNotes}`;
  }

  const { text } = await generateTextWithTelemetry({
    model,
    prompt: `You are a helpful assistant that analyzes computer activity and generates concise descriptions for time entries.

${projectContext}

Time Entry Period: ${params.startTime} to ${params.endTime}

Activity Sessions during this period (sorted by duration):
${mergedSessions
        .map(
          (s) => `- ${s.appClass}${s.windowTitle ? ` - ${s.windowTitle}` : ""} (${Math.round(s.durationSeconds / 60)} minutes)`
        )
        .join("\n")}

Based on these activity sessions, generate a SINGLE, concise description (5-10 words) for what was worked on during this time entry.

Guidelines:
- Be specific about what was accomplished or worked on
- Use professional, client-friendly language
- Focus on the most significant activities by duration
- Avoid generic phrases like "worked on project" or "coding"
- If window titles indicate specific features or tasks, mention them
- Keep it brief and actionable
- Do not use first person ("I did X"), just describe the work

Provide ONLY the description text, no preamble or explanation.`,
  }, telemetry ? {
    ...telemetry,
    inputPreview: params,
  } : undefined);

  return text.trim();
}
