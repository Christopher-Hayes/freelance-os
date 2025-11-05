"use client";

import { useState } from "react";

type Permission = {
  id: string;
  label: string;
  description: string;
};

type ApiKeyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (name: string, permissions: string[], expiresAt?: Date) => Promise<{ key: string }>;
  availablePermissions: Permission[];
};

export function ApiKeyModal({ isOpen, onClose, onGenerate, availablePermissions }: ApiKeyModalProps) {
  const [name, setName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setError(null);
    
    if (!name.trim()) {
      setError("Please provide a name for this API key");
      return;
    }

    if (selectedPermissions.length === 0) {
      setError("Please select at least one permission");
      return;
    }

    setIsGenerating(true);
    try {
      const expiresAt = expiresInDays 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      const result = await onGenerate(name, selectedPermissions, expiresAt);
      setGeneratedKey(result.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setName("");
    setSelectedPermissions([]);
    setExpiresInDays(null);
    setGeneratedKey(null);
    setError(null);
    onClose();
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permissionId)
        ? prev.filter(p => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const copyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {generatedKey ? "API Key Generated" : "Generate API Key"}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!generatedKey ? (
            <div className="space-y-4">
              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Mobile App, Integration Script"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Permissions
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3">
                  {availablePermissions.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission.id)}
                        onChange={() => togglePermission(permission.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {permission.label}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {permission.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expiration (optional)
                </label>
                <select
                  value={expiresInDays || ""}
                  onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Never expires</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors"
                >
                  {isGenerating ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  ⚠️ Important: Save this key now!
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  This is the only time you'll see this key. Store it securely and never share it publicly.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={generatedKey}
                    readOnly
                    className="flex-1 px-3 py-2 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    onClick={copyKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Example Usage:
                </p>
                <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded border border-gray-300 dark:border-gray-600 overflow-x-auto">
                  <code className="text-gray-800 dark:text-gray-200">
{`curl -H "Authorization: Bearer ${generatedKey}" \\
     ${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/endpoint`}
                  </code>
                </pre>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
