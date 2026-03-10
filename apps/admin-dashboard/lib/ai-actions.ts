"use server";

import { generateText, generateObject, tool, Experimental_Agent as Agent, stepCountIs } from "ai";
import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";
import { headers } from 'next/headers';
import { isJmapEnabled } from "@/lib/jmap-provider";
import { createEmailSearchTools, createSentEmailTools } from "@/lib/jmap-actions";

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

  const basePrompt = `You are a helpful assistant that analyzes computer activity and suggests time entries for project tracking.

Today's date: ${params.date} (in ${localTz} timezone)
UTC time range for this date: ${startInstant.toString()} to ${endInstant.toString()}

CRITICAL: All timestamps you return MUST use the EXACT UTC times from the activity sessions below.

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
- Match activities to projects based on project name, description, and window titles
- Include both billable AND non-billable projects
- Group consecutive work on the same project into single entries. Prefer longer entries over many short ones.
- Use the EXACT timestamps from the activity sessions above
- DO NOT create any entries that overlap with the existing time entries
- Ignore casual web browsing unless window titles clearly indicate project work
- It's better to over report time than underreport.
- Entries should be at minimum 15 minutes long
- Keep descriptions concise but informative`;

  if (!jmapIsEnabled) {
    // No email access — use simple generateObject
    const { object } = await generateObject({
      model: aiModel,
      schema: autofillResponseSchema,
      prompt: basePrompt,
    });

    return {
      suggestions: object.suggestions,
      activityCount: sessions.length,
      mergedCount: sortedByDuration.length,
    };
  }

  // Use an agent with sent email tools for richer context
  const sentEmailTools = createSentEmailTools(startInstant, endInstant);

  const autofillAgent = new Agent({
    model: aiModel,
    stopWhen: stepCountIs(8),
    tools: {
      ...sentEmailTools,
    },
  });

  const result = await autofillAgent.generate({
    system: `You are a helpful assistant that analyzes computer activity AND sent emails to suggest time entries for project tracking.

Your process:
1. Review the activity sessions and available projects
2. Search the user's sent emails for the day to discover client correspondence
3. For important-looking emails, estimate how long the user spent composing them
4. Combine activity data AND email data to produce comprehensive time entry suggestions

Email strategy:
- First, search all sent emails for the day to see who the user corresponded with
- Match sent emails to projects by comparing recipient addresses with client emails
- Use estimateEmailTime to gauge composition effort for significant emails
- Create time entries for email correspondence (e.g. "Client correspondence: discussed X")
- Email time entries should use the email's sent timestamp as a reference point

IMPORTANT: After gathering email context, output your final answer as a valid JSON object matching this schema:
${JSON.stringify(autofillResponseSchema.shape, null, 2)}

The suggestions array must contain objects with: projectId (number), description (string), startTime (ISO string), endTime (ISO string), billable (boolean).`,
    prompt: `${basePrompt}

You have access to tools that can search the user's Sent folder for emails sent today and estimate how long each email took to compose. Use them to discover additional billable work from client correspondence.

After using the tools, provide your final suggestions as a JSON object with a "suggestions" array.`,
  });

  // Parse the structured output from the agent's text response
  let suggestions: Array<{
    projectId: number;
    description: string;
    startTime: string;
    endTime: string;
    billable: boolean;
  }> = [];

  try {
    // Extract JSON from the agent's response
    const jsonMatch = result.text.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = autofillResponseSchema.parse(JSON.parse(jsonMatch[0]));
      suggestions = parsed.suggestions;
    }
  } catch (parseError) {
    console.error("Failed to parse agent suggestions, falling back to generateObject:", parseError);
    // Fallback: re-run with generateObject using the agent's gathered context
    const { object } = await generateObject({
      model: aiModel,
      schema: autofillResponseSchema,
      prompt: `${basePrompt}

Additional context from email analysis:
${result.text}

Based on ALL the above (activity sessions AND email context), generate the final time entry suggestions.`,
    });
    suggestions = object.suggestions;
  }

  console.log(`Autofill agent used ${result.toolCalls?.length || 0} tool calls`);

  return {
    suggestions,
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
}): Promise<string> {
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

  // Convert dates to Instants for email search
  const weekStartInstant = weekStart.toPlainDateTime(Temporal.PlainTime.from("00:00:00")).toZonedDateTime("UTC").toInstant();
  const weekEndInstant = weekEnd.toPlainDateTime(Temporal.PlainTime.from("23:59:59")).toZonedDateTime("UTC").toInstant();

  if (!jmapIsEnabled) {
    // Fallback to simple generation without email context
    const { text } = await generateText({
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
    });

    return text.trim();
  }

  const summaryAgent = new Agent({
    model: model,
    stopWhen: stepCountIs(10),
    tools: createEmailSearchTools(weekStartInstant, weekEndInstant),
  });

  // Use generateText with tools for intelligent email gathering
  const result = await summaryAgent.generate({
    system: `You are a professional assistant creating client-friendly weekly summaries for invoices.

Your process:
1. Analyze the time entries to understand what work was done this week
2. Determine if the entries are vague/generic and would benefit from email context
3. If yes, intelligently search emails using the available tools
4. Use the gathered context to write a specific, outcome-focused summary

When to search emails:
- Time entries are vague (e.g., "worked on project", "bug fixes")
- Specific features/deliverables are mentioned that might have email discussions
- Client communications would clarify what was accomplished

Email search strategy:
- Search for project name, client name, or specific features mentioned
- You can search multiple times with different keywords if needed
- Don't over-search if entries are already clear

Summary writing guidelines:
- Client-friendly, professional language (avoid jargon)
- Focus on outcomes and deliverables
- Be specific about accomplishments
- Write in past tense, describe work objectively
- 1-2 sentences, no bullet points
- Use email context to enrich with specific deliverables discussed

Always end by providing your final summary as plain text.`,
    prompt: `${projectContext}
Week: ${weekStart.toString()} to ${weekEnd.toString()}
Total Hours: ${totalHours.toFixed(1)} hours

Time Entries:
${params.entries.map(e => `- ${e.date}: ${e.description || 'Work on project'} (${e.hours.toFixed(1)}h)`).join('\n')}

Please analyze these entries, search emails if helpful, then provide the final weekly summary.`,
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
}): Promise<string> {
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
  const topSessions = mergedSessions
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 10);

  // Build project context
  let projectContext = `Project: ${project.name}`;
  projectContext += `\nClient: ${project.client.name}`;
  if (project.clientDescription) {
    projectContext += `\nProject Description: ${project.clientDescription}`;
  }
  if (project.privateNotes) {
    projectContext += `\nMatching hints: ${project.privateNotes}`;
  }

  const { text } = await generateText({
    model,
    prompt: `You are a helpful assistant that analyzes computer activity and generates concise descriptions for time entries.

${projectContext}

Time Entry Period: ${params.startTime} to ${params.endTime}

Activity Sessions during this period (sorted by duration):
${topSessions
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
  });

  return text.trim();
}
