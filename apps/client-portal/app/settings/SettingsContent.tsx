"use client";

import { useState, useEffect } from "react";
import { toast, ApiKeyModal, ApiKeyList } from "@repo/ui";
import type { ApiKeyListItem } from "@freelance-os/types";

// Permissions available for client portal API keys
const availablePermissions = [
  { id: "read:projects", label: "Read Projects", description: "View your project information" },
  { id: "read:time", label: "Read Time Entries", description: "View your time tracking data" },
  { id: "read:invoices", label: "Read Invoices", description: "View your invoice information" },
];

interface SettingsContentProps {
  userName: string;
  userEmail: string;
}

export function SettingsContent({ userName, userEmail }: SettingsContentProps) {
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch("/api/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async (
    name: string,
    permissions: string[],
    expiresAt?: Date
  ) => {
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, permissions, expiresAt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate API key");
      }

      const data = await response.json();
      await fetchApiKeys();
      return { key: data.key };
    } catch (error) {
      console.error("Error generating API key:", error);
      throw error;
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    try {
      const response = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to revoke API key");
      }
      
      await fetchApiKeys();
      toast.success("API key revoked successfully");
    } catch (error) {
      console.error("Error revoking API key:", error);
      toast.error("Failed to revoke API key");
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your account and API access
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Account Information
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Name
              </label>
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100">
                {userName}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100">
                {userEmail}
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              To update your account information, please contact your service provider.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                API Keys
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Generate API keys for programmatic access to your data
              </p>
            </div>
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
            >
              Generate New Key
            </button>
          </div>
          
          <ApiKeyList
            apiKeys={apiKeys.map(key => ({
              ...key,
              lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
              expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
              createdAt: key.createdAt.toISOString()
            }))} 
            onRevoke={handleRevokeApiKey} />
        </div>
      </div>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onGenerate={handleGenerateApiKey}
        availablePermissions={availablePermissions}
      />
    </div>
  );
}
