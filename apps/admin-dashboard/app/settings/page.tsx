"use client";

import { useState, useEffect } from "react";
import { useToast } from "@repo/ui";

export default function SettingsPage() {
  const [rescueTimeApiKey, setRescueTimeApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings?key=rescuetime_api_key");
      if (response.ok) {
        const data = await response.json();
        setRescueTimeApiKey(data.value || "");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "rescuetime_api_key",
          value: rescueTimeApiKey,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
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
          Configure your integrations and preferences
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <form onSubmit={handleSave}>
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                RescueTime Integration
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="rescuetime_api_key"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    RescueTime API Key
                  </label>
                  <input
                    type="password"
                    id="rescuetime_api_key"
                    value={rescueTimeApiKey}
                    onChange={(e) => setRescueTimeApiKey(e.target.value)}
                    placeholder="Enter your RescueTime API key"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Get your API key from{" "}
                    <a
                      href="https://www.rescuetime.com/anapi/manage"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      RescueTime API Management
                    </a>
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                    How to use RescueTime integration:
                  </h3>
                  <ol className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
                    <li>Create a RescueTime account at rescuetime.com</li>
                    <li>Install the RescueTime tracking app on your computer</li>
                    <li>Generate an API key from the link above</li>
                    <li>Paste your API key here and save</li>
                    <li>Go to Time Tracking and click "Import from RescueTime" on days with no activity data</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex justify-end rounded-b-lg">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
