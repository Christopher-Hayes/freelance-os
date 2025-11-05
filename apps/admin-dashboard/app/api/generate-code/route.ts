import { NextResponse } from "next/server";
import { getAiModel } from "@/lib/ai-provider";
import { generateText } from "ai";

export async function POST(request: Request) {
  try {
    const { endpoint, language } = await request.json();

    if (!endpoint || !language) {
      return NextResponse.json(
        { error: "Endpoint and language are required" },
        { status: 400 }
      );
    }

    const model = await getAiModel();

    const languageMap: Record<string, string> = {
      "curl": "cURL",
      "javascript-fetch": "JavaScript using fetch API",
      "javascript-axios": "JavaScript using axios library",
      "python-requests": "Python using requests library",
      "python-httpx": "Python using httpx library",
      "go": "Go using net/http package",
      "php": "PHP using Guzzle library",
      "ruby": "Ruby using net/http",
    };

    const fullLanguage = languageMap[language] || language;

    // Build the prompt for code generation
    let prompt = `Generate a ${fullLanguage} code snippet for the following API endpoint:\n\n`;
    prompt += `Method: ${endpoint.method}\n`;
    prompt += `Path: ${endpoint.path}\n`;
    prompt += `Description: ${endpoint.description}\n\n`;

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

    prompt += `Requirements:\n`;
    prompt += `- Include proper error handling\n`;
    prompt += `- Add comments explaining key parts\n`;
    prompt += `- Use modern best practices for ${fullLanguage}\n`;
    prompt += `- Include authentication header placeholder (Bearer token)\n`;
    prompt += `- Make it production-ready\n`;
    prompt += `- Use the full URL: {BASE_URL}${endpoint.path}\n\n`;
    prompt += `Generate ONLY the code, no explanations or markdown formatting. Just raw code ready to copy-paste.`;

    const { text } = await generateText({
      model,
      prompt,
    });

    return NextResponse.json({ code: text.trim() });
  } catch (error) {
    console.error("Error generating code:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate code" },
      { status: 500 }
    );
  }
}
