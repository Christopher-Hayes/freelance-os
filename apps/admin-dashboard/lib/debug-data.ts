import { prisma } from "@freelance-os/database";

export async function getJobsForDebug(limit = 100) {
  return prisma.aiJob.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      telemetryRuns: {
        orderBy: { createdAt: "desc" },
        include: {
          steps: {
            orderBy: { stepNumber: "asc" },
          },
          toolCalls: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
}

export async function getJobDetailForDebug(jobId: number) {
  return prisma.aiJob.findUnique({
    where: { id: jobId },
    include: {
      telemetryRuns: {
        orderBy: { createdAt: "desc" },
        include: {
          steps: {
            orderBy: { stepNumber: "asc" },
          },
          toolCalls: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
}

/** Fetch telemetry runs that are not associated with any job (e.g. coding stats). */
export async function getStandaloneTelemetryRuns(limit = 50) {
  return prisma.aiTelemetryRun.findMany({
    where: { jobId: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      toolCalls: { orderBy: { createdAt: "asc" } },
    },
  });
}