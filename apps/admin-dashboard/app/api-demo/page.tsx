"use client";

import { useState, useEffect } from "react";
import { APIFooter, ApiKeyModal, ApiKeyList } from "@repo/ui";
import type { ApiKeyListItem } from "@freelance-os/types";
import { generateCode } from "@/lib/ai-actions";
import { authFetch } from '@/lib/util';

// Demo permissions available for API keys
const availablePermissions = [
  {
    id: "read:clients",
    label: "Read Clients",
    description: "View client information and details",
  },
  {
    id: "write:clients",
    label: "Write Clients",
    description: "Create and update client records",
  },
  {
    id: "read:projects",
    label: "Read Projects",
    description: "View project information and status",
  },
  {
    id: "write:projects",
    label: "Write Projects",
    description: "Create and update projects",
  },
  {
    id: "read:time",
    label: "Read Time Entries",
    description: "View time tracking data",
  },
  {
    id: "write:time",
    label: "Write Time Entries",
    description: "Create and update time entries",
  },
  {
    id: "read:invoices",
    label: "Read Invoices",
    description: "View invoice information",
  },
  {
    id: "write:invoices",
    label: "Write Invoices",
    description: "Create and update invoices",
  },
];

export default function ApiDemoPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([]);

  const handleGenerateApiKey = async (
    name: string,
    permissions: string[],
    expiresAt?: Date
  ) => {
    try {
      const response = await authFetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          permissions,
          expiresAt,
          // userId is optional - API will use system user for admin dashboard
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate API key");
      }

      const data = await response.json();
      
      // Refresh the list
      await fetchApiKeys();
      
      return { key: data.key };
    } catch (error) {
      console.error("Error generating API key:", error);
      throw error;
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    try {
      const response = await authFetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to revoke API key");
      }
      
      // Refresh the list
      await fetchApiKeys();
    } catch (error) {
      console.error("Error revoking API key:", error);
      throw error;
    }
  };

  const fetchApiKeys = async () => {
    try {
      const response = await authFetch("/api/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    }
  };

  const handleGenerateCode = async (endpoint: any, language: string) => {
    const code = await generateCode(endpoint, language);
    return code;
  };

  // Load API keys on mount
  useEffect(() => {
    fetchApiKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold dark:text-white mb-2">
          API Footer Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Showcasing enhanced API documentation with query parameters, copy-to-clipboard, 
          API key generation, and AI-powered code generation.
        </p>
      </div>

      {/* API Keys Section */}
      <div className="mb-12 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold dark:text-white">API Keys</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Generate New Key
          </button>
        </div>
        
        <ApiKeyList apiKeys={apiKeys} onRevoke={handleRevokeApiKey} />
      </div>

      {/* Enhanced API Footer Demo */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold dark:text-white mb-4">
          Sample API Endpoints
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The footer below demonstrates all enhanced features:
        </p>

        <APIFooter
          enableApiKeys
          enableCodeGen
          onGenerateApiKey={() => setIsModalOpen(true)}
          onGenerateCode={handleGenerateCode}
          endpoints={[
            {
              method: "GET",
              path: "/clients",
              description: "List all clients with optional filters",
              queryParams: [
                {
                  name: "page",
                  type: "number",
                  description: "Page number for pagination",
                },
                {
                  name: "limit",
                  type: "number",
                  description: "Number of items per page",
                },
                {
                  name: "search",
                  type: "string",
                  description: "Search by client name or email",
                },
              ],
            },
            {
              method: "POST",
              path: "/clients",
              description: "Create a new client",
              body: JSON.stringify(
                {
                  name: "John Doe",
                  email: "john@example.com",
                  company: "Acme Corp",
                },
                null,
                2
              ),
            },
            {
              method: "GET",
              path: "/projects",
              description: "Get projects with filtering and sorting",
              queryParams: [
                {
                  name: "clientId",
                  type: "number",
                  required: true,
                  description: "Filter by client ID",
                },
                {
                  name: "status",
                  type: "string",
                  enum: ["active", "completed", "on-hold"],
                  description: "Filter by project status",
                },
                {
                  name: "sortBy",
                  type: "string",
                  enum: ["name", "startDate", "endDate"],
                  description: "Sort field",
                },
              ],
            },
            {
              method: "PUT",
              path: "/projects/{id}",
              description: "Update a project",
              body: JSON.stringify(
                {
                  name: "Updated Project Name",
                  status: "completed",
                  billable: true,
                },
                null,
                2
              ),
            },
            {
              method: "DELETE",
              path: "/clients/{id}",
              description: "Delete a client and all associated data",
            },
          ]}
        />
      </div>

      {/* API Key Generation Modal */}
      <ApiKeyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerate={handleGenerateApiKey}
        availablePermissions={availablePermissions}
      />
    </div>
  );
}
