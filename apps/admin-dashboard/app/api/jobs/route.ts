import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import type { CreateAiJobInput } from "@freelance-os/types";
import { getAdminAuth, hasPermission } from "@/lib/auth";
import { getJobsForDebug } from "@/lib/debug-data";

// GET /api/jobs - List all jobs or active jobs
export async function GET(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, "read:jobs")) {
			return NextResponse.json({ error: "Forbidden - Missing permission: read:jobs" }, { status: 403 });
		}

    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get("active") === "true";
    const includeTelemetry = searchParams.get("includeTelemetry") === "true";

    const jobs = includeTelemetry
      ? await getJobsForDebug(activeOnly ? 25 : 100)
      : await prisma.aiJob.findMany({
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
          take: activeOnly ? undefined : 50,
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
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, "write:jobs")) {
			return NextResponse.json({ error: "Forbidden - Missing permission: write:jobs" }, { status: 403 });
		}

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
  const { generateAutofillSuggestions } = await import("@/lib/ai-actions");
  const { Temporal } = await import("@/lib/temporal-polyfill");

  const params = job.parameters as {
    date: string;
    projectIds?: number[];
  };

  const plainDate = Temporal.PlainDate.from(params.date);
  const localTz = Temporal.Now.timeZoneId();
  const startOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("00:00:00"));
  const endOfDay = plainDate.toPlainDateTime(Temporal.PlainTime.from("23:59:59.999"));
  const startInstant = startOfDay.toZonedDateTime(localTz).toInstant();
  const endInstant = endOfDay.toZonedDateTime(localTz).toInstant();

  // Update progress: fetching activities
  await prisma.aiJob.update({
    where: { id: job.id },
    data: { progress: 10 },
  });

  try {
    // Update progress: AI analysis and processing
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { progress: 50 },
    });

    // Use the server action to generate suggestions
    const result = await generateAutofillSuggestions({
      ...params,
      debugJobId: job.id,
    });

    if (result.suggestions.length === 0) {
      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          progress: 100,
          result: {
            entriesCreated: 0,
            message: result.activityCount === 0 
              ? "No activities found for this date"
              : "No matching work activities found",
          },
          completedAt: new Date(),
        },
      });
      return;
    }

    // Update progress: creating entries
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { progress: 80 },
    });

    const existingEntryIds = new Set(
      (
        await prisma.timeEntry.findMany({
          where: {
            startTime: {
              gte: new Date(startInstant.toString()),
              lte: new Date(endInstant.toString()),
            },
          },
          select: { id: true },
        })
      ).map((entry) => entry.id)
    );

    // Apply time entry suggestions
    let entriesCreated = 0;
    let entriesUpdated = 0;
    for (const suggestion of result.suggestions) {
      try {
        const suggestionStartInstant = Temporal.Instant.from(suggestion.startTime);
        const suggestionEndInstant = Temporal.Instant.from(suggestion.endTime);
        const durationMinutes = Math.round(
          Number((suggestionEndInstant.epochNanoseconds - suggestionStartInstant.epochNanoseconds) / 60_000_000_000n)
        );

        if (durationMinutes < 15) {
          console.warn("Skipping autofill suggestion with invalid duration", suggestion);
          continue;
        }

        if (suggestion.action === "update") {
          if (suggestion.existingEntryId == null || !existingEntryIds.has(suggestion.existingEntryId)) {
            console.warn("Skipping autofill update for missing entry", suggestion);
            continue;
          }

          await prisma.timeEntry.update({
            where: { id: suggestion.existingEntryId },
            data: {
              projectId: suggestion.projectId,
              description: suggestion.description || null,
              startTime: new Date(suggestion.startTime),
              endTime: new Date(suggestion.endTime),
              durationMinutes,
              billable: suggestion.billable,
            },
          });
          entriesUpdated++;
          continue;
        }

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
          entriesUpdated,
          totalSuggestions: result.suggestions.length,
          activityCount: result.activityCount,
          date: params.date,
        },
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error in autofill job:", error);
    throw error; // Re-throw to be caught by processJobAsync
  }
}

