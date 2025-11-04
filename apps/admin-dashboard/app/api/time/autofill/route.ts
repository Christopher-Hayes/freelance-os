import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { generateObject } from "ai";
import { getAiModel, isAiConfigured } from "@/lib/ai-provider";
import { z } from "zod";
import { Temporal } from "@/lib/temporal-polyfill";

// Schema for time entry suggestions
const timeEntrySuggestionSchema = z.object({
  projectId: z.number().describe("The ID of the project this time entry should be associated with"),
  description: z.string().describe("A brief description of what work was done during this time period"),
  startTime: z.string().describe("ISO 8601 UTC timestamp for when this work started"),
  endTime: z.string().describe("ISO 8601 UTC timestamp for when this work ended"),
  billable: z.boolean().describe("Whether this work is billable to the client"),
});

const autofillResponseSchema = z.object({
  suggestions: z.array(timeEntrySuggestionSchema).describe(
    "Array of suggested time entries based on the activity sessions. Group related activities together. " +
    "Only suggest entries for apps/activities that clearly relate to work projects. " +
    "Ignore web browsing, email, chat apps unless the window titles indicate specific project work. " +
    "DO NOT create entries that overlap with existing time entries."
  ),
});

// Helper function to merge adjacent sessions (similar to timeline utils but simplified)
function mergeSessionsForAI(sessions: any[]): any[] {
  if (sessions.length === 0) return [];

  const MERGE_GAP_MINUTES = 10;
  const MAX_DESCRIPTION_LENGTH = 200;

  // Sort by start time
  const sorted = [...sessions].sort((a, b) => {
    const aInstant = Temporal.Instant.from(a.startTime);
    const bInstant = Temporal.Instant.from(b.startTime);
    return Temporal.Instant.compare(aInstant, bInstant);
  });

  const merged: any[] = [];

  for (const session of sorted) {
    const currentStart = Temporal.Instant.from(session.startTime);
    const currentEnd = Temporal.Instant.from(session.endTime);

    // Find recent session of same app
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

      // Merge window titles (with length limit)
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
      // Truncate long descriptions
      const truncated = { ...session };
      if (truncated.windowTitle && truncated.windowTitle.length > MAX_DESCRIPTION_LENGTH) {
        truncated.windowTitle = truncated.windowTitle.substring(0, MAX_DESCRIPTION_LENGTH) + "...";
      }
      merged.push(truncated);
    }
  }

  return merged;
}

