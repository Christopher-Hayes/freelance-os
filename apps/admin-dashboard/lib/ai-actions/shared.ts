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
  if (!telemetry?.jobId) return undefined;

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

export type ActivitySessionForAI = {
  id: number;
  startTime: string;
  endTime: string;
  appClass: string;
  windowTitle: string | null;
  durationSeconds: number;
  subSessions?: ActivitySessionForAI[];
};

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

export function mergeSessionsForAI(sessions: ActivitySessionForAI[]): ActivitySessionForAI[] {
  if (sessions.length === 0) return [];

  const MERGE_GAP_MINUTES = 10;
  const INTERVAL_CHUNK_MINUTES = 15;
  const INTERVAL_BREAKDOWN_THRESHOLD_MINUTES = 30;
  const MAX_DESCRIPTION_LENGTH = 500;

  const sorted = [...sessions].sort((a, b) => {
    const aInstant = Temporal.Instant.from(a.startTime);
    const bInstant = Temporal.Instant.from(b.startTime);
    return Temporal.Instant.compare(aInstant, bInstant);
  });

  const stripTrailingAppName = (title: string) => {
    const lastDash = title.lastIndexOf(" - ");
    if (lastDash > 0) {
      return title.slice(0, lastDash);
    }
    return title;
  };

  const truncateTitle = (title: string) =>
    title.length > MAX_DESCRIPTION_LENGTH
      ? `${title.substring(0, MAX_DESCRIPTION_LENGTH)}...`
      : title;

  const formatIntervalLabel = (instant: Temporal.Instant) => {
    const zdt = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
    const hour = zdt.hour;
    const minute = zdt.minute;
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
  };

  const describeSessionTitles = (session: ActivitySessionForAI) => {
    const subSessions = session.subSessions ?? [session];
    const distinctTitles = Array.from(
      new Set(
        subSessions
          .map((sub) => sub.windowTitle?.trim())
          .filter((title): title is string => Boolean(title))
          .map(stripTrailingAppName)
      )
    );

    if (session.durationSeconds < INTERVAL_BREAKDOWN_THRESHOLD_MINUTES * 60) {
      return truncateTitle(distinctTitles.slice(0, 3).join(" / "));
    }

    const sessionStart = Temporal.Instant.from(session.startTime);
    const sessionEnd = Temporal.Instant.from(session.endTime);
    const chunkSeconds = INTERVAL_CHUNK_MINUTES * 60;
    const intervalSummaries: string[] = [];

    for (
      let intervalStart = sessionStart;
      Temporal.Instant.compare(intervalStart, sessionEnd) < 0;
      intervalStart = intervalStart.add({ minutes: INTERVAL_CHUNK_MINUTES })
    ) {
      const intervalEndCandidate = intervalStart.add({ minutes: INTERVAL_CHUNK_MINUTES });
      const intervalEnd =
        Temporal.Instant.compare(intervalEndCandidate, sessionEnd) > 0
          ? sessionEnd
          : intervalEndCandidate;

      let bestTitle = "";
      let bestOverlapSeconds = 0;

      for (const sub of subSessions) {
        if (!sub.windowTitle?.trim()) continue;

        const subStart = Temporal.Instant.from(sub.startTime);
        const subEnd = Temporal.Instant.from(sub.endTime);
        const overlapStart =
          Temporal.Instant.compare(intervalStart, subStart) > 0 ? intervalStart : subStart;
        const overlapEnd =
          Temporal.Instant.compare(intervalEnd, subEnd) < 0 ? intervalEnd : subEnd;

        if (Temporal.Instant.compare(overlapStart, overlapEnd) >= 0) continue;

        const overlapNs = overlapEnd.epochNanoseconds - overlapStart.epochNanoseconds;
        const overlapSeconds = Number(overlapNs / 1_000_000_000n);

        if (overlapSeconds > bestOverlapSeconds) {
          bestOverlapSeconds = overlapSeconds;
          bestTitle = stripTrailingAppName(sub.windowTitle);
        }
      }

      if (bestTitle && bestOverlapSeconds >= Math.min(chunkSeconds / 3, chunkSeconds)) {
        const label = formatIntervalLabel(intervalStart);
        const summary = `${label}: ${bestTitle}`;
        if (intervalSummaries.at(-1) !== summary) {
          intervalSummaries.push(summary);
        }
      }
    }

    if (intervalSummaries.length > 0) {
      return truncateTitle(intervalSummaries.join(" | "));
    }

    return truncateTitle(distinctTitles.slice(0, 5).join(" / "));
  };

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
      const gapNs = currentStart.epochNanoseconds - mEnd.epochNanoseconds;
      const gapMinutes = Number(gapNs) / (1_000_000_000 * 60);

      if (gapMinutes <= MERGE_GAP_MINUTES) {
        existingIndex = i;
        break;
      }
    }

    if (existingIndex >= 0) {
      const existing = merged[existingIndex];
      if (!existing) {
        continue;
      }
      existing.subSessions = existing.subSessions ?? [cloneActivitySessionForAI(existing)];
      existing.subSessions.push(cloneActivitySessionForAI(session));
      const existingEnd = Temporal.Instant.from(existing.endTime);

      if (Temporal.Instant.compare(currentEnd, existingEnd) > 0) {
        existing.endTime = session.endTime;
      }

      const existingStart = Temporal.Instant.from(existing.startTime);
      const existingEndInstant = Temporal.Instant.from(existing.endTime);
      const newDurationNs =
        existingEndInstant.epochNanoseconds - existingStart.epochNanoseconds;
      existing.durationSeconds = Math.floor(Number(newDurationNs) / 1_000_000_000);

      existing.windowTitle = describeSessionTitles(existing);
    } else {
      const truncated: ActivitySessionForAI = {
        ...session,
        subSessions: [cloneActivitySessionForAI(session)],
      };
      truncated.windowTitle = truncated.windowTitle
        ? describeSessionTitles(truncated)
        : truncated.windowTitle;
      merged.push(truncated);
    }
  }

  // Remove any sessions shorter than 5 minutes after merging
  return merged.filter((s) => s.durationSeconds >= 300);
}
