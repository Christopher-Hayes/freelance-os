import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import type { CreateAiJobInput } from "@freelance-os/types";
import { getAdminAuth } from "@/lib/auth";

// GET /api/jobs - List all jobs or active jobs
export async function GET(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const result = await generateAutofillSuggestions(params);

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

    // Create time entries from suggestions
    let entriesCreated = 0;
    for (const suggestion of result.suggestions) {
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

