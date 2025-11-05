'use client';

import { APIFooter } from "@repo/ui";

export function ProjectsAPIFooter() {
  const handleGenerateCode = async (endpoint: any, language: string) => {
    const response = await fetch("/api/generate-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, language }),
    });
    if (!response.ok) throw new Error("Failed to generate code");
    const data = await response.json();
    return data.code;
  };

  return (
    <APIFooter
      enableApiKeys
      enableCodeGen
      onGenerateApiKey={() => window.location.href = '/settings?tab=api'}
      onGenerateCode={handleGenerateCode}
      endpoints={[
        {
          method: "GET",
          path: "/projects",
          description: "List your projects",
          queryParams: [
            {
              name: "status",
              type: "string",
              enum: ["active", "completed", "on-hold"],
              description: "Filter by project status",
            },
            {
              name: "sortBy",
              type: "string",
              enum: ["name", "createdAt", "status"],
              description: "Sort projects (default: createdAt desc)",
            },
          ],
        },
        {
          method: "GET",
          path: "/projects/{id}",
          description: "Get details for a specific project",
        },
      ]}
    />
  );
}
