'use client';

import { APIFooter } from "@repo/ui";

export function DashboardAPIFooter() {
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
          ],
        },
        {
          method: "GET",
          path: "/time",
          description: "List your time entries",
          queryParams: [
            {
              name: "projectId",
              type: "number",
              description: "Filter by project ID",
            },
            {
              name: "startDate",
              type: "string",
              description: "Filter from date (YYYY-MM-DD)",
            },
            {
              name: "endDate",
              type: "string",
              description: "Filter to date (YYYY-MM-DD)",
            },
          ],
        },
        {
          method: "GET",
          path: "/invoices",
          description: "List your invoices",
          queryParams: [
            {
              name: "status",
              type: "string",
              enum: ["draft", "sent", "paid", "overdue", "cancelled"],
              description: "Filter by invoice status",
            },
            {
              name: "projectId",
              type: "number",
              description: "Filter by project ID",
            },
          ],
        },
      ]}
    />
  );
}
