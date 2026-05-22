// @ts-ignore
import { Prisma } from "@prisma/client";
import { prisma } from "@freelance-os/database";

type JsonRecord = Record<string, unknown>;

interface CreateAiTelemetryOptions {
  jobId?: number;
  functionId: string;
  operation?: string;
  metadata?: JsonRecord;
  inputPreview?: string;
}

function toPreview(value: unknown, maxLength = 4000): string | undefined {
  if (value == null) return undefined;

  const text = typeof value === "string" ? value : safeStringify(value);
  if (!text) return undefined;

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

/** Deep-clone an object via JSON round-trip so it's safe for Prisma Json fields. */
function safeJsonClone(value: unknown): object | undefined {
  if (value == null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as object;
  } catch {
    return undefined;
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function usageFromUnknown(usage: unknown): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} {
  const usageRecord = usage as Record<string, unknown> | undefined;
  const promptTokens = numberOrUndefined(
    usageRecord?.promptTokens ?? usageRecord?.inputTokens
  );
  const completionTokens = numberOrUndefined(
    usageRecord?.completionTokens ?? usageRecord?.outputTokens
  );
  const totalTokens = numberOrUndefined(usageRecord?.totalTokens) ??
    ((promptTokens ?? completionTokens) !== undefined
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

// ---------------------------------------------------------------------------
// Public API — create a run, record steps/finish, and mark failures.
// These are called directly from ai-actions.ts using SDK callbacks
// (onStepFinish for generateText, result inspection for generateObject).
// ---------------------------------------------------------------------------

/**
 * Create a telemetry run record in the DB and return its id.
 */
export async function createTelemetryRun(
  options: CreateAiTelemetryOptions
): Promise<number> {
  const run = await prisma.aiTelemetryRun.create({
    data: {
      jobId: options.jobId,
      functionId: options.functionId,
      operation: options.operation ?? "generateText",
      status: "started",
      metadata: options.metadata as Prisma.InputJsonValue | undefined,
      inputPreview: options.inputPreview,
    },
  });
  return run.id;
}

/**
 * Record a single step from the SDK's `onStepFinish` callback.
 * The `event` shape matches the AI SDK StepResult object (v6+).
 *
 * v6 StepResult properties used here:
 *   stepNumber, model.{provider,modelId}, finishReason, usage.{inputTokens,outputTokens,totalTokens},
 *   request, text, providerMetadata, toolCalls[].{toolCallId,toolName,input},
 *   toolResults[].{toolCallId,toolName,output,type:"tool-result"|"tool-error"}
 */
export async function recordTelemetryStep(runId: number, event: unknown) {
  try {
    const step = event as Record<string, unknown>;
    const usage = usageFromUnknown(step.usage);

    // stepNumber is required — skip if missing
    const stepNumber = numberOrUndefined(step.stepNumber);
    if (stepNumber === undefined) return;

    // v6: model info is in step.model.{provider, modelId}
    const modelObj = step.model as Record<string, unknown> | undefined;
    const modelId = typeof modelObj?.modelId === "string" ? modelObj.modelId : undefined;
    const modelProvider = typeof modelObj?.provider === "string" ? modelObj.provider : undefined;

    const data = {
      modelProvider,
      modelId,
      finishReason:
        typeof step.finishReason === "string"
          ? step.finishReason
          : undefined,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      durationMs: numberOrUndefined(step.durationMs),
      promptPreview: toPreview(step.request ?? step.messages),
      outputPreview: toPreview(step.text),
      providerMetadata:
        safeJsonClone(step.providerMetadata) ?? undefined,
      toolCallsJson: Array.isArray(step.toolCalls)
        ? safeJsonClone(step.toolCalls) as object[] | undefined
        : undefined,
    };

    await prisma.aiTelemetryStep.upsert({
      where: {
        telemetryRunId_stepNumber: {
          telemetryRunId: runId,
          stepNumber,
        },
      },
      update: data,
      create: { telemetryRunId: runId, stepNumber, ...data },
    });

    // Also record individual tool calls for this step, if any.
    // v6 tool calls use `input` (not `args`), tool results use `output` (not `result`),
    // and errors have type "tool-error".
    if (Array.isArray(step.toolCalls) && Array.isArray(step.toolResults)) {
      const toolCalls = step.toolCalls as Record<string, unknown>[];
      const toolResults = step.toolResults as Record<string, unknown>[];

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]!;
        const tr = toolResults[i];
        const isError = tr?.type === "tool-error" || tr?.type === "error" || tr?.isError === true;
        await prisma.aiTelemetryToolCall.create({
          data: {
            telemetryRunId: runId,
            toolCallId: typeof tc.toolCallId === "string" ? tc.toolCallId : undefined,
            toolName: typeof tc.toolName === "string" ? tc.toolName : "unknown_tool",
            stepNumber,
            success: !isError,
            durationMs: undefined,
            argsJson: safeJsonClone(tc.input ?? tc.args) as object | undefined ?? undefined,
            resultJson: !isError ? safeJsonClone(tr?.output ?? tr?.result) as object | undefined ?? undefined : undefined,
            error: isError ? toPreview(tr?.error ?? tr?.output, 2000) : undefined,
          },
        });
      }
    }
  } catch (error) {
    // The AI SDK v6 silently swallows errors in onStepFinish callbacks,
    // so log here to make debugging possible.
    console.error("[ai-telemetry] Failed to record step:", error);
  }
}

/**
 * Finalize a telemetry run after the SDK call completes.
 * `result` is the full generateText / generateObject result object.
 */
export async function finishTelemetryRun(
  runId: number,
  result: Record<string, unknown>
) {
  const totalUsage = usageFromUnknown(result.totalUsage ?? result.usage);

  // v6: model info is on result.response.modelId, not result.model
  const responseObj = result.response as Record<string, unknown> | undefined;
  const modelObj = result.model as Record<string, unknown> | undefined;
  const modelId =
    typeof responseObj?.modelId === "string"
      ? responseObj.modelId
      : typeof modelObj?.modelId === "string"
        ? modelObj.modelId
        : typeof result.modelId === "string"
          ? result.modelId
          : undefined;

  // v6: durationMs lives on each StepResult, not the top-level result; sum them
  const steps = Array.isArray(result.steps)
    ? (result.steps as Record<string, unknown>[])
    : [];
  const stepDurationSum = steps.reduce(
    (sum, s) => sum + (typeof s.durationMs === "number" ? s.durationMs : 0),
    0
  );
  const totalDurationMs =
    numberOrUndefined(result.durationMs) ??
    (stepDurationSum > 0 ? stepDurationSum : undefined);

  await prisma.aiTelemetryRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      modelId,
      finishReason:
        typeof result.finishReason === "string"
          ? result.finishReason
          : undefined,
      promptTokens: totalUsage.promptTokens,
      completionTokens: totalUsage.completionTokens,
      totalTokens: totalUsage.totalTokens,
      totalDurationMs,
      outputPreview: toPreview(result.text ?? result.object),
      responseText: toPreview(result.text ?? result.object, 20000),
    },
  });
}

/**
 * Mark a telemetry run as failed.
 */
export async function markAiTelemetryFailed(runId: number, error: unknown) {
  await prisma.aiTelemetryRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      error: toPreview(error, 4000),
    },
  });
}
