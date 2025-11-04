"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "@repo/ui";
import type { AiProvider } from "@freelance-os/types";

export default function SettingsPage() {
  const [rescueTimeApiKey, setRescueTimeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [jmapToken, setJmapToken] = useState("");
  const [jmapUsername, setJmapUsername] = useState("");
  const [jmapHostname, setJmapHostname] = useState("");
  const [loading, setLoading] = useState(true);

  // Debounce timers for each field
  const rescueTimeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const openaiTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const googleTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapHostnameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings/all");
      if (response.ok) {
        const data = await response.json();
        setRescueTimeApiKey(data.rescuetimeKey || "");
        setOpenaiApiKey(data.openaiKey || "");
        setGoogleApiKey(data.googleApiKey || "");
        setAiProvider(data.aiProvider || "openai");
        setJmapToken(data.jmapToken || "");
        setJmapUsername(data.jmapUsername || "");
        setJmapHostname(data.jmapHostname || "");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (field: string, value: string | AiProvider) => {
    try {
      const response = await fetch("/api/settings/all", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: value,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save setting");
      }

      toast.success("Saved successfully");
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error(`Failed to save ${field}`);
    }
  };

  const handleRescueTimeChange = (value: string) => {
    setRescueTimeApiKey(value);
    
    if (rescueTimeTimerRef.current) {
      clearTimeout(rescueTimeTimerRef.current);
    }

    rescueTimeTimerRef.current = setTimeout(() => {
      saveSetting("rescuetimeKey", value);
    }, 1000);
  };

  const handleOpenaiChange = (value: string) => {
    setOpenaiApiKey(value);
    
    if (openaiTimerRef.current) {
      clearTimeout(openaiTimerRef.current);
    }

    openaiTimerRef.current = setTimeout(() => {
      saveSetting("openaiKey", value);
    }, 1000);
  };

  const handleGoogleChange = (value: string) => {
    setGoogleApiKey(value);
    
    if (googleTimerRef.current) {
      clearTimeout(googleTimerRef.current);
    }

    googleTimerRef.current = setTimeout(() => {
      saveSetting("googleApiKey", value);
    }, 1000);
  };

  const handleAiProviderChange = (value: AiProvider) => {
    setAiProvider(value);
    saveSetting("aiProvider", value);
  };

  const handleJmapTokenChange = (value: string) => {
    setJmapToken(value);
    
    if (jmapTokenTimerRef.current) {
      clearTimeout(jmapTokenTimerRef.current);
    }

    jmapTokenTimerRef.current = setTimeout(() => {
      saveSetting("jmapToken", value);
    }, 1000);
  };

  const handleJmapUsernameChange = (value: string) => {
    setJmapUsername(value);
    
    if (jmapUsernameTimerRef.current) {
      clearTimeout(jmapUsernameTimerRef.current);
    }

    jmapUsernameTimerRef.current = setTimeout(() => {
      saveSetting("jmapUsername", value);
    }, 1000);
  };

  const handleJmapHostnameChange = (value: string) => {
    setJmapHostname(value);
    
    if (jmapHostnameTimerRef.current) {
      clearTimeout(jmapHostnameTimerRef.current);
    }

    jmapHostnameTimerRef.current = setTimeout(() => {
      saveSetting("jmapHostname", value);
    }, 1000);
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
          Configure your integrations and preferences. Changes are saved automatically.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            AI Provider Configuration
          </h2>
          
          <div className="space-y-4">
            <div>
              <label
                htmlFor="ai_provider"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                AI Provider
              </label>
              <select
                id="ai_provider"
                value={aiProvider}
                onChange={(e) => handleAiProviderChange(e.target.value as AiProvider)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="openai">OpenAI (GPT-4, GPT-3.5)</option>
                <option value="gemini">Google Gemini</option>
              </select>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Choose which AI provider to use for AI-powered features
              </p>
            </div>

            {aiProvider === "openai" && (
              <div>
                <label
                  htmlFor="openai_api_key"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  id="openai_api_key"
                  value={openaiApiKey}
                  onChange={(e) => handleOpenaiChange(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Get your API key from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    OpenAI Platform
                  </a>
                </p>
              </div>
            )}

            {aiProvider === "gemini" && (
              <div>
                <label
                  htmlFor="google_api_key"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Google API Key
                </label>
                <input
                  type="password"
                  id="google_api_key"
                  value={googleApiKey}
                  onChange={(e) => handleGoogleChange(e.target.value)}
                  placeholder="Enter your Google API key"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Get your API key from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
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
                onChange={(e) => handleRescueTimeChange(e.target.value)}
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
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Email Configuration (JMAP)
          </h2>
          
          <div className="space-y-4">
            <div>
              <label
                htmlFor="jmap_token"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                JMAP API Token
              </label>
              <input
                type="password"
                id="jmap_token"
                value={jmapToken}
                onChange={(e) => handleJmapTokenChange(e.target.value)}
                placeholder="Enter your JMAP API token or app password"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                For Fastmail, create an app-specific password from your{" "}
                <a
                  href="https://www.fastmail.com/settings/security/devicekeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  security settings
                </a>
              </p>
            </div>

            <div>
              <label
                htmlFor="jmap_username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                JMAP Username (Email)
              </label>
              <input
                type="email"
                id="jmap_username"
                value={jmapUsername}
                onChange={(e) => handleJmapUsernameChange(e.target.value)}
                placeholder="sender@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                The email address to send from
              </p>
            </div>

            <div>
              <label
                htmlFor="jmap_hostname"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                JMAP Hostname
              </label>
              <input
                type="text"
                id="jmap_hostname"
                value={jmapHostname}
                onChange={(e) => handleJmapHostnameChange(e.target.value)}
                placeholder="api.fastmail.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                JMAP server hostname (defaults to api.fastmail.com)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
