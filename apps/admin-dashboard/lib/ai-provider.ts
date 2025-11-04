import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { prisma } from "@freelance-os/database";
import type { AiProvider } from "@freelance-os/types";
import type { LanguageModel } from "ai";

/**
 * Get the configured AI model based on settings
 * @returns The configured AI model instance
 */
export async function getAiModel(): Promise<LanguageModel> {
  // Fetch settings from database
  const setting = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  const aiProvider: AiProvider = setting?.aiProvider || "openai";
  
  switch (aiProvider) {
    case "gemini":
      const googleApiKey = setting?.googleApiKey;
      if (!googleApiKey) {
        throw new Error("Google API key not configured. Please add it in Settings.");
      }
      
      // Create Google provider with API key
      const google = createGoogleGenerativeAI({
        apiKey: googleApiKey,
      });
      return google("gemini-2.5-flash");
      
    case "openai":
    default:
      const openaiKey = setting?.openaiKey;
      if (!openaiKey) {
        throw new Error("OpenAI API key not configured. Please add it in Settings.");
      }
      
      // Return OpenAI model - the SDK uses OPENAI_API_KEY env var by default,
      // but we'll set it in the environment for this process
      process.env.OPENAI_API_KEY = openaiKey;
      return openai("gpt-5-mini");
  }
}

/**
 * Get the current AI provider name
 * @returns The configured AI provider name
 */
export async function getAiProviderName(): Promise<string> {
  const setting = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  const aiProvider = setting?.aiProvider || "openai";
  
  switch (aiProvider) {
    case "gemini":
      return "Google Gemini";
    case "openai":
      return "OpenAI GPT";
    default:
      return "Unknown";
  }
}

/**
 * Check if AI is configured and ready to use
 * @returns True if AI is configured with valid API keys
 */
export async function isAiConfigured(): Promise<boolean> {
  const setting = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  if (!setting) {
    return false;
  }

  const aiProvider = setting.aiProvider || "openai";
  
  switch (aiProvider) {
    case "gemini":
      return !!setting.googleApiKey;
    case "openai":
      return !!setting.openaiKey;
    default:
      return false;
  }
}
