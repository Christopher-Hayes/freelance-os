"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { toast, ApiKeyModal, ApiKeyList } from "@repo/ui";
import type { AiProvider, ApiKeyListItem } from "@freelance-os/types";
import { authFetch } from '@/lib/util';
import { fetchMailboxes } from '@/lib/jmap-actions';
import type { MailboxInfo } from '@/lib/jmap-provider';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { Check, ChevronsUpDown, X } from 'lucide-react';

const MASK_VALUE = "••••••••";
const APP_TITLE_RENAMES_STORAGE_KEY = "appTitleRenames";
const HIDDEN_APP_CLASSES_STORAGE_KEY = "hiddenAppClasses";
const JMAP_MAILBOXES_STORAGE_KEY = "jmapAvailableMailboxes";

const settingsSections = [
  { id: "freelancer-information", title: "Invoice Information" },
  { id: "display-options", title: "Display Options" },
  // { id: "app-name-display-overrides", title: "App Name Display Overrides" },
  // { id: "hidden-apps", title: "Hidden Apps" },
  { id: "integrations", title: "Integrations" },
  { id: "mcp-server", title: "MCP Server" },
  // { id: "ai-integration", title: "AI Integration" },
  // { id: "rescuetime-integration", title: "RescueTime Integration" },
  // { id: "email-integration-jmap", title: "Email Integration (JMAP)" },
  { id: "api-keys", title: "API Keys" },
] as const;

// Available permissions for admin API keys
const availablePermissions = [
  { id: "mcp:use", label: "Use MCP Server", description: "Allow this key to connect to the admin dashboard MCP server" },
  { id: "read:clients", label: "Read Clients", description: "View client information and details" },
  { id: "write:clients", label: "Write Clients", description: "Create and update client records" },
  { id: "read:projects", label: "Read Projects", description: "View project information and status" },
  { id: "write:projects", label: "Write Projects", description: "Create and update projects" },
  { id: "read:time", label: "Read Time Entries", description: "View time tracking data" },
  { id: "write:time", label: "Write Time Entries", description: "Create and update time entries" },
  { id: "read:invoices", label: "Read Invoices", description: "View invoice information" },
  { id: "write:invoices", label: "Write Invoices", description: "Create and update invoices" },
  { id: "read:activity", label: "Read Activity", description: "View captured activity sessions and supporting analytics data" },
  { id: "read:settings", label: "Read Settings", description: "View application settings" },
  { id: "write:settings", label: "Write Settings", description: "Update application settings, including MCP configuration" },
  { id: "read:jobs", label: "Read Jobs", description: "View background jobs and job history" },
  { id: "write:jobs", label: "Write Jobs", description: "Create and trigger background jobs" },
  { id: "read:api-keys", label: "Read API Keys", description: "List existing admin API keys" },
  { id: "write:api-keys", label: "Write API Keys", description: "Create or revoke admin API keys" },
  { id: "read:*", label: "Read Everything", description: "Grant all current and future read permissions" },
  { id: "write:*", label: "Write Everything", description: "Grant all current and future write permissions" },
  { id: "*", label: "Full Access", description: "Grant unrestricted access to all admin dashboard and MCP actions" },
];

function normalizeApiKeyListItem(raw: ApiKeyListItem & Record<string, unknown>): ApiKeyListItem {
  return {
    ...raw,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(raw.createdAt as string | number | Date).toISOString(),
    expiresAt:
      raw.expiresAt == null
        ? null
        : typeof raw.expiresAt === "string"
          ? raw.expiresAt
          : new Date(raw.expiresAt as string | number | Date).toISOString(),
    lastUsedAt:
      raw.lastUsedAt == null
        ? null
        : typeof raw.lastUsedAt === "string"
          ? raw.lastUsedAt
          : new Date(raw.lastUsedAt as string | number | Date).toISOString(),
  };
}

