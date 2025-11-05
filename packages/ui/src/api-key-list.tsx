"use client";

import { useState } from "react";

type ApiKey = {
  id: string;
  name: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type ApiKeyListProps = {
  apiKeys: ApiKey[];
  onRevoke: (id: string) => Promise<void>;
};

export function ApiKeyList({ apiKeys, onRevoke }: ApiKeyListProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke the API key "${name}"? This action cannot be undone.`)) {
      return;
    }

    setRevokingId(id);
    try {
      await onRevoke(id);
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (apiKeys.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No API keys yet. Generate one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {apiKeys.map((key) => {
        const expired = isExpired(key.expiresAt);
        
        return (
          <div
            key={key.id}
            className={`border rounded-lg p-4 ${
              expired
                ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {key.name}
                  </h3>
                  {expired && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 rounded">
                      Expired
                    </span>
                  )}
                </div>
                
                <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex flex-wrap gap-1">
                    <span className="font-medium">Permissions:</span>
                    {key.permissions.map((perm, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                  
                  <div>
                    <span className="font-medium">Created:</span> {formatDate(key.createdAt)}
                  </div>
                  
                  <div>
                    <span className="font-medium">Last used:</span> {formatDate(key.lastUsedAt)}
                  </div>
                  
                  {key.expiresAt && (
                    <div>
                      <span className="font-medium">Expires:</span> {formatDate(key.expiresAt)}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleRevoke(key.id, key.name)}
                disabled={revokingId === key.id}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded transition-colors"
              >
                {revokingId === key.id ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
