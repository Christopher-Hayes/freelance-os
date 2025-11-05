"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "@repo/ui";
import type { AiProvider } from "@freelance-os/types";

const MASK_VALUE = "••••••••";

export default function SettingsPage() {
  const [rescueTimeApiKey, setRescueTimeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [jmapToken, setJmapToken] = useState("");
  const [jmapUsername, setJmapUsername] = useState("");
  const [jmapHostname, setJmapHostname] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerEmail, setFreelancerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(true);

  // Track which sensitive fields have been modified by the user
  // This prevents auto-saving masked placeholder values
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());

  // Debounce timers for each field
  const rescueTimeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const openaiTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const googleTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapHostnameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const companyNameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const freelancerNameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const freelancerEmailTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const addressTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const phoneTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const websiteTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings/all");
      if (response.ok) {
        const data = await response.json();
        // Sensitive fields will be masked (••••••••) if they exist
        setRescueTimeApiKey(data.rescuetimeKey || "");
        setOpenaiApiKey(data.openaiKey || "");
        setGoogleApiKey(data.googleApiKey || "");
        setAiProvider(data.aiProvider || "openai");
        setJmapToken(data.jmapToken || "");
        // Non-sensitive fields
        setJmapUsername(data.jmapUsername || "");
        setJmapHostname(data.jmapHostname || "");
        setCompanyName(data.companyName || "");
        setFreelancerName(data.freelancerName || "");
        setFreelancerEmail(data.freelancerEmail || "");
        setAddress(data.address || "");
        setPhone(data.phone || "");
        setWebsite(data.website || "");
        
        // Reset modified fields tracker on initial load
        setModifiedFields(new Set());
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
    setModifiedFields(prev => new Set(prev).add("rescuetimeKey"));
    
    if (rescueTimeTimerRef.current) {
      clearTimeout(rescueTimeTimerRef.current);
    }

    rescueTimeTimerRef.current = setTimeout(() => {
      // Only save if this field was actually modified by the user
      if (value !== MASK_VALUE) {
        saveSetting("rescuetimeKey", value);
      }
    }, 1000);
  };

  const handleOpenaiChange = (value: string) => {
    setOpenaiApiKey(value);
    setModifiedFields(prev => new Set(prev).add("openaiKey"));
    
    if (openaiTimerRef.current) {
      clearTimeout(openaiTimerRef.current);
    }

    openaiTimerRef.current = setTimeout(() => {
      // Only save if this field was actually modified by the user
      if (value !== MASK_VALUE) {
        saveSetting("openaiKey", value);
      }
    }, 1000);
  };

  const handleGoogleChange = (value: string) => {
    setGoogleApiKey(value);
    setModifiedFields(prev => new Set(prev).add("googleApiKey"));
    
    if (googleTimerRef.current) {
      clearTimeout(googleTimerRef.current);
    }

    googleTimerRef.current = setTimeout(() => {
      // Only save if this field was actually modified by the user
      if (value !== MASK_VALUE) {
        saveSetting("googleApiKey", value);
      }
    }, 1000);
  };

  const handleAiProviderChange = (value: AiProvider) => {
    setAiProvider(value);
    saveSetting("aiProvider", value);
  };

  const handleJmapTokenChange = (value: string) => {
    setJmapToken(value);
    setModifiedFields(prev => new Set(prev).add("jmapToken"));
    
    if (jmapTokenTimerRef.current) {
      clearTimeout(jmapTokenTimerRef.current);
    }

    jmapTokenTimerRef.current = setTimeout(() => {
      // Only save if this field was actually modified by the user
      if (value !== MASK_VALUE) {
        saveSetting("jmapToken", value);
      }
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

  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
    
    if (companyNameTimerRef.current) {
      clearTimeout(companyNameTimerRef.current);
    }

    companyNameTimerRef.current = setTimeout(() => {
      saveSetting("companyName", value);
    }, 1000);
  };

  const handleFreelancerNameChange = (value: string) => {
    setFreelancerName(value);
    
    if (freelancerNameTimerRef.current) {
      clearTimeout(freelancerNameTimerRef.current);
    }

    freelancerNameTimerRef.current = setTimeout(() => {
      saveSetting("freelancerName", value);
    }, 1000);
  };

  const handleFreelancerEmailChange = (value: string) => {
    setFreelancerEmail(value);
    
    if (freelancerEmailTimerRef.current) {
      clearTimeout(freelancerEmailTimerRef.current);
    }

    freelancerEmailTimerRef.current = setTimeout(() => {
      saveSetting("freelancerEmail", value);
    }, 1000);
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    
    if (addressTimerRef.current) {
      clearTimeout(addressTimerRef.current);
    }

    addressTimerRef.current = setTimeout(() => {
      saveSetting("address", value);
    }, 1000);
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    
    if (phoneTimerRef.current) {
      clearTimeout(phoneTimerRef.current);
    }

    phoneTimerRef.current = setTimeout(() => {
      saveSetting("phone", value);
    }, 1000);
  };

  const handleWebsiteChange = (value: string) => {
    setWebsite(value);
    
    if (websiteTimerRef.current) {
      clearTimeout(websiteTimerRef.current);
    }

    websiteTimerRef.current = setTimeout(() => {
      saveSetting("website", value);
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
            Freelancer Information
          </h2>
          
          <div className="space-y-4">
            <div>
              <label
                htmlFor="company_name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Company/Business Name
              </label>
              <input
                type="text"
                id="company_name"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                placeholder="Your Company Name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Used in invoices and email communications
              </p>
            </div>

            <div>
              <label
                htmlFor="freelancer_name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Your Name
              </label>
              <input
                type="text"
                id="freelancer_name"
                value={freelancerName}
                onChange={(e) => handleFreelancerNameChange(e.target.value)}
                placeholder="John Doe"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="freelancer_email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Business Email
              </label>
              <input
                type="email"
                id="freelancer_email"
                value={freelancerEmail}
                onChange={(e) => handleFreelancerEmailChange(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="address"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Business Address
              </label>
              <textarea
                id="address"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="123 Main St&#10;City, State 12345&#10;Country"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Appears on invoices and official documents
              </p>
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="website"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Website
              </label>
              <input
                type="url"
                id="website"
                value={website}
                onChange={(e) => handleWebsiteChange(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
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
                <option value="openai">OpenAI (gpt-5)</option>
                <option value="gemini">Google Gemini (gemini-2.5-flash)</option>
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
                  {openaiApiKey === MASK_VALUE ? (
                    <span className="text-green-600 dark:text-green-400">✓ API key is configured. Edit to update.</span>
                  ) : (
                    <>
                      Get your API key from{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        OpenAI Platform
                      </a>
                    </>
                  )}
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
                  {googleApiKey === MASK_VALUE ? (
                    <span className="text-green-600 dark:text-green-400">✓ API key is configured. Edit to update.</span>
                  ) : (
                    <>
                      Get your API key from{" "}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Google AI Studio
                      </a>
                    </>
                  )}
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
                {rescueTimeApiKey === MASK_VALUE ? (
                  <span className="text-green-600 dark:text-green-400">✓ API key is configured. Edit to update.</span>
                ) : (
                  <>
                    Get your API key from{" "}
                    <a
                      href="https://www.rescuetime.com/anapi/manage"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      RescueTime API Management
                    </a>
                  </>
                )}
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
                {jmapToken === MASK_VALUE ? (
                  <span className="text-green-600 dark:text-green-400">✓ API token is configured. Edit to update.</span>
                ) : (
                  <>
                    For Fastmail, create an app-specific password from your{" "}
                    <a
                      href="https://www.fastmail.com/settings/security/devicekeys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      security settings
                    </a>
                  </>
                )}
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
