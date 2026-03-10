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