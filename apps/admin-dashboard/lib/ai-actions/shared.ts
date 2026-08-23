import { generateText, type GenerateTextResult, Output } from "ai";
import { z } from "zod";
import { getAiModel } from "@/lib/ai-provider";
import {
  createTelemetryRun,
  recordTelemetryStep,
  finishTelemetryRun,
  markAiTelemetryFailed,
} from "@/lib/ai-telemetry";
import { Temporal } from "@/lib/temporal-polyfill";
import {
  type ActivitySessionForAI,
  buildSessionDigest,
  summarizeDigestOneLine,
} from "./activity-digest";

export type DebugTelemetryOptions = {
  jobId?: number;
  functionId: string;
  metadata?: Record<string, unknown>;
  inputPreview?: unknown;
  operation?: string;
};

export type ProviderOptions = {
  openai: {
    reasoningEffort: "none" | "low" | "medium" | "high";
  };
  google: {
    reasoningEffort: "none" | "low" | "medium" | "high";
  };
};

export const PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: "medium", // 'none' | 'low' | 'medium' | 'high'
  },
  google: {
    reasoningEffort: "medium", // 'none' | 'low' | 'medium' | 'high'
  },
};

export const PROVIDER_OPTIONS_SMART = {
  openai: {
    reasoningEffort: "high", // 'none' | 'low' | 'medium' | 'high'
  },
  google: {
    reasoningEffort: "high", // 'none' | 'low' | 'medium' | 'high'
  },
};

// Fast models only
export const PROVIDER_OPTIONS_FAST = {
  openai: {
    reasoningEffort: "low", // 'none' | 'low' | 'medium' | 'high'
  },
  google: {
    reasoningEffort: "low", // 'none' | 'low' | 'medium' | 'high'
  },
};

/**
 * Create a telemetry run (if a jobId is provided) and return the runId.
 * Returns undefined when telemetry is not requested.
 */
export async function maybeCreateTelemetryRun(
  telemetry?: DebugTelemetryOptions
): Promise<number | undefined> {
  if (!telemetry?.functionId) return undefined;

  return createTelemetryRun({
    jobId: telemetry.jobId,
    functionId: telemetry.functionId,
    operation: telemetry.operation,
    metadata: telemetry.metadata,
    inputPreview:
      typeof telemetry.inputPreview === "string"
        ? telemetry.inputPreview
        : JSON.stringify(telemetry.inputPreview, null, 2),
  });
}

export async function generateTextWithTelemetry(
  params: Parameters<typeof generateText>[0],
  telemetry?: DebugTelemetryOptions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<GenerateTextResult<any, any>> {
  const runId = await maybeCreateTelemetryRun(telemetry);

  try {
    const result = await generateText({
      ...params,
      onStepFinish: runId
        ? async (event) => {
            await recordTelemetryStep(runId, event);
          }
        : params.onStepFinish,
    });

    if (runId) {
      await finishTelemetryRun(runId, result as unknown as Record<string, unknown>);
    }

    return result;
  } catch (error) {
    if (runId) {
      await markAiTelemetryFailed(runId, error);
    }
    throw error;
  }
}

export async function generateObjectWithTelemetry<TSchema extends z.ZodTypeAny>(
  params: {
    model: Awaited<ReturnType<typeof getAiModel>>;
    schema: TSchema;
    prompt: string;
  },
  telemetry?: DebugTelemetryOptions
): Promise<{ object: z.infer<TSchema> }> {
  const runId = await maybeCreateTelemetryRun(telemetry);

  try {
    const result = await generateText({
      model: params.model,
      output: Output.object({ schema: params.schema }),
      prompt: params.prompt,
      providerOptions: PROVIDER_OPTIONS,
      onStepFinish: runId
        ? async (event) => {
            await recordTelemetryStep(runId, event);
          }
        : undefined,
    });

    if (runId) {
      await finishTelemetryRun(runId, result as unknown as Record<string, unknown>);
    }

    return { object: result.output as z.infer<TSchema> };
  } catch (error) {
    if (runId) {
      await markAiTelemetryFailed(runId, error);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Activity session merging helpers (shared by autofill and time-entry)
// ---------------------------------------------------------------------------

export type { ActivitySessionForAI } from "./activity-digest";
export {
  buildSessionDigest,
  formatSessionDigest,
  formatSessionsForPrompt,
  summarizeDigestOneLine,
  formatDayRollup,
  formatDuration,
} from "./activity-digest";

const MERGE_GAP_MINUTES = 10;
const MIN_MERGED_SESSION_SECONDS = 300;

export function cloneActivitySessionForAI(session: ActivitySessionForAI): ActivitySessionForAI {
  return {
    id: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    appClass: session.appClass,
    windowTitle: session.windowTitle,
    durationSeconds: session.durationSeconds,
  };
}

/**
 * Merge same-app sessions separated by short gaps into single blocks, keeping
 * every original session under `subSessions` so downstream digests can compute
 * real per-site totals. `windowTitle` becomes a one-line rollup; callers that
 * need the full breakdown should use formatSessionsForPrompt / buildSessionDigest.
 */
export function mergeSessionsForAI(sessions: ActivitySessionForAI[]): ActivitySessionForAI[] {
  if (sessions.length === 0) return [];

  const sorted = [...sessions].sort((a, b) =>
    Temporal.Instant.compare(
      Temporal.Instant.from(a.startTime),
      Temporal.Instant.from(b.startTime)
    )
  );

  const merged: ActivitySessionForAI[] = [];

  for (const session of sorted) {
    const currentStart = Temporal.Instant.from(session.startTime);
    const currentEnd = Temporal.Instant.from(session.endTime);

    let existingIndex = -1;
    for (let i = merged.length - 1; i >= 0; i--) {
      const m = merged[i];
      if (!m) continue;
      if (m.appClass !== session.appClass) continue;

      const mEnd = Temporal.Instant.from(m.endTime);
      const gapMinutes =
        Number(currentStart.epochNanoseconds - mEnd.epochNanoseconds) / (1_000_000_000 * 60);

      if (gapMinutes <= MERGE_GAP_MINUTES) {
        existingIndex = i;
        break;
      }
    }

    if (existingIndex < 0) {
      merged.push({
        ...session,
        subSessions: [cloneActivitySessionForAI(session)],
      });
      continue;
    }

    const existing = merged[existingIndex];
    if (!existing) continue;

    existing.subSessions = existing.subSessions ?? [cloneActivitySessionForAI(existing)];
    existing.subSessions.push(cloneActivitySessionForAI(session));

    if (Temporal.Instant.compare(currentEnd, Temporal.Instant.from(existing.endTime)) > 0) {
      existing.endTime = session.endTime;
    }

    const existingStart = Temporal.Instant.from(existing.startTime);
    const existingEnd = Temporal.Instant.from(existing.endTime);
    existing.durationSeconds = Math.floor(
      Number(existingEnd.epochNanoseconds - existingStart.epochNanoseconds) / 1_000_000_000
    );
  }

  for (const session of merged) {
    session.windowTitle = summarizeDigestOneLine(buildSessionDigest(session));
  }

  return merged.filter((s) => s.durationSeconds >= MIN_MERGED_SESSION_SECONDS);
}
