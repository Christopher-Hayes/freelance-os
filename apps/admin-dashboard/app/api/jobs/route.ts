import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import type { CreateAiJobInput } from "@freelance-os/types";

// GET /api/jobs - List all jobs or active jobs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get("active") === "true";

    const jobs = await prisma.aiJob.findMany({
      where: activeOnly
        ? {
            status: {
              in: ["pending", "processing"],
            },
          }
        : undefined,
      orderBy: {
        createdAt: "desc",
      },
      take: activeOnly ? undefined : 50, // Limit to 50 recent jobs if not filtering
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

// POST /api/jobs - Create a new job
export async function POST(request: NextRequest) {
  try {
    const body: CreateAiJobInput = await request.json();

    const job = await prisma.aiJob.create({
      data: {
        type: body.type,
        status: "pending",
        progress: 0,
        parameters: body.parameters || {},
      },
    });

    // Start processing the job asynchronously (non-blocking)
    processJobAsync(job.id).catch((error) => {
      console.error(`Error processing job ${job.id}:`, error);
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error("Error creating job:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}

// Async job processor (runs in background)
async function processJobAsync(jobId: number) {
  try {
    // Mark as processing
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    });

    const job = await prisma.aiJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Route to appropriate handler based on job type
    switch (job.type) {
      case "autofill_time_entries":
        await processAutofillJob(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
  }
}

async function processAutofillJob(job: any) {
  const { generateObject } = await import("ai");
  const { getAiModel } = await import("@/lib/ai-provider");
  const { z } = await import("zod");
  const { Temporal } = await import("@/lib/temporal-polyfill");

  const params = job.parameters as {
    date: string;
    projectIds?: number[];
  };

  // Update progress: fetching activities
  await prisma.aiJob.update({
    where: { id: job.id },
    data: { progress: 10 },
  });

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
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        progress: 100,
        result: {
          entriesCreated: 0,
          message: "No activities found for this date",
        },
        completedAt: new Date(),
      },
    });
    return;
  }

  // Update progress: merging sessions
  await prisma.aiJob.update({
    where: { id: job.id },
    data: { progress: 20 },
  });

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

  // Update progress: fetching projects
  await prisma.aiJob.update({
    where: { id: job.id },
    data: { progress: 30 },
  });

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
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        progress: 100,
        result: {
          entriesCreated: 0,
          message: "No active projects found",
        },
        completedAt: new Date(),
      },
    });
    return;
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
    description: p.description,
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

  // Update progress: AI analysis
  await prisma.aiJob.update({
    where: { id: job.id },
    data: { progress: 50 },
  });

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
${projectsInfo.map((p) => `- ID ${p.id}: ${p.name} (Client: ${p.clientName})${p.description ? `\n  Description: ${p.description}` : ''}${p.billable ? ' [Billable]' : ' [Non-billable]'}`).join("\n")}

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

  // Update progress: creating entries
  await prisma.aiJob.update({
    where: { id: job.id },
    data: { progress: 80 },
  });

  // Create time entries from suggestions
  let entriesCreated = 0;
  for (const suggestion of object.suggestions) {
    try {
      const startInstant = Temporal.Instant.from(suggestion.startTime);
      const endInstant = Temporal.Instant.from(suggestion.endTime);
      const durationMinutes = Math.round(
        Number((endInstant.epochNanoseconds - startInstant.epochNanoseconds) / 60_000_000_000n)
      );

      await prisma.timeEntry.create({
        data: {
          projectId: suggestion.projectId,
          description: suggestion.description || null,
          startTime: new Date(suggestion.startTime),
          endTime: new Date(suggestion.endTime),
          durationMinutes,
          billable: suggestion.billable,
        },
      });
      entriesCreated++;
    } catch (error) {
      console.error("Error creating time entry:", error);
    }
  }

  // Update progress: complete
  await prisma.aiJob.update({
    where: { id: job.id },
    data: {
      status: "completed",
      progress: 100,
      result: {
        entriesCreated,
        totalSuggestions: object.suggestions.length,
        activityCount: sessions.length,
        date: params.date,
      },
      completedAt: new Date(),
    },
  });
}

// Helper function to merge adjacent sessions
function mergeSessionsForAI(sessions: any[]): any[] {
  if (sessions.length === 0) return [];

  const MERGE_GAP_MINUTES = 10;
  const MAX_DESCRIPTION_LENGTH = 200;
  const { Temporal } = require("@/lib/temporal-polyfill");

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