export default function SettingsPage() {
  const [rescueTimeApiKey, setRescueTimeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [appTitleRenamesText, setAppTitleRenamesText] = useState("");
  const [hiddenAppClassesText, setHiddenAppClassesText] = useState("");
  const [jmapToken, setJmapToken] = useState("");
  const [jmapUsername, setJmapUsername] = useState("");
  const [jmapHostname, setJmapHostname] = useState("");
  const [canReadMailbox, setCanReadMailbox] = useState(false);
  const [jmapAllowedMailboxes, setJmapAllowedMailboxes] = useState<string[]>([]);
  const [availableMailboxes, setAvailableMailboxes] = useState<MailboxInfo[]>([]);
  const [loadingMailboxes, setLoadingMailboxes] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [gitlabToken, setGitlabToken] = useState("");
  const [gitlabUsername, setGitlabUsername] = useState("");
  const [gitlabUrl, setGitlabUrl] = useState("");
  const [codebergToken, setCodebergToken] = useState("");
  const [codebergUsername, setCodebergUsername] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerEmail, setFreelancerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  // API Keys state
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([]);

  // Track which sensitive fields have been modified by the user
  // This prevents auto-saving masked placeholder values
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());

  // Debounce timers for each field
  const rescueTimeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const openaiTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const googleTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const appTitleRenamesTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const hiddenAppClassesTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapHostnameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const githubTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const githubUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const gitlabTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const gitlabUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const gitlabUrlTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const codebergTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const codebergUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const companyNameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const freelancerNameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const freelancerEmailTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const addressTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const phoneTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const websiteTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    fetchSettings();
    fetchApiKeys();
    hydrateStoredMailboxes();
  }, []);

  const persistAppTitleRenames = (entries: string[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(APP_TITLE_RENAMES_STORAGE_KEY, JSON.stringify(entries));
  };

  const persistHiddenAppClasses = (entries: string[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(HIDDEN_APP_CLASSES_STORAGE_KEY, JSON.stringify(entries));
  };

  const persistAvailableMailboxes = (mailboxes: MailboxInfo[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(JMAP_MAILBOXES_STORAGE_KEY, JSON.stringify(mailboxes));
  };

  const hydrateStoredMailboxes = () => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(JMAP_MAILBOXES_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setAvailableMailboxes(parsed as MailboxInfo[]);
      }
    } catch (error) {
      console.error("Error hydrating stored mailboxes:", error);
      window.localStorage.removeItem(JMAP_MAILBOXES_STORAGE_KEY);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await authFetch("/api/settings/all");
      if (response.ok) {
        const data = await response.json();
        // Sensitive fields will be masked (••••••••) if they exist
        setRescueTimeApiKey(data.rescuetimeKey || "");
        setOpenaiApiKey(data.openaiKey || "");
        setGoogleApiKey(data.googleApiKey || "");
        setAiProvider(data.aiProvider || "openai");
        const appTitleRenames = Array.isArray(data.appTitleRenames) ? data.appTitleRenames : [];
        setAppTitleRenamesText(appTitleRenames.join("\n"));
        persistAppTitleRenames(appTitleRenames);
        const hiddenAppClasses = Array.isArray(data.hiddenAppClasses) ? data.hiddenAppClasses : [];
        setHiddenAppClassesText(hiddenAppClasses.join("\n"));
        persistHiddenAppClasses(hiddenAppClasses);
        setJmapToken(data.jmapToken || "");
        setCanReadMailbox(data.canReadMailbox || false);
        setJmapAllowedMailboxes(data.jmapAllowedMailboxes || []);
        // Non-sensitive fields
        setJmapUsername(data.jmapUsername || "");
        setJmapHostname(data.jmapHostname || "");
        setGithubToken(data.githubToken || "");
        setGithubUsername(data.githubUsername || "");
        setGitlabToken(data.gitlabToken || "");
        setGitlabUsername(data.gitlabUsername || "");
        setGitlabUrl(data.gitlabUrl || "");
        setCodebergToken(data.codebergToken || "");
        setCodebergUsername(data.codebergUsername || "");
        setCompanyName(data.companyName || "");
        setFreelancerName(data.freelancerName || "");
        setFreelancerEmail(data.freelancerEmail || "");
        setAddress(data.address || "");
        setPhone(data.phone || "");
        setWebsite(data.website || "");
  setMcpEnabled(data.mcpEnabled ?? true);

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
      const response = await authFetch("/api/settings/all", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: value,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save setting");
      }

      if (field === "appTitleRenames") {
        const payload = typeof value === "string" ? JSON.parse(value) : [];
        persistAppTitleRenames(Array.isArray(payload) ? payload : []);
      }

      if (field === "hiddenAppClasses") {
        const payload = typeof value === "string" ? JSON.parse(value) : [];
        persistHiddenAppClasses(Array.isArray(payload) ? payload : []);
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

  const handleAppTitleRenamesChange = (value: string) => {
    setAppTitleRenamesText(value);

    if (appTitleRenamesTimerRef.current) {
      clearTimeout(appTitleRenamesTimerRef.current);
    }

    appTitleRenamesTimerRef.current = setTimeout(() => {
      const lines = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      saveSetting("appTitleRenames", JSON.stringify(lines));
    }, 1000);
  };

  const handleHiddenAppClassesChange = (value: string) => {
    setHiddenAppClassesText(value);

    if (hiddenAppClassesTimerRef.current) {
      clearTimeout(hiddenAppClassesTimerRef.current);
    }

    hiddenAppClassesTimerRef.current = setTimeout(() => {
      const lines = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      saveSetting("hiddenAppClasses", JSON.stringify(lines));
    }, 1000);
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

  const handleJmapEnabledChange = (checked: boolean) => {
    setCanReadMailbox(checked);
    saveSetting("canReadMailbox", String(checked)); // Convert boolean to string for API
  };

  const handleJmapAllowedMailboxesChange = (mailboxIds: string[]) => {
    setJmapAllowedMailboxes(mailboxIds);
    saveSetting("jmapAllowedMailboxes", JSON.stringify(mailboxIds));
  };

  const handleRefreshMailboxes = async () => {
    setLoadingMailboxes(true);
    try {
      const mailboxes = await fetchMailboxes();
      setAvailableMailboxes(mailboxes);
      persistAvailableMailboxes(mailboxes);
      if (mailboxes.length === 0) {
        toast.error("No mailboxes found. Please check your JMAP configuration.");
      } else {
        toast.success(`Found ${mailboxes.length} mailbox(es)`);
      }
    } catch (error) {
      console.error("Error fetching mailboxes:", error);
      toast.error("Failed to fetch mailboxes");
    } finally {
      setLoadingMailboxes(false);
    }
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

  // ── Git Forge handlers ──

  const handleGithubTokenChange = (value: string) => {
    setGithubToken(value);
    setModifiedFields(prev => new Set(prev).add("githubToken"));

    if (githubTokenTimerRef.current) {
      clearTimeout(githubTokenTimerRef.current);
    }

    githubTokenTimerRef.current = setTimeout(() => {
      if (value !== MASK_VALUE) {
        saveSetting("githubToken", value);
      }
    }, 1000);
  };

  const handleGithubUsernameChange = (value: string) => {
    setGithubUsername(value);

    if (githubUsernameTimerRef.current) {
      clearTimeout(githubUsernameTimerRef.current);
    }

    githubUsernameTimerRef.current = setTimeout(() => {
      saveSetting("githubUsername", value);
    }, 1000);
  };

  const handleGitlabTokenChange = (value: string) => {
    setGitlabToken(value);
    setModifiedFields(prev => new Set(prev).add("gitlabToken"));

    if (gitlabTokenTimerRef.current) {
      clearTimeout(gitlabTokenTimerRef.current);
    }

    gitlabTokenTimerRef.current = setTimeout(() => {
      if (value !== MASK_VALUE) {
        saveSetting("gitlabToken", value);
      }
    }, 1000);
  };

  const handleGitlabUsernameChange = (value: string) => {
    setGitlabUsername(value);

    if (gitlabUsernameTimerRef.current) {
      clearTimeout(gitlabUsernameTimerRef.current);
    }

    gitlabUsernameTimerRef.current = setTimeout(() => {
      saveSetting("gitlabUsername", value);
    }, 1000);
  };

  const handleGitlabUrlChange = (value: string) => {
    setGitlabUrl(value);

    if (gitlabUrlTimerRef.current) {
      clearTimeout(gitlabUrlTimerRef.current);
    }

    gitlabUrlTimerRef.current = setTimeout(() => {
      saveSetting("gitlabUrl", value);
    }, 1000);
  };

  const handleCodebergTokenChange = (value: string) => {
    setCodebergToken(value);
    setModifiedFields(prev => new Set(prev).add("codebergToken"));

    if (codebergTokenTimerRef.current) {
      clearTimeout(codebergTokenTimerRef.current);
    }

    codebergTokenTimerRef.current = setTimeout(() => {
      if (value !== MASK_VALUE) {
        saveSetting("codebergToken", value);
      }
    }, 1000);
  };

  const handleCodebergUsernameChange = (value: string) => {
    setCodebergUsername(value);

    if (codebergUsernameTimerRef.current) {
      clearTimeout(codebergUsernameTimerRef.current);
    }

    codebergUsernameTimerRef.current = setTimeout(() => {
      saveSetting("codebergUsername", value);
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

  const handleMcpEnabledChange = (checked: boolean) => {
    setMcpEnabled(checked);
    saveSetting("mcpEnabled", String(checked));
  };

  const fetchApiKeys = async () => {
    try {
      const response = await authFetch("/api/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(Array.isArray(data) ? data.map((item) => normalizeApiKeyListItem(item)) : []);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    }
  };

  const handleGenerateApiKey = async (
    name: string,
    permissions: string[],
    expiresAt?: Date
  ) => {
    try {
      const response = await authFetch("/api/api-keys", {
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
      const response = await authFetch(`/api/api-keys/${id}`, {
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Configure your integrations and preferences. Changes are saved automatically.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="lg:sticky lg:top-6 lg:w-72 lg:shrink-0">
          <nav className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Jump to section
            </h2>
            <ul className="mt-4 space-y-1">
              {settingsSections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          <section
            id="freelancer-information"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
          >
            <header className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Invoice Information
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                This information will be used in your invoices and official documents.
              </p>
            </header>

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
          </section>

          <section id="display-options" className="space-y-6 scroll-mt-24">
            <header>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Display Options
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Customize how apps display and which apps are visible.
              </p>
            </header>
            <section
              id="app-name-display-overrides"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
            >
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                App Name Display Overrides
              </h2>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="app_title_renames"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Custom App Name Renames
                  </label>
                  <textarea
                    id="app_title_renames"
                    value={appTitleRenamesText}
                    onChange={(e) => handleAppTitleRenamesChange(e.target.value)}
                    placeholder={"nautilus=Files\nfirefox_firefox=Firefox"}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    One rename per line using <code className="rounded bg-gray-100 dark:bg-gray-700 px-1 py-0.5">rawAppClass=Display Name</code>. These are cosmetic only and override the built-in formatting when present.
                  </p>
                </div>
              </div>
            </section>

            <section
              id="hidden-apps"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
            >
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Hidden Apps
              </h2>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="hidden_app_classes"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Hide App Classes From Timeline and Analytics
                  </label>
                  <textarea
                    id="hidden_app_classes"
                    value={hiddenAppClassesText}
                    onChange={(e) => handleHiddenAppClassesChange(e.target.value)}
                    placeholder={"Easyeffects\nSteam"}
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                  />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    One raw app class per line. Hidden apps won&apos;t appear in the day timeline or analytics stats, but the underlying activity data remains unchanged.
                  </p>
                </div>
              </div>
            </section>
          </section>

          <section
            id="integrations"
            className="space-y-6 scroll-mt-24"
          >
            <header>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Integrations
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Connect external services used for AI, time tracking, and email context.
              </p>
            </header>

            <section
              id="ai-integration"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
            >
              <header className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  AI Integration
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Use AI to automatically categorize app activity into project entries, generate work summaries, and more.
                </p>
              </header>

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
                    <option value="openai">OpenAI (gpt-5.4)</option>
                    <option value="gemini">Google Gemini (gemini-2.5-pro)</option>
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
            </section>

            <section
              id="rescuetime-integration"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
            >
              <header className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  RescueTime Integration
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Automatically populate your App Activity with data from RescueTime.
                </p>
              </header>

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
            </section>

            <section
              id="email-integration-jmap"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
            >
              <header className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Email Integration (JMAP)
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Cross reference your emails with clients to more accurately categorize and summarize your work. This integration uses JMAP, a modern email protocol, your email provider must support JMAP for this to work (e.g. Fastmail, iCloud, Gmail with a JMAP proxy).
                </p>
              </header>

              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="can_read_mailbox"
                      type="checkbox"
                      checked={canReadMailbox}
                      onChange={(e) => handleJmapEnabledChange(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  <div className="ml-3">
                    <label htmlFor="can_read_mailbox" className="font-medium text-gray-700 dark:text-gray-300">
                      Allow AI to read emails via JMAP
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      When generating weekly summaries, AI can search your emails for additional context about client requests and deliverables. This is disabled by default for privacy.
                    </p>
                  </div>
                </div>

                {canReadMailbox && (
                  <>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                      <div className="flex items-start">
                        <div className="shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Privacy Warning
                          </h3>
                          <div className="mt-2 flex flex-col gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                            <p>
                              When enabled, AI will be able to search your email inbox to enrich weekly summaries with context from client communications. This may expose sensitive or private information to the AI provider.
                            </p>
                            <p>
                              In the field below, you can restrict which folders AI is allowed to access. Leaving it empty will allow AI to search all email folders.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          Restrict JMAP to Folders (Optional)
                        </label>
                        <button
                          type="button"
                          onClick={handleRefreshMailboxes}
                          disabled={loadingMailboxes}
                          className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loadingMailboxes ? "Loading..." : "Refresh Mailboxes"}
                        </button>
                      </div>

                      <Combobox
                        multiple
                        by="id"
                        value={availableMailboxes.filter(m => jmapAllowedMailboxes.includes(m.id))}
                        onChange={(selected: MailboxInfo[]) => {
                          handleJmapAllowedMailboxesChange(selected.map(m => m.id));
                        }}
                      >
                        <div className="relative">
                          <ComboboxButton className="relative w-full cursor-default rounded-md bg-white dark:bg-gray-700 py-2 pl-3 pr-10 text-left border border-gray-300 dark:border-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[42px]">
                            <span className="flex flex-wrap gap-1">
                              {jmapAllowedMailboxes.length === 0 ? (
                                <span className="text-gray-500 dark:text-gray-400">
                                  {availableMailboxes.length === 0 ? "Click 'Refresh Mailboxes' first" : "Select folders to restrict (or leave empty for all)"}
                                </span>
                              ) : (
                                availableMailboxes
                                  .filter(m => jmapAllowedMailboxes.includes(m.id))
                                  .map(mailbox => (
                                    <span
                                      key={mailbox.id}
                                      className="inline-flex items-center gap-1 rounded bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200"
                                    >
                                      {mailbox.name}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleJmapAllowedMailboxesChange(
                                            jmapAllowedMailboxes.filter(id => id !== mailbox.id)
                                          );
                                        }}
                                        className="hover:text-blue-900 dark:hover:text-blue-100"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))
                              )}
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronsUpDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                            </span>
                          </ComboboxButton>

                          <ComboboxOptions
                            className="absolute z-10 mt-1 max-h-84 w-full overflow-auto rounded-md bg-white dark:bg-gray-700 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-200 dark:border-gray-600"
                          >
                            {availableMailboxes.length === 0 ? (
                              <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                Click "Refresh Mailboxes" to load available folders
                              </div>
                            ) : (
                              availableMailboxes
                                .sort((a, b) => b.totalEmails - a.totalEmails)
                                .sort((a, b) => {
                                  const aSelected = jmapAllowedMailboxes.includes(a.id) ? 1 : 0;
                                  const bSelected = jmapAllowedMailboxes.includes(b.id) ? 1 : 0;
                                  return bSelected - aSelected;
                                })
                                .map((mailbox) => (
                                  <ComboboxOption
                                    key={mailbox.id}
                                    value={mailbox}
                                    className="group relative cursor-pointer select-none py-2 pl-10 pr-4 text-gray-900 dark:text-gray-100 data-focus:bg-blue-100 dark:data-focus:bg-blue-900 data-focus:text-blue-900 dark:data-focus:text-blue-100"
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span className="block truncate font-normal group-data-selected:font-medium">
                                          {mailbox.name} {mailbox.role ? `(${mailbox.role})` : ''} - {mailbox.totalEmails} emails
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600 dark:text-blue-400">
                                            <Check className="h-4 w-4" aria-hidden="true" />
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </ComboboxOption>
                                ))
                            )}
                          </ComboboxOptions>
                        </div>
                      </Combobox>

                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {jmapAllowedMailboxes.length === 0
                          ? "AI can search all mailboxes by default. Select specific folders to restrict access."
                          : `AI can only search ${jmapAllowedMailboxes.length} selected folder(s). Click a tag to remove it.`
                        }
                      </p>
                    </div>
                  </>
                )}

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
                    Your email address for JMAP authentication
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
                    JMAP server hostname
                  </p>
                </div>
              </div>
            </section>

            <section
              id="git-forges"
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
            >
              <header className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Git Forges
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Connect GitHub, GitLab, and/or Codeberg so the AI can cross-reference your commit history when categorizing work and generating time entries. Only configure the forges you use.
                </p>
              </header>

              <div className="space-y-6">
                {/* GitHub */}
                <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                  <legend className="text-sm font-semibold text-gray-800 dark:text-gray-200 px-1">GitHub</legend>
                  <div>
                    <label htmlFor="github_username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      id="github_username"
                      value={githubUsername}
                      onChange={(e) => handleGithubUsernameChange(e.target.value)}
                      placeholder="octocat"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="github_token" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Personal Access Token
                    </label>
                    <input
                      type="password"
                      id="github_token"
                      value={githubToken}
                      onChange={(e) => handleGithubTokenChange(e.target.value)}
                      placeholder="ghp_..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {githubToken === MASK_VALUE ? (
                        <span className="text-green-600 dark:text-green-400">✓ Token is configured. Edit to update.</span>
                      ) : (
                        <>
                          Create a token with <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">repo</code> (read) scope from{" "}
                          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            GitHub Settings
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </fieldset>

                {/* GitLab */}
                <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                  <legend className="text-sm font-semibold text-gray-800 dark:text-gray-200 px-1">GitLab</legend>
                  <div>
                    <label htmlFor="gitlab_username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      id="gitlab_username"
                      value={gitlabUsername}
                      onChange={(e) => handleGitlabUsernameChange(e.target.value)}
                      placeholder="gitlab-user"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="gitlab_token" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Personal Access Token
                    </label>
                    <input
                      type="password"
                      id="gitlab_token"
                      value={gitlabToken}
                      onChange={(e) => handleGitlabTokenChange(e.target.value)}
                      placeholder="glpat-..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {gitlabToken === MASK_VALUE ? (
                        <span className="text-green-600 dark:text-green-400">✓ Token is configured. Edit to update.</span>
                      ) : (
                        <>
                          Create a token with <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">read_api</code> scope from{" "}
                          <a href="https://gitlab.com/-/user_settings/personal_access_tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            GitLab Settings
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="gitlab_url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      GitLab URL (optional)
                    </label>
                    <input
                      type="text"
                      id="gitlab_url"
                      value={gitlabUrl}
                      onChange={(e) => handleGitlabUrlChange(e.target.value)}
                      placeholder="https://gitlab.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Leave blank to use gitlab.com. Set this for self-hosted GitLab instances.
                    </p>
                  </div>
                </fieldset>

                {/* Codeberg */}
                <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                  <legend className="text-sm font-semibold text-gray-800 dark:text-gray-200 px-1">Codeberg</legend>
                  <div>
                    <label htmlFor="codeberg_username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      id="codeberg_username"
                      value={codebergUsername}
                      onChange={(e) => handleCodebergUsernameChange(e.target.value)}
                      placeholder="codeberg-user"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="codeberg_token" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      API Token
                    </label>
                    <input
                      type="password"
                      id="codeberg_token"
                      value={codebergToken}
                      onChange={(e) => handleCodebergTokenChange(e.target.value)}
                      placeholder="Enter your Codeberg API token"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {codebergToken === MASK_VALUE ? (
                        <span className="text-green-600 dark:text-green-400">✓ Token is configured. Edit to update.</span>
                      ) : (
                        <>
                          Create a token from{" "}
                          <a href="https://codeberg.org/user/settings/applications" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            Codeberg Settings → Applications
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </fieldset>
              </div>
            </section>
          </section>

          <section
            id="mcp-server"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
          >
            <header className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                MCP Server
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Expose the admin dashboard as a local MCP server for ChatGPT, Copilot, and other compatible tools.
              </p>
            </header>

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="pr-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Enable MCP endpoint
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    When enabled, the dashboard serves MCP tools at <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-900">/api/mcp</code>. Disable this to immediately block MCP access without revoking your API keys.
                  </p>
                </div>

                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={mcpEnabled}
                    onChange={(e) => handleMcpEnabledChange(e.target.checked)}
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 dark:bg-gray-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5"></div>
                </label>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-100">
                <p className="font-medium">API keys must include MCP access</p>
                <p className="mt-1">
                  To use the MCP server, generate an admin API key with <code className="rounded bg-white/70 px-1 py-0.5 text-xs dark:bg-gray-900/60">mcp:use</code> plus whichever read/write scopes you want the AI to have.
                </p>
                <div className="mt-3">
                  <Link
                    href="/mcp"
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    View MCP setup guide
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section
            id="api-keys"
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-24 dark:border-gray-700 dark:bg-gray-800"
          >
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

            <ApiKeyList apiKeys={apiKeys} onRevoke={handleRevokeApiKey} />
          </section>
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
