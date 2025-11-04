import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";

// GET /api/jobs/[id] - Get a specific job's status
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const jobId = parseInt(id);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { error: "Invalid job ID" },
        { status: 400 }
      );
    }

    const job = await prisma.aiJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}

// DELETE /api/jobs/[id] - Cancel a job
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const jobId = parseInt(id);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { error: "Invalid job ID" },
        { status: 400 }
      );
    }

    const job = await prisma.aiJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Only allow cancelling pending or processing jobs
    if (job.status !== "pending" && job.status !== "processing") {
      return NextResponse.json(
        { error: "Job cannot be cancelled" },
        { status: 400 }
      );
    }

    const updatedJob = await prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(updatedJob);
  } catch (error) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
