import { prisma } from "@freelance-os/database";
import {
  PRICED_OPENAI_MODELS,
  matchModelId,
  type OpenAiModelOption,
} from "./openai-models";

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Build a price lookup for model ids seen in telemetry.
 * Prices saved in Settings for the configured main/fast models win over the
 * built-in catalog, so overriding a price in Settings affects new runs.
 */
export async function getCostCalculator() {
  const setting = await prisma.setting.findUnique({ where: { key: "main" } });

  const candidates: OpenAiModelOption[] = [...PRICED_OPENAI_MODELS];
  const configured = [
    {
      id: setting?.openaiModel,
      inputPrice: setting?.openaiInputPrice,
      outputPrice: setting?.openaiOutputPrice,
    },
    {
      id: setting?.openaiFastModel,
      inputPrice: setting?.openaiFastInputPrice,
      outputPrice: setting?.openaiFastOutputPrice,
    },
  ];
  for (const c of configured) {
    if (c.id && c.inputPrice != null && c.outputPrice != null) {
      // Replace the catalog entry so the saved price takes precedence
      const i = candidates.findIndex((m) => m.id === c.id);
      const entry = { id: c.id, label: c.id, inputPrice: c.inputPrice, outputPrice: c.outputPrice };
      if (i >= 0) candidates[i] = entry;
      else candidates.push(entry);
    }
  }

  /** USD cost, or undefined when the model has no known price or no usage. */
  return (modelId: string | undefined, usage: TokenUsage): number | undefined => {
    if (!modelId) return undefined;
    if (usage.promptTokens == null && usage.completionTokens == null) return undefined;
    const price = matchModelId(modelId, candidates);
    if (!price) return undefined;
    return (
      ((usage.promptTokens ?? 0) * price.inputPrice +
        (usage.completionTokens ?? 0) * price.outputPrice) /
      1_000_000
    );
  };
}
