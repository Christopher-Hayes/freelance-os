"use server";

import { generateText, generateObject } from "ai";
import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";
import { headers } from 'next/headers'

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
}, language: string): Promise<string> {
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

  const { text } = await generateText({
    model,
    prompt,
  });

  return text.trim();
}

/**
 * Generate autofill suggestions for time entries based on activity sessions
 * This is called from the job processor, not directly by client components
 */
export async function generateAutofillSuggestions(params: {
  date: string;
  projectIds?: number[];
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
  const { object } = await generateObject({
    model: aiModel,
    schema: autofillResponseSchema,
    prompt: `You are a helpful assistant that analyzes computer activity and suggests time entries for project tracking.

Today's date: ${params.date} (in ${localTz} timezone)
UTC time range for this date: ${startInstant.toString()} to ${endInstant.toString()}

CRITICAL: All timestamps you return MUST use the EXACT UTC times from the activity sessions below.

Available Projects:
${projectsInfo.map((p) => `- ID ${p.id}: ${p.name} (Client: ${p.clientName})${p.clientDescription ? `\n  Description: ${p.clientDescription}` : ''}${p.privateNotes ? `\n  Matching hints: ${p.privateNotes}` : ''}${p.billable ? ' [Billable]' : ' [Non-billable]'}`).join("\n")}

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
- Match activities to projects based on project name, description, and window titles
- Include both billable AND non-billable projects
- Group consecutive work on the same project into single entries. Prefer longer entries over many short ones.
- Use the EXACT timestamps from the activity sessions above
- DO NOT create any entries that overlap with the existing time entries
- Ignore casual web browsing unless window titles clearly indicate project work
- It's better to over report time than underreport.
- Entries should be at minimum 15 minutes long
- Keep descriptions concise but informative`,
  });

  return {
    suggestions: object.suggestions,
    activityCount: sessions.length,
    mergedCount: sortedByDuration.length,
  };
}

/**
 * Helper function to merge adjacent sessions
 */
function mergeSessionsForAI(sessions: any[]): any[] {
  if (sessions.length === 0) return [];

  const MERGE_GAP_MINUTES = 10;
  const MAX_DESCRIPTION_LENGTH = 200;

  const sorted = [...sessions].sort((a, b) => {
    const aInstant = Temporal.Instant.from(a.startTime);
    const bInstant = Temporal.Instant.from(b.startTime);
    return Temporal.Instant.compare(aInstant, bInstant);
  });

  const merged: any[] = [];

  for (const session of sorted) {
    const currentStart = Temporal.Instant.from(session.startTime);
    const currentEnd = Temporal.Instant.from(session.endTime);

    let existingIndex = -1;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i];
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
      const existingEnd = Temporal.Instant.from(existing.endTime);

      if (Temporal.Instant.compare(currentEnd, existingEnd) > 0) {
        existing.endTime = session.endTime;
      }

      const existingStart = Temporal.Instant.from(existing.startTime);
      const existingEndInstant = Temporal.Instant.from(existing.endTime);
      const newDurationNs = existingEndInstant.epochNanoseconds - existingStart.epochNanoseconds;
      existing.durationSeconds = Math.floor(Number(newDurationNs) / 1_000_000_000);

      if (session.windowTitle && session.windowTitle !== existing.windowTitle) {
        const currentTitle = existing.windowTitle || "";
        const newTitle = session.windowTitle;
        if (!currentTitle.includes(newTitle)) {
          const combined = currentTitle ? `${currentTitle} / ${newTitle}` : newTitle;
          existing.windowTitle = combined.length > MAX_DESCRIPTION_LENGTH
            ? combined.substring(0, MAX_DESCRIPTION_LENGTH) + "..."
            : combined;
        }
      }
    } else {
      const truncated = { ...session };
      if (truncated.windowTitle && truncated.windowTitle.length > MAX_DESCRIPTION_LENGTH) {
        truncated.windowTitle = truncated.windowTitle.substring(0, MAX_DESCRIPTION_LENGTH) + "...";
      }
      merged.push(truncated);
    }
  }

  return merged;
}
