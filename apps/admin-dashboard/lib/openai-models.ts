// Client-safe catalog of selectable OpenAI models (no server imports).
// Prices are USD per 1M tokens and only serve as defaults for the price inputs
// in Settings; the saved values on the Setting row are the source of truth.

export interface OpenAiModelOption {
  id: string;
  label: string;
  inputPrice: number;
  outputPrice: number;
}

export const OPENAI_MODELS: OpenAiModelOption[] = [
  { id: "gpt-6-astra", label: "GPT-6 Astra", inputPrice: 10, outputPrice: 50 },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", inputPrice: 2, outputPrice: 10 },
  { id: "gpt-6-luna", label: "GPT-6 Luna", inputPrice: 0.1, outputPrice: 0.5 },
];

export const DEFAULT_OPENAI_MODEL = "gpt-6.1-sol";
export const DEFAULT_OPENAI_FAST_MODEL = "gpt-6-luna";

export function findOpenAiModel(id: string | null | undefined) {
  return OPENAI_MODELS.find((m) => m.id === id);
}

// Models no longer selectable in Settings but still present in telemetry history.
// Only used for pricing lookups.
const LEGACY_OPENAI_MODELS: OpenAiModelOption[] = [
  { id: "gpt-5.4", label: "GPT-5.4", inputPrice: 2.5, outputPrice: 15 },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", inputPrice: 0.75, outputPrice: 4.5 },
];

export const PRICED_OPENAI_MODELS: OpenAiModelOption[] = [
  ...OPENAI_MODELS,
  ...LEGACY_OPENAI_MODELS,
];

/**
 * Match a (possibly dated-snapshot) model id like "gpt-5.4-mini-2026-03-17"
 * to the longest known id it extends. Longest wins so "-mini" beats the base.
 */
export function matchModelId<T extends { id: string }>(
  modelId: string,
  candidates: T[]
): T | undefined {
  return candidates
    .filter((c) => modelId === c.id || modelId.startsWith(`${c.id}-`))
    .sort((a, b) => b.id.length - a.id.length)[0];
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value === 0) return "$0.00";
  // Individual AI calls cost fractions of a cent; keep precision when small
  const digits = Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}
