"use client";

import type { AiTelemetryRun } from "@freelance-os/types";

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

export default function DebugStandaloneRun({ run }: { run: AiTelemetryRun }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {run.functionId}
              </h2>
              <span className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {run.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Standalone AI run · {run.operation} · {formatDate(run.createdAt)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Run ID</dt>
              <dd className="font-medium text-gray-900 dark:text-white">#{run.id}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Tokens</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{run.totalTokens ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Model</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{run.modelId || "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Duration</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {run.totalDurationMs ? `${run.totalDurationMs} ms` : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Input preview</h3>
            <pre className="max-h-72 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {run.inputPreview ?? "—"}
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Output / error</h3>
            <pre className="max-h-72 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {run.error ? run.error : (run.responseText ?? run.outputPreview ?? "—")}
            </pre>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Steps</h3>
        <div className="space-y-3">
          {(run.steps ?? []).length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No steps recorded.</p>
          ) : (
            (run.steps ?? []).map((step) => (
              <div key={step.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">Step {step.stepNumber}</span>
                  <span className="text-gray-600 dark:text-gray-400">{step.totalTokens ?? 0} tokens</span>
                  <span className="text-gray-600 dark:text-gray-400">{step.durationMs ?? 0} ms</span>
                  <span className="text-gray-600 dark:text-gray-400">{step.finishReason || "—"}</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h5 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Prompt</h5>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
                      {step.promptPreview ?? "—"}
                    </pre>
                  </div>
                  <div>
                    <h5 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Output</h5>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
                      {step.outputPreview ?? "—"}
                    </pre>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Tool calls</h3>
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
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h5 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Arguments</h5>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
                      {formatJson(toolCall.argsJson)}
                    </pre>
                  </div>
                  <div>
                    <h5 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {toolCall.success ? "Result" : "Error"}
                    </h5>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-200">
                      {toolCall.success ? formatJson(toolCall.resultJson) : toolCall.error}
                    </pre>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
