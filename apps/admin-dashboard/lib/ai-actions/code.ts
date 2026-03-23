"use server";

import { getAiModel } from "@/lib/ai-provider";
import { headers } from "next/headers";
import { type DebugTelemetryOptions, generateTextWithTelemetry } from "./shared";

/**
 * Generate code snippet for API endpoint using AI
 */
export async function generateCode(
  endpoint: {
    method: string;
    path: string;
    description: string;
    queryParams?: Array<{
      name: string;
      type: string;
      required?: boolean;
      description?: string;
    }>;
    body?: string;
  },
  language: string,
  telemetry?: DebugTelemetryOptions
): Promise<string> {
  const model = await getAiModel();
  const origin = (await headers()).get("origin") || "http://localhost:3010";

  const languageMap: Record<string, string> = {
    curl: "cURL",
    "javascript-fetch": "JavaScript using fetch API",
    "javascript-axios": "JavaScript using axios library",
    "python-requests": "Python using requests library",
    "python-httpx": "Python using httpx library",
    go: "Go using net/http package",
    php: "PHP using Guzzle library",
    ruby: "Ruby using net/http",
  };

  const fullLanguage = languageMap[language] || language;

  let prompt = `Generate a ${fullLanguage} code snippet for the following API endpoint:\n
Method: ${endpoint.method}
Path: ${endpoint.path}
Description: ${endpoint.description}\n\n`;

  if (endpoint.queryParams && endpoint.queryParams.length > 0) {
    prompt += `Query Parameters:\n`;
    endpoint.queryParams.forEach((param: any) => {
      prompt += `- ${param.name} (${param.type})${param.required ? " [required]" : ""}: ${param.description || ""}\n`;
    });
    prompt += "\n";
  }

  if (endpoint.body) {
    prompt += `Request Body Example:\n${endpoint.body}\n\n`;
  }

  prompt += `Requirements:\n
Generate ONLY the code, no explanations or markdown formatting. Just raw code ready to copy-paste.
Keep it concise and to the point.
Include authentication header placeholder (Bearer token).
Use ONLY the query parameters listed above - DO NOT fabricate or add additional query parameters.
Prefer working example values for query parameters and body over placeholders.
Use the full URL: ${origin}${endpoint.path}`;

  const { text } = await generateTextWithTelemetry(
    {
      model,
      prompt,
    },
    telemetry
      ? {
          ...telemetry,
          inputPreview: { endpoint, language },
        }
      : undefined
  );

  return text.trim();
}
