import Link from "next/link";
import type { AiJobDebug } from "@freelance-os/types";
import { getJobsForDebug } from "@/lib/debug-data";
import { enrichJobWithDisplay, getJobStatusColor } from "@/lib/job-utils";

function formatDate(value?: Date | string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function countTokens(job: AiJobDebug) {
  return (job.telemetryRuns ?? []).reduce(
    (sum, run) => sum + (run.totalTokens ?? 0),
    0
  );
}

export default async function DebugPage({
  searchParams,
}: {
  searchParams?: Promise<{ jobId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const jobs = (await getJobsForDebug(100)) as AiJobDebug[];
  const activeJobs = jobs.filter((job) => job.status === "pending" || job.status === "processing");
  const selectedJobId = resolvedSearchParams?.jobId ? Number(resolvedSearchParams.jobId) : undefined;

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Debug</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Inspect active AI jobs, recent history, token usage, tool calls, and model responses.
        </p>
      </div>

      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active jobs</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{activeJobs.length} running</span>
        </div>

        {activeJobs.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No active jobs right now.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeJobs.map((job) => {
              const enriched = enrichJobWithDisplay(job);
              return (
                <Link
                  key={job.id}
                  href={`/debug?jobId=${job.id}`}
                  className="rounded-lg border border-gray-200 p-4 transition hover:border-blue-400 hover:bg-blue-50/40 dark:border-gray-800 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{enriched.displayTitle}</h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{enriched.displayDescription || "Processing..."}</p>
                    </div>
                    <span className={`rounded px-2.5 py-1 text-xs font-medium ${getJobStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className="h-2 rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${job.progress}%` }} />
                  </div>
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Started {formatDate(job.startedAt || job.createdAt)}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(360px,420px)_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent jobs</h2>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {jobs.map((job) => {
              const enriched = enrichJobWithDisplay(job);
              const isSelected = job.id === selectedJobId;
              return (
                <Link
                  key={job.id}
                  href={`/debug?jobId=${job.id}`}
                  className={`block border-b border-gray-100 px-6 py-4 last:border-b-0 dark:border-gray-800 ${isSelected ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900 dark:text-white">{enriched.displayTitle}</div>
                      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{enriched.displayDescription || "No summary available"}</div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${getJobStatusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>#{job.id}</span>
                    <span>{formatDate(job.createdAt)}</span>
                    <span>{countTokens(job)} tokens</span>
                    <span>{job.telemetryRuns?.reduce((sum, run) => sum + (run.toolCalls?.length ?? 0), 0) ?? 0} tool calls</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          {selectedJobId ? (
            <SelectedJob jobId={selectedJobId} jobs={jobs} />
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              Select a job from the list to inspect telemetry details.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

async function SelectedJob({ jobId, jobs }: { jobId: number; jobs: AiJobDebug[] }) {
  const { default: DebugJobDetail } = await import("@/components/DebugJobDetail");
  const job = jobs.find((item) => item.id === jobId);

  if (!job) {
    return (
      <div className="rounded-xl border border-dashed border-red-300 bg-white p-10 text-sm text-red-600 shadow-sm dark:border-red-900 dark:bg-gray-900 dark:text-red-300">
        Job #{jobId} was not found.
      </div>
    );
  }

  return <DebugJobDetail job={job} />;
}