export async function POST(request: NextRequest) {
  try {
    const { date, existingEntries } = await request.json();

    if (!date) {
      return NextResponse.json(
        { error: "Date parameter is required" },
        { status: 400 }
      );
    }

    // Check if AI is configured
    if (!(await isAiConfigured())) {
      return NextResponse.json(
        { error: "AI provider not configured. Please configure OpenAI or Google Gemini API key in Settings." },
        { status: 500 }
      );
    }

    // Parse the date and convert to local timezone boundaries
    const plainDate = Temporal.PlainDate.from(date);
    
    // Get the local timezone (same as the client viewing the timeline)
    const localTz = Temporal.Now.timeZoneId();
    
    // Create start of day (00:00:00) and end of day (23:59:59.999) in local timezone
    const startOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("00:00:00"));
    const endOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("23:59:59.999"));
    
    // Convert to ZonedDateTime in local timezone, then to Instant (UTC) for database query
    const startInstant = startOfDay.toZonedDateTime(localTz).toInstant();
    const endInstant = endOfDay.toZonedDateTime(localTz).toInstant();

    console.log('=== AUTOFILL DEBUG ===');
    console.log('Requested date:', date);
    console.log('Plain date:', plainDate.toString());
    console.log('Local timezone:', localTz);
    console.log('Start of day (local):', startOfDay.toString());
    console.log('End of day (local):', endOfDay.toString());
    console.log('Start instant (UTC):', startInstant.toString());
    console.log('End instant (UTC):', endInstant.toString());
    console.log('Query start:', new Date(startInstant.toString()).toISOString());
    console.log('Query end:', new Date(endInstant.toString()).toISOString());

    // Fetch activity sessions for the day (database stores in UTC, so we query with UTC instants)
    const sessions = await prisma.activitySession.findMany({
      where: {
        startTime: {
          gte: new Date(startInstant.toString()),
          lte: new Date(endInstant.toString()),
        },
      },
      orderBy: { startTime: "asc" },
    });

    console.log('Sessions found:', sessions.length);
    if (sessions.length > 0) {
      console.log('First session:', sessions[0]!.startTime.toISOString());
      console.log('Last session:', sessions[sessions.length - 1]!.startTime.toISOString());
    }
    console.log('======================');

    if (sessions.length === 0) {
      return NextResponse.json({
        suggestions: [],
        message: "No activity sessions found for this date.",
      });
    }

    // Merge sessions to reduce data volume - keep in UTC
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

    // Fetch active projects
    const projects = await prisma.project.findMany({
      where: {
        status: {
          in: ["active", "on_hold"],
        },
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
      return NextResponse.json({
        suggestions: [],
        message: "No active projects found. Please create projects before using autofill.",
      });
    }

    // Prepare data for AI - include all relevant project info
    const projectsInfo = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      clientName: p.client.name,
      status: p.status,
      billable: p.billable,
    }));

    // Limit to a reasonable number of sessions (top sessions by duration)
    const sortedByDuration = mergedSessions
      .sort((a, b) => b.durationSeconds - a.durationSeconds)
      .slice(0, 50); // Limit to top 50 sessions

    // Format existing entries for AI context
    const existingEntriesInfo = (existingEntries || []).map((entry: any) => ({
      projectId: entry.projectId,
      startTime: entry.startTime,
      endTime: entry.endTime,
      description: entry.description,
    }));

    // Generate suggestions using AI
    const aiModel = await getAiModel();
    const { object } = await generateObject({
      model: aiModel,
      schema: autofillResponseSchema,
      prompt: `You are a helpful assistant that analyzes computer activity and suggests time entries for project tracking.

Today's date: ${date} (in ${localTz} timezone)
UTC time range for this date: ${startInstant.toString()} to ${endInstant.toString()}

CRITICAL: All timestamps you return MUST use the EXACT UTC times from the activity sessions below.
Do NOT create timestamps like ${date}T00:00:00Z - use the actual session times which are in the range ${startInstant.toString()} to ${endInstant.toString()}.

Available Projects:
${projectsInfo.map((p) => `- ID ${p.id}: ${p.name} (Client: ${p.clientName})${p.description ? `\n  Description: ${p.description}` : ''}${p.billable ? ' [Billable]' : ' [Non-billable]'}`).join("\n")}

${existingEntriesInfo.length > 0 ? `Existing Time Entries (DO NOT OVERLAP WITH THESE):
${existingEntriesInfo.map((e: any) => {
  const project = projects.find((p) => p.id === e.projectId);
  return `- ${project?.name || `Project ${e.projectId}`}: ${e.startTime} to ${e.endTime}${e.description ? ` - ${e.description}` : ''}`;
}).join("\n")}

` : ''}Activity Sessions (merged, top by duration):
${sortedByDuration
  .map(
    (s) => {
      const startTime = new Date(s.startTime).toISOString();
      const endTime = new Date(s.endTime).toISOString();
      return `- ${s.appClass}${s.windowTitle ? ` - ${s.windowTitle}` : ""} (${Math.round(s.durationSeconds / 60)} minutes, ${startTime} to ${endTime})`;
    }
  )
  .join("\n")}

Based on these activity sessions, suggest time entries that should be created for work. Group related activities together into logical work blocks.

Guidelines:
- Match activities to projects based on project name, description, and window titles
- Include both billable AND non-billable projects - suggest for any project that matches the activity
- Group consecutive work on the same project into single entries
- Use the EXACT timestamps from the activity sessions above - do not modify the date portion
- DO NOT create any entries that overlap with the existing time entries listed above
- Ignore casual web browsing, unless window titles clearly indicate project work
- Social for business (like Slack, email, and sometimes Discord) can be included if window titles indicate project-related communication
- Be conservative - when in doubt, don't suggest an entry
- Provide realistic time ranges based on the activity data
- Entries should be at minimum 15 minutes long
- Keep descriptions concise but informative
- Mark entries as billable based on the project's billable status`,
    });

    // Automatically create the suggested time entries
    const createdEntries = [];
    for (const suggestion of object.suggestions) {
      try {
        const startInstant = Temporal.Instant.from(suggestion.startTime);
        const endInstant = Temporal.Instant.from(suggestion.endTime);
        const durationMinutes = Math.round(
          Number((endInstant.epochNanoseconds - startInstant.epochNanoseconds) / 60_000_000_000n)
        );

        const entry = await prisma.timeEntry.create({
          data: {
            projectId: suggestion.projectId,
            description: suggestion.description || null,
            startTime: new Date(suggestion.startTime),
            endTime: new Date(suggestion.endTime),
            durationMinutes,
            billable: suggestion.billable,
          },
        });

        createdEntries.push(entry);
      } catch (error) {
        console.error("Error creating time entry:", error);
        // Continue with other suggestions even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      entriesCreated: createdEntries.length,
      activityCount: sessions.length,
      mergedCount: sortedByDuration.length,
    });
  } catch (error: any) {
    console.error("Error generating autofill suggestions:", error);
    
    // Provide helpful error messages
    if (error?.message?.includes("API key")) {
      return NextResponse.json(
        { error: "Invalid AI API key. Please check your API key configuration in Settings." },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to generate suggestions. " + (error?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
