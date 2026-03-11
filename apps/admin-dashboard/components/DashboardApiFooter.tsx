"use client";

import { APIFooter } from "@repo/ui";

type QueryParam = {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  required?: boolean;
  description?: string;
  enum?: string[];
};

export type DashboardApiEndpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  body?: string;
  queryParams?: QueryParam[];
};

type DashboardApiFooterProps = {
  endpoints: DashboardApiEndpoint[];
};

export function DashboardApiFooter({ endpoints }: DashboardApiFooterProps) {
  return (
    <APIFooter
      enableApiKeys
      enableCodeGen={false}
      endpoints={endpoints}
      onGenerateApiKey={() => {
        window.location.href = "/api-demo";
      }}
    />
  );
}