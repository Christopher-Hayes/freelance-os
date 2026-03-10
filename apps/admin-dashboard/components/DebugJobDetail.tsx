"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiJobDebug, AiTelemetryRun } from "@freelance-os/types";
import { getJobStatusColor, enrichJobWithDisplay } from "@/lib/job-utils";

const POLL_INTERVAL = 3_000; // 3 seconds

function formatJson(value: unknown) {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDate(value?: Date | string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function isJobActive(status: string) {
  return status === "pending" || status === "processing";
}

function useSelectedRun(job: AiJobDebug) {
  const runs = job.telemetryRuns ?? [];
  const [selectedRunId, setSelectedRunId] = useState<number | null>(runs[0]?.id ?? null);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0],
    [runs, selectedRunId]
  );

  return {
    runs,
    selectedRun,
    selectedRunId,
    setSelectedRunId,
  };
}

export default function DebugJobDetail({ job: initialJob }: { job: AiJobDebug }) {
  const [job, setJob] = useState<AiJobDebug>(initialJob);
  const abortRef = useRef<AbortController | null>(null);

  // Reset state when a different job is selected
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  // Poll for updates when the job is active
  const fetchLatest = useCallback(async () => {
    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch(`/api/jobs/${job.id}?includeTelemetry=true`, {
        signal: controller.signal,
      });

      if (!res.ok) return;
      const data: AiJobDebug = await res.json();
      setJob(data);
    } catch {
      // Ignore fetch / abort errors
    }
  }, [job.id]);

  useEffect(() => {
    if (!isJobActive(job.status)) return;

    const interval = setInterval(fetchLatest, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [job.status, fetchLatest]);
  const enrichedJob = enrichJobWithDisplay(job);
  const { runs, selectedRun, selectedRunId, setSelectedRunId } = useSelectedRun(job);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {enrichedJob.displayTitle}
              </h2>
              <span className={`rounded px-2.5 py-1 text-xs font-medium ${getJobStatusColor(job.status)}`}>
                {job.status}
              </span>
              {isJobActive(job.status) && (
                <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Live
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {enrichedJob.displayDescription || "No summary available yet."}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Job ID</dt>
              <dd className="font-medium text-gray-900 dark:text-white">#{job.id}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Progress</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{job.progress}%</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Created</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{formatDate(job.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{formatDate(job.completedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Parameters</h3>
            <pre className="max-h-72 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {formatJson(job.parameters)}
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Result / error</h3>
            <pre className="max-h-72 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {job.error ? job.error : formatJson(job.result)}
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI telemetry</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Prompt/response previews, token usage, steps, and tool calls for this job.
            </p>
          </div>

          {runs.length > 1 ? (
            <select
              value={selectedRunId ?? undefined}
              onChange={(event) => setSelectedRunId(Number(event.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.functionId} · {formatDate(run.createdAt)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {!selectedRun ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            No telemetry captured for this job yet.
          </div>
        ) : (
          <TelemetryRunPanel run={selectedRun} />
        )}
      </section>
    </div>
  );
}

function TelemetryRunPanel({ run }: { run: AiTelemetryRun }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Function" value={run.functionId} />
        <MetricCard label="Model" value={run.modelId || "—"} />
        <MetricCard label="Tokens" value={run.totalTokens?.toString() || "—"} />
        <MetricCard label="Duration" value={run.totalDurationMs ? `${run.totalDurationMs} ms` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CodePanel title="Input preview" value={run.inputPreview} />
        <CodePanel title="Output preview" value={run.outputPreview} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CodePanel title="Metadata" value={formatJson(run.metadata)} />
        <CodePanel title="Response text" value={run.responseText} />
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Steps</h4>
        <div className="space-y-3">
          {(run.steps ?? []).map((step) => (
            <div key={step.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">Step {step.stepNumber}</span>
                <span className="text-gray-600 dark:text-gray-400">{step.totalTokens ?? 0} tokens</span>
                <span className="text-gray-600 dark:text-gray-400">{step.durationMs ?? 0} ms</span>
                <span className="text-gray-600 dark:text-gray-400">{step.finishReason || "—"}</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <CodePanel title="Prompt" value={step.promptPreview} compact />
                <CodePanel title="Output" value={step.outputPreview} compact />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Tool calls</h4>
        <div className="space-y-3">
          {(run.toolCalls ?? []).length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No tool calls were captured for this run.</p>
          ) : (
            (run.toolCalls ?? []).map((toolCall) => (
              <div key={toolCall.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{toolCall.toolName}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${toolCall.success ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}`}>
                    {toolCall.success ? "success" : "failed"}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">Step {toolCall.stepNumber ?? "—"}</span>
                  <span className="text-gray-600 dark:text-gray-400">{toolCall.durationMs ?? 0} ms</span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <CodePanel title="Arguments" value={formatJson(toolCall.argsJson)} compact />
                  <CodePanel
                    title={toolCall.success ? "Result" : "Error"}
                    value={toolCall.success ? formatJson(toolCall.resultJson) : toolCall.error}
                    compact
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function CodePanel({
  title,
  value,
  compact = false,
}: {
  title: string;
  value?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <h5 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{title}</h5>
      <pre className={`overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200 ${compact ? "max-h-48" : "max-h-72"}`}>
        {(value?.[0] === "{" || value?.[0] === "[") &&
          (value?.[value.length - 1] === "}" || value?.[value.length - 1] === "]") &&
          value.length > 2
          ? JSON.stringify(JSON.parse(value ?? '{}'), null, 2)
          : value
          ?? "—"}
      </pre>
    </div>
  );
}