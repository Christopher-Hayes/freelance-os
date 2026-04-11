"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Badge, Button, Input, Page, PageContent, PageHeader, PageLoading, Section, Select, Surface, Textarea, toast, ApiKeyModal, ApiKeyList } from "@repo/ui";
import type { AiProvider, ApiKeyListItem } from "@freelance-os/types";
import { authFetch, syncAppDataToLocalStorage } from '@/lib/util';
import { fetchMailboxes } from '@/lib/jmap-actions';
import { fetchCalendars } from '@/lib/webdav-actions';
import type { MailboxInfo } from '@/lib/jmap-provider';
import type { CalendarInfo } from '@/lib/webdav-provider';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { AlertTriangle, Check, ChevronsUpDown, Eye, EyeOff, Pencil, Plus, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { RescueTimeArchiveUpload } from '@/components/RescueTimeArchiveUpload';

const MASK_VALUE = "••••••••";
const JMAP_MAILBOXES_STORAGE_KEY = "jmapAvailableMailboxes";
const WEBDAV_CALENDARS_STORAGE_KEY = "webdavAvailableCalendars";

type AppRecord = {
  appClass: string;
  displayName: string | null;
  hidden: boolean;
  suggestedName: string | null;
  suggestNameDismissed: boolean;
};

const settingsSections = [
  { id: "freelancer-information", title: "Invoice Information" },
  { id: "display-options", title: "Display Options" },
  // { id: "app-name-display-overrides", title: "App Name Display Overrides" },
  // { id: "hidden-apps", title: "Hidden Apps" },
  { id: "authentication", title: "Authentication" },
  { id: "integrations", title: "Integrations" },
  { id: "mcp-server", title: "MCP Server" },
  { id: "coding-stats-card", title: "Coding Stats Card" },
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

function SettingsSectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </header>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
      {children}
    </code>
  );
}

function PrivacyCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Privacy Warning</h3>
          <div className="mt-2 flex flex-col gap-2 text-sm text-amber-800 dark:text-amber-200">{children}</div>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Surface id={id} className="scroll-mt-24">
      <SettingsSectionHeader title={title} description={description} />
      <div className="space-y-4">{children}</div>
    </Surface>
  );
}

function IntegrationProviderCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-900/40">
      <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</legend>
      {children}
    </fieldset>
  );
}

function ToggleRow({
  id,
  checked,
  onChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <div className="pr-4">
        <label htmlFor={id} className="text-sm font-medium text-gray-900 dark:text-white">
          {title}
        </label>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>

      <label htmlFor={id} className="relative inline-flex cursor-pointer items-center">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 dark:bg-gray-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
      </label>
    </div>
  );
}

function MultiSelectShell({
  label,
  action,
  helperText,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  helperText: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {action}
      </div>
      {children}
      <p className="text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
    </div>
  );
}

function SelectionChip({
  label,
  onRemove,
  leading,
}: {
  label: React.ReactNode;
  onRemove: () => void;
  leading?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-900 dark:text-blue-200">
      {leading}
      <span>{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="hover:text-blue-900 dark:hover:text-blue-100"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function MultiSelectTrigger({
  emptyText,
  children,
}: {
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <ComboboxButton className="relative min-h-[46px] w-full cursor-default rounded-xl border border-slate-300 bg-white py-2.5 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-white/10 dark:bg-slate-900">
      <span className="flex flex-wrap gap-1">{children ?? <span className="text-gray-500 dark:text-gray-400">{emptyText}</span>}</span>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        <ChevronsUpDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
      </span>
    </ComboboxButton>
  );
}

function MultiSelectOptions({ children }: { children: React.ReactNode }) {
  return (
    <ComboboxOptions className="absolute z-10 mt-2 max-h-84 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 focus:outline-none dark:border-white/10 dark:bg-slate-900">
      {children}
    </ComboboxOptions>
  );
}

export default function SettingsPage() {
  const [rescueTimeApiKey, setRescueTimeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [appRecords, setAppRecords] = useState<AppRecord[]>([]);
  const [newRenameAppClass, setNewRenameAppClass] = useState("");
  const [newRenameDisplayName, setNewRenameDisplayName] = useState("");
  const [editingRename, setEditingRename] = useState<string | null>(null);
  const [editingRenameValue, setEditingRenameValue] = useState("");
  const [newHiddenAppClass, setNewHiddenAppClass] = useState("");
  const [jmapToken, setJmapToken] = useState("");
  const [jmapUsername, setJmapUsername] = useState("");
  const [jmapHostname, setJmapHostname] = useState("");
  const [canReadMailbox, setCanReadMailbox] = useState(false);
  const [jmapAllowedMailboxes, setJmapAllowedMailboxes] = useState<string[]>([]);
  const [availableMailboxes, setAvailableMailboxes] = useState<MailboxInfo[]>([]);
  const [loadingMailboxes, setLoadingMailboxes] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUsername, setWebdavUsername] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [canReadCalendar, setCanReadCalendar] = useState(false);
  const [webdavAllowedCalendars, setWebdavAllowedCalendars] = useState<string[]>([]);
  const [availableCalendars, setAvailableCalendars] = useState<CalendarInfo[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
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
  const [codingStatsEnabled, setCodingStatsEnabled] = useState(false);
  const [codingStatsRegenerating, setCodingStatsRegenerating] = useState(false);
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
  const jmapTokenTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const jmapHostnameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const webdavUrlTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const webdavUsernameTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const webdavPasswordTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
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
    fetchAppRecords();
    fetchApiKeys();
    hydrateStoredMailboxes();
    hydrateStoredCalendars();
  }, []);

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

  const persistAvailableCalendars = (calendars: CalendarInfo[]) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(WEBDAV_CALENDARS_STORAGE_KEY, JSON.stringify(calendars));
  };

  const hydrateStoredCalendars = () => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(WEBDAV_CALENDARS_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setAvailableCalendars(parsed as CalendarInfo[]);
      }
    } catch (error) {
      console.error("Error hydrating stored calendars:", error);
      window.localStorage.removeItem(WEBDAV_CALENDARS_STORAGE_KEY);
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
        setJmapToken(data.jmapToken || "");
        setCanReadMailbox(data.canReadMailbox || false);
        setJmapAllowedMailboxes(data.jmapAllowedMailboxes || []);
        // Non-sensitive fields
        setJmapUsername(data.jmapUsername || "");
        setJmapHostname(data.jmapHostname || "");
        setWebdavUrl(data.webdavUrl || "");
        setWebdavUsername(data.webdavUsername || "");
        setWebdavPassword(data.webdavPassword || "");
        setCanReadCalendar(data.canReadCalendar || false);
        setWebdavAllowedCalendars(data.webdavAllowedCalendars || []);
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
  setCodingStatsEnabled(data.codingStatsEnabled ?? false);

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

      toast.success("Saved successfully");
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error(`Failed to save ${field}`);
    }
  };

  // ── App record handlers (renames + hidden) ──

  const fetchAppRecords = async () => {
    try {
      const response = await authFetch("/api/apps");
      if (response.ok) {
        const data = await response.json();
        setAppRecords(data.apps ?? []);
      }
    } catch (error) {
      console.error("Error fetching app records:", error);
    }
  };

  const upsertApp = async (appClass: string, data: Record<string, unknown>) => {
    const response = await authFetch(`/api/apps/${encodeURIComponent(appClass)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to update app");
    }

    return response.json();
  };

  const handleAddRename = async () => {
    const trimmedClass = newRenameAppClass.trim();
    const trimmedName = newRenameDisplayName.trim();
    if (!trimmedClass || !trimmedName) return;

    try {
      await upsertApp(trimmedClass, { displayName: trimmedName });
      await fetchAppRecords();
      await syncAppDataToLocalStorage();
      setNewRenameAppClass("");
      setNewRenameDisplayName("");
      toast.success(`Renamed ${trimmedClass} → ${trimmedName}`);
    } catch (error) {
      console.error("Error adding rename:", error);
      toast.error("Failed to save rename");
    }
  };

  const handleSaveEditRename = async (appClass: string) => {
    const trimmedName = editingRenameValue.trim();

    try {
      await upsertApp(appClass, { displayName: trimmedName || null });
      await fetchAppRecords();
      await syncAppDataToLocalStorage();
      setEditingRename(null);
      toast.success(trimmedName ? `Updated rename for ${appClass}` : `Removed rename for ${appClass}`);
    } catch (error) {
      console.error("Error updating rename:", error);
      toast.error("Failed to update rename");
    }
  };

  const handleRemoveRename = async (appClass: string) => {
    try {
      await upsertApp(appClass, { displayName: null });
      await fetchAppRecords();
      await syncAppDataToLocalStorage();
      toast.success(`Removed rename for ${appClass}`);
    } catch (error) {
      console.error("Error removing rename:", error);
      toast.error("Failed to remove rename");
    }
  };

  const handleAddHiddenApp = async () => {
    const trimmedClass = newHiddenAppClass.trim();
    if (!trimmedClass) return;

    try {
      await upsertApp(trimmedClass, { hidden: true });
      await fetchAppRecords();
      await syncAppDataToLocalStorage();
      setNewHiddenAppClass("");
      toast.success(`Hid ${trimmedClass}`);
    } catch (error) {
      console.error("Error hiding app:", error);
      toast.error("Failed to hide app");
    }
  };

  const handleUnhideApp = async (appClass: string) => {
    try {
      await upsertApp(appClass, { hidden: false });
      await fetchAppRecords();
      await syncAppDataToLocalStorage();
      toast.success(`Unhid ${appClass}`);
    } catch (error) {
      console.error("Error unhiding app:", error);
      toast.error("Failed to unhide app");
    }
  };

  const handleRescueTimeChange = (value: string) => {
    setRescueTimeApiKey(value);
    setModifiedFields(prev => new Set(prev).add("rescuetimeKey"));

    if (rescueTimeTimerRef.current) {
      clearTimeout(rescueTimeTimerRef.current);
    }

    rescueTimeTimerRef.current = setTimeout(() => {
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

  // ── WebDAV / CalDAV handlers ──

  const handleWebdavUrlChange = (value: string) => {
    setWebdavUrl(value);

    if (webdavUrlTimerRef.current) {
      clearTimeout(webdavUrlTimerRef.current);
    }

    webdavUrlTimerRef.current = setTimeout(() => {
      saveSetting("webdavUrl", value);
    }, 1000);
  };

  const handleWebdavUsernameChange = (value: string) => {
    setWebdavUsername(value);

    if (webdavUsernameTimerRef.current) {
      clearTimeout(webdavUsernameTimerRef.current);
    }

    webdavUsernameTimerRef.current = setTimeout(() => {
      saveSetting("webdavUsername", value);
    }, 1000);
  };

  const handleWebdavPasswordChange = (value: string) => {
    setWebdavPassword(value);
    setModifiedFields(prev => new Set(prev).add("webdavPassword"));

    if (webdavPasswordTimerRef.current) {
      clearTimeout(webdavPasswordTimerRef.current);
    }

    webdavPasswordTimerRef.current = setTimeout(() => {
      if (value !== MASK_VALUE) {
        saveSetting("webdavPassword", value);
      }
    }, 1000);
  };

  const handleCalendarEnabledChange = (checked: boolean) => {
    setCanReadCalendar(checked);
    saveSetting("canReadCalendar", String(checked));
  };

  const handleWebdavAllowedCalendarsChange = (calendarUrls: string[]) => {
    setWebdavAllowedCalendars(calendarUrls);
    saveSetting("webdavAllowedCalendars", JSON.stringify(calendarUrls));
  };

  const handleRefreshCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const calendars = await fetchCalendars();
      setAvailableCalendars(calendars);
      persistAvailableCalendars(calendars);
      if (calendars.length === 0) {
        toast.error("No calendars found. Please check your CalDAV configuration.");
      } else {
        toast.success(`Found ${calendars.length} calendar(s)`);
      }
    } catch (error) {
      console.error("Error fetching calendars:", error);
      toast.error("Failed to fetch calendars");
    } finally {
      setLoadingCalendars(false);
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

  const handleCodingStatsEnabledChange = (checked: boolean) => {
    setCodingStatsEnabled(checked);
    saveSetting("codingStatsEnabled", String(checked));
  };

  const handleRegenerateCodingStats = async () => {
    setCodingStatsRegenerating(true);
    try {
      const response = await authFetch("/api/coding-stats/json", { method: "POST" });
      if (response.ok) {
        toast.success("Coding stats card regenerated");
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to regenerate");
      }
    } catch (error) {
      console.error("Error regenerating coding stats:", error);
      toast.error("Failed to regenerate coding stats");
    } finally {
      setCodingStatsRegenerating(false);
    }
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
    return <PageLoading title="Loading settings" message="Pulling your integrations, billing defaults, and admin preferences." />;
  }

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <PageHeader
            eyebrow="Admin dashboard"
            title="Settings"
            description="Configure billing defaults, integrations, and admin capabilities. Changes continue to save automatically as you work."
            actions={
              <Badge variant="subtle" size="sm">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Auto-save enabled
              </Badge>
            }
          />

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="lg:sticky lg:top-6 lg:w-72 lg:shrink-0">
          <Surface className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              <Settings2 className="h-4 w-4" />
              Jump to section
            </div>
            <ul className="mt-4 space-y-1">
              {settingsSections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-xl px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </Surface>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          <Surface id="freelancer-information" className="scroll-mt-24">
            <SettingsSectionHeader
              title="Invoice Information"
              description="This information will be used in your invoices and official documents."
            />

            <div className="space-y-4">
              <Input
                type="text"
                id="company_name"
                label="Company/Business Name"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                placeholder="Your Company Name"
                helperText="Used in invoices and email communications"
              />

              <Input
                type="text"
                id="freelancer_name"
                label="Your Name"
                value={freelancerName}
                onChange={(e) => handleFreelancerNameChange(e.target.value)}
                placeholder="John Doe"
              />

              <Input
                type="email"
                id="freelancer_email"
                label="Business Email"
                value={freelancerEmail}
                onChange={(e) => handleFreelancerEmailChange(e.target.value)}
                placeholder="you@example.com"
              />

              <Textarea
                id="address"
                label="Business Address"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="123 Main St&#10;City, State 12345&#10;Country"
                rows={3}
                helperText="Appears on invoices and official documents"
              />

              <Input
                type="tel"
                id="phone"
                label="Phone Number"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="+1 (555) 123-4567"
              />

              <Input
                type="url"
                id="website"
                label="Website"
                value={website}
                onChange={(e) => handleWebsiteChange(e.target.value)}
                placeholder="https://yourwebsite.com"
              />
            </div>
          </Surface>

          <section id="display-options" className="space-y-6 scroll-mt-24">
            <SettingsSectionHeader
              title="Display Options"
              description="Customize how apps display and which apps are visible."
            />
            <Surface id="app-name-display-overrides" className="scroll-mt-24">
              <SettingsSectionHeader
                title="App Name Display Overrides"
                description="Set friendlier labels for raw app classes without changing the underlying activity data."
              />

              <div className="space-y-4">
                {appRecords.filter((app) => app.displayName).length > 0 ? (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
                    {appRecords
                      .filter((app) => app.displayName)
                      .map((app) => (
                        <div key={app.appClass} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">{app.appClass}</div>
                            {editingRename === app.appClass ? (
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingRenameValue}
                                  onChange={(e) => setEditingRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEditRename(app.appClass);
                                    if (e.key === "Escape") setEditingRename(null);
                                  }}
                                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:focus:border-blue-400"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveEditRename(app.appClass)}
                                  className="rounded-lg p-1.5 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                                  title="Save"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setEditingRename(null)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-sm font-medium text-slate-900 dark:text-white">{app.displayName}</div>
                            )}
                          </div>
                          {editingRename !== app.appClass && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingRename(app.appClass);
                                  setEditingRenameValue(app.displayName ?? "");
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveRename(app.appClass)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                title="Remove rename"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No custom renames yet. Add one below, or right-click an app in the timeline to rename it.
                  </p>
                )}

                <div className="flex items-end gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-white/20">
                  <div className="flex-1 space-y-1.5">
                    <label htmlFor="new_rename_appclass" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      App Class
                    </label>
                    <input
                      id="new_rename_appclass"
                      type="text"
                      value={newRenameAppClass}
                      onChange={(e) => setNewRenameAppClass(e.target.value)}
                      placeholder="nautilus"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label htmlFor="new_rename_displayname" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Display Name
                    </label>
                    <input
                      id="new_rename_displayname"
                      type="text"
                      value={newRenameDisplayName}
                      onChange={(e) => setNewRenameDisplayName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddRename();
                      }}
                      placeholder="Files"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400"
                    />
                  </div>
                  <Button
                    onClick={handleAddRename}
                    disabled={!newRenameAppClass.trim() || !newRenameDisplayName.trim()}
                    size="sm"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            </Surface>

            <Surface id="hidden-apps" className="scroll-mt-24">
              <SettingsSectionHeader
                title="Hidden Apps"
                description="Hide noisy apps from the timeline and analytics while preserving the original captured data."
              />

              <div className="space-y-4">
                {appRecords.filter((app) => app.hidden).length > 0 ? (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
                    {appRecords
                      .filter((app) => app.hidden)
                      .map((app) => (
                        <div key={app.appClass} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-sm font-mono text-slate-900 dark:text-white">{app.appClass}</div>
                            {app.displayName && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">Display name: {app.displayName}</div>
                            )}
                          </div>
                          <button
                            onClick={() => handleUnhideApp(app.appClass)}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-300"
                            title="Unhide"
                          >
                            <Eye className="h-4 w-4" />
                            Unhide
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No hidden apps. Right-click an app in the timeline to hide it.
                  </p>
                )}

                <div className="flex items-end gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-white/20">
                  <div className="flex-1 space-y-1.5">
                    <label htmlFor="new_hidden_appclass" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      App Class
                    </label>
                    <input
                      id="new_hidden_appclass"
                      type="text"
                      value={newHiddenAppClass}
                      onChange={(e) => setNewHiddenAppClass(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddHiddenApp();
                      }}
                      placeholder="Easyeffects"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/20 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400"
                    />
                  </div>
                  <Button
                    onClick={handleAddHiddenApp}
                    disabled={!newHiddenAppClass.trim()}
                    size="sm"
                  >
                    <EyeOff className="mr-1.5 h-4 w-4" />
                    Hide
                  </Button>
                </div>
              </div>
            </Surface>
          </section>

          <section
            id="authentication"
            className="space-y-6 scroll-mt-24"
          >
            <SettingsSectionHeader
              title="Authentication"
              description="Configure how users sign in to the admin dashboard and client portal."
            />

            <Surface className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Manage authentication providers, enable or disable sign-in methods, and configure provider settings.
              </p>
              <Link
                href="/settings/auth"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm font-medium"
              >
                <Settings2 className="h-4 w-4" />
                Manage Auth Providers
              </Link>
            </Surface>
          </section>

          <section
            id="integrations"
            className="space-y-6 scroll-mt-24"
          >
            <SettingsSectionHeader
              title="Integrations"
              description="Connect external services used for AI, time tracking, email context, calendar context, and code intelligence."
            />

            <Surface id="ai-integration" className="scroll-mt-24">
              <SettingsSectionHeader
                title="AI Integration"
                description="Use AI to automatically categorize app activity into project entries, generate work summaries, and more."
              />

              <div className="space-y-4">
                <Select
                  id="ai_provider"
                  label="AI Provider"
                  value={aiProvider}
                  onChange={(e) => handleAiProviderChange(e.target.value as AiProvider)}
                  helperText="Choose which AI provider to use for AI-powered features."
                >
                  <option value="openai">OpenAI (gpt-5.4)</option>
                  <option value="gemini">Google Gemini (gemini-2.5-pro)</option>
                </Select>

                {aiProvider === "openai" && (
                  <div className="space-y-2">
                    <Input
                      type="password"
                      id="openai_api_key"
                      label="OpenAI API Key"
                      value={openaiApiKey}
                      onChange={(e) => handleOpenaiChange(e.target.value)}
                      placeholder="sk-..."
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
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
                  <div className="space-y-2">
                    <Input
                      type="password"
                      id="google_api_key"
                      label="Google API Key"
                      value={googleApiKey}
                      onChange={(e) => handleGoogleChange(e.target.value)}
                      placeholder="Enter your Google API key"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
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
            </Surface>

            <Surface id="rescuetime-integration" className="scroll-mt-24">
              <SettingsSectionHeader
                title="RescueTime Integration"
                description="Automatically populate your App Activity with data from RescueTime."
              />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="password"
                    id="rescuetime_api_key"
                    label="Analytics API Key"
                    value={rescueTimeApiKey}
                    onChange={(e) => handleRescueTimeChange(e.target.value)}
                    placeholder="Enter your RescueTime Analytics API key"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {rescueTimeApiKey === MASK_VALUE ? (
                      <span className="text-green-600 dark:text-green-400">✓ Analytics API key is configured. Edit to update.</span>
                    ) : (
                      <>
                        Used for App Activity import. Get it from{" "}
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
                <RescueTimeArchiveUpload />
              </div>
            </Surface>

            <IntegrationCard
              id="email-integration-jmap"
              title="Email Integration (JMAP)"
              description="Cross reference your emails with clients to more accurately categorize and summarize your work. This integration uses JMAP, a modern email protocol, and depends on your provider offering JMAP access."
            >
              <ToggleRow
                id="can_read_mailbox"
                checked={canReadMailbox}
                onChange={handleJmapEnabledChange}
                title="Allow AI to read emails via JMAP"
                description="When generating weekly summaries, AI can search your emails for additional context about client requests and deliverables. This is disabled by default for privacy."
              />

                {canReadMailbox && (
                  <>
                    <PrivacyCallout>
                      <p>
                        When enabled, AI will be able to search your email inbox to enrich weekly summaries with context from client communications. This may expose sensitive or private information to the AI provider.
                      </p>
                      <p>
                        In the field below, you can restrict which folders AI is allowed to access. Leaving it empty will allow AI to search all email folders.
                      </p>
                    </PrivacyCallout>

                    <MultiSelectShell
                      label="Restrict JMAP to Folders (Optional)"
                      action={
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleRefreshMailboxes}
                          disabled={loadingMailboxes}
                        >
                          {loadingMailboxes ? "Loading..." : "Refresh Mailboxes"}
                        </Button>
                      }
                      helperText={
                        jmapAllowedMailboxes.length === 0
                          ? "AI can search all mailboxes by default. Select specific folders to restrict access."
                          : `AI can only search ${jmapAllowedMailboxes.length} selected folder(s). Click a tag to remove it.`
                      }
                    >

                      <Combobox
                        multiple
                        by="id"
                        value={availableMailboxes.filter(m => jmapAllowedMailboxes.includes(m.id))}
                        onChange={(selected: MailboxInfo[]) => {
                          handleJmapAllowedMailboxesChange(selected.map(m => m.id));
                        }}
                      >
                        <div className="relative">
                          <MultiSelectTrigger
                            emptyText={availableMailboxes.length === 0 ? "Click 'Refresh Mailboxes' first" : "Select folders to restrict (or leave empty for all)"}
                          >
                            {jmapAllowedMailboxes.length > 0
                              ? availableMailboxes
                                  .filter((m) => jmapAllowedMailboxes.includes(m.id))
                                  .map((mailbox) => (
                                    <SelectionChip
                                      key={mailbox.id}
                                      label={mailbox.name}
                                      onRemove={() =>
                                        handleJmapAllowedMailboxesChange(
                                          jmapAllowedMailboxes.filter((id) => id !== mailbox.id)
                                        )
                                      }
                                    />
                                  ))
                              : null}
                          </MultiSelectTrigger>

                          <MultiSelectOptions>
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
                                    className="group relative cursor-pointer select-none py-2 pl-10 pr-4 text-gray-900 data-focus:bg-blue-100 data-focus:text-blue-900 dark:text-gray-100 dark:data-focus:bg-blue-900 dark:data-focus:text-blue-100"
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
                          </MultiSelectOptions>
                        </div>
                      </Combobox>
                    </MultiSelectShell>
                  </>
                )}

                <div className="space-y-2">
                  <Input
                    type="password"
                    id="jmap_token"
                    label="JMAP API Token"
                    value={jmapToken}
                    onChange={(e) => handleJmapTokenChange(e.target.value)}
                    placeholder="Enter your JMAP API token or app password"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
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

                <Input
                  type="email"
                  id="jmap_username"
                  label="JMAP Username (Email)"
                  value={jmapUsername}
                  onChange={(e) => handleJmapUsernameChange(e.target.value)}
                  placeholder="sender@example.com"
                  helperText="Your email address for JMAP authentication"
                />

                <Input
                  type="text"
                  id="jmap_hostname"
                  label="JMAP Hostname"
                  value={jmapHostname}
                  onChange={(e) => handleJmapHostnameChange(e.target.value)}
                  placeholder="api.fastmail.com"
                  helperText="JMAP server hostname"
                />
            </IntegrationCard>

            <IntegrationCard
              id="calendar-integration-webdav"
              title="Calendar Integration (CalDAV)"
              description="Cross reference your calendar events with projects to more accurately categorize and summarize your work. This integration uses CalDAV (WebDAV), which is supported by most calendar services."
            >
              <ToggleRow
                id="can_read_calendar"
                checked={canReadCalendar}
                onChange={handleCalendarEnabledChange}
                title="Allow AI to read calendar events via CalDAV"
                description="When generating time entries and weekly summaries, AI can search your calendar for meetings and events that indicate project work. This is disabled by default for privacy."
              />

                {canReadCalendar && (
                  <>
                    <PrivacyCallout>
                      <p>
                        When enabled, AI will be able to search your calendar events to enrich time entries with context from meetings and appointments. This may expose sensitive or private information to the AI provider.
                      </p>
                      <p>
                        In the field below, you can restrict which calendars AI is allowed to access. Leaving it empty will allow AI to search all calendars.
                      </p>
                    </PrivacyCallout>

                    <MultiSelectShell
                      label="Restrict to Calendars (Optional)"
                      action={
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleRefreshCalendars}
                          disabled={loadingCalendars}
                        >
                          {loadingCalendars ? "Loading..." : "Refresh Calendars"}
                        </Button>
                      }
                      helperText={
                        webdavAllowedCalendars.length === 0
                          ? "AI can search all calendars by default. Select specific calendars to restrict access."
                          : `AI can only search ${webdavAllowedCalendars.length} selected calendar(s). Click a tag to remove it.`
                      }
                    >

                      <Combobox
                        multiple
                        by="url"
                        value={availableCalendars.filter(c => webdavAllowedCalendars.includes(c.url))}
                        onChange={(selected: CalendarInfo[]) => {
                          handleWebdavAllowedCalendarsChange(selected.map(c => c.url));
                        }}
                      >
                        <div className="relative">
                          <MultiSelectTrigger
                            emptyText={availableCalendars.length === 0 ? "Click 'Refresh Calendars' first" : "Select calendars to restrict (or leave empty for all)"}
                          >
                            {webdavAllowedCalendars.length > 0
                              ? availableCalendars
                                  .filter((c) => webdavAllowedCalendars.includes(c.url))
                                  .map((calendar) => (
                                    <SelectionChip
                                      key={calendar.url}
                                      label={calendar.displayName}
                                      leading={
                                        calendar.color ? (
                                          <span
                                            className="inline-block h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: calendar.color }}
                                          />
                                        ) : undefined
                                      }
                                      onRemove={() =>
                                        handleWebdavAllowedCalendarsChange(
                                          webdavAllowedCalendars.filter((url) => url !== calendar.url)
                                        )
                                      }
                                    />
                                  ))
                              : null}
                          </MultiSelectTrigger>

                          <MultiSelectOptions>
                            {availableCalendars.length === 0 ? (
                              <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                Click &quot;Refresh Calendars&quot; to load available calendars
                              </div>
                            ) : (
                              availableCalendars
                                .sort((a, b) => {
                                  const aSelected = webdavAllowedCalendars.includes(a.url) ? 1 : 0;
                                  const bSelected = webdavAllowedCalendars.includes(b.url) ? 1 : 0;
                                  return bSelected - aSelected;
                                })
                                .map((calendar) => (
                                  <ComboboxOption
                                    key={calendar.url}
                                    value={calendar}
                                    className="group relative cursor-pointer select-none py-2 pl-10 pr-4 text-gray-900 dark:text-gray-100 data-focus:bg-blue-100 dark:data-focus:bg-blue-900 data-focus:text-blue-900 dark:data-focus:text-blue-100"
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span className="flex items-center gap-2 truncate font-normal group-data-selected:font-medium">
                                          {calendar.color && (
                                            <span
                                              className="inline-block h-3 w-3 rounded-full shrink-0"
                                              style={{ backgroundColor: calendar.color }}
                                            />
                                          )}
                                          {calendar.displayName}
                                          {calendar.description && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                              — {calendar.description}
                                            </span>
                                          )}
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
                          </MultiSelectOptions>
                        </div>
                      </Combobox>
                    </MultiSelectShell>
                  </>
                )}

                <div className="space-y-2">
                  <Input
                    type="text"
                    id="webdav_url"
                    label="CalDAV Server URL"
                    value={webdavUrl}
                    onChange={(e) => handleWebdavUrlChange(e.target.value)}
                    placeholder="https://cloud.example.com/remote.php/dav"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    The CalDAV server URL. For Nextcloud: <InlineCode>https://your-server/remote.php/dav</InlineCode>, for Fastmail: <InlineCode>https://caldav.fastmail.com/dav</InlineCode>
                  </p>
                </div>

                <Input
                  type="text"
                  id="webdav_username"
                  label="CalDAV Username"
                  value={webdavUsername}
                  onChange={(e) => handleWebdavUsernameChange(e.target.value)}
                  placeholder="user@example.com"
                  helperText="Your CalDAV username (often your email address)"
                />

                <div className="space-y-2">
                  <Input
                    type="password"
                    id="webdav_password"
                    label="CalDAV Password"
                    value={webdavPassword}
                    onChange={(e) => handleWebdavPasswordChange(e.target.value)}
                    placeholder="Enter your CalDAV password or app password"
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {webdavPassword === MASK_VALUE ? (
                      <span className="text-green-600 dark:text-green-400">✓ Password is configured. Edit to update.</span>
                    ) : (
                      "Use an app-specific password if your provider supports it."
                    )}
                  </p>
                </div>
            </IntegrationCard>

            <IntegrationCard
              id="git-forges"
              title="Git Forges"
              description="Connect GitHub, GitLab, and/or Codeberg so the AI can cross-reference your commit history when categorizing work and generating time entries. Only configure the forges you use."
            >

              <div className="space-y-6">
                {/* GitHub */}
                <IntegrationProviderCard title="GitHub">
                  <Input
                    type="text"
                    id="github_username"
                    label="Username"
                    value={githubUsername}
                    onChange={(e) => handleGithubUsernameChange(e.target.value)}
                    placeholder="octocat"
                  />
                  <div className="space-y-2">
                    <Input
                      type="password"
                      id="github_token"
                      label="Personal Access Token"
                      value={githubToken}
                      onChange={(e) => handleGithubTokenChange(e.target.value)}
                      placeholder="ghp_..."
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {githubToken === MASK_VALUE ? (
                        <span className="text-green-600 dark:text-green-400">✓ Token is configured. Edit to update.</span>
                      ) : (
                        <>
                          Create a token with <InlineCode>repo</InlineCode> (read) scope from{" "}
                          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            GitHub Settings
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </IntegrationProviderCard>

                {/* GitLab */}
                <IntegrationProviderCard title="GitLab">
                  <Input
                    type="text"
                    id="gitlab_username"
                    label="Username"
                    value={gitlabUsername}
                    onChange={(e) => handleGitlabUsernameChange(e.target.value)}
                    placeholder="gitlab-user"
                  />
                  <div className="space-y-2">
                    <Input
                      type="password"
                      id="gitlab_token"
                      label="Personal Access Token"
                      value={gitlabToken}
                      onChange={(e) => handleGitlabTokenChange(e.target.value)}
                      placeholder="glpat-..."
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {gitlabToken === MASK_VALUE ? (
                        <span className="text-green-600 dark:text-green-400">✓ Token is configured. Edit to update.</span>
                      ) : (
                        <>
                          Create a token with <InlineCode>read_api</InlineCode> scope from{" "}
                          <a href="https://gitlab.com/-/user_settings/personal_access_tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            GitLab Settings
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <Input
                    type="text"
                    id="gitlab_url"
                    label="GitLab URL (optional)"
                    value={gitlabUrl}
                    onChange={(e) => handleGitlabUrlChange(e.target.value)}
                    placeholder="https://gitlab.com"
                    helperText="Leave blank to use gitlab.com. Set this for self-hosted GitLab instances."
                  />
                </IntegrationProviderCard>

                {/* Codeberg */}
                <IntegrationProviderCard title="Codeberg">
                  <Input
                    type="text"
                    id="codeberg_username"
                    label="Username"
                    value={codebergUsername}
                    onChange={(e) => handleCodebergUsernameChange(e.target.value)}
                    placeholder="codeberg-user"
                  />
                  <div className="space-y-2">
                    <Input
                      type="password"
                      id="codeberg_token"
                      label="API Token"
                      value={codebergToken}
                      onChange={(e) => handleCodebergTokenChange(e.target.value)}
                      placeholder="Enter your Codeberg API token"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
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
                </IntegrationProviderCard>
              </div>
            </IntegrationCard>
          </section>

          <Surface id="mcp-server" className="scroll-mt-24">
            <SettingsSectionHeader
              title="MCP Server"
              description="Expose the admin dashboard as a local MCP server for ChatGPT, Copilot, and other compatible tools."
            />

            <div className="space-y-4">
              <ToggleRow
                id="mcp_enabled"
                checked={mcpEnabled}
                onChange={handleMcpEnabledChange}
                title="Enable MCP endpoint"
                description="When enabled, the dashboard serves MCP tools at /api/mcp. Disable this to immediately block MCP access without revoking your API keys."
              />

              <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-100">
                <p className="font-medium">API keys must include MCP access</p>
                <p className="mt-1">
                  To use the MCP server, generate an admin API key with <InlineCode>mcp:use</InlineCode> plus whichever read/write scopes you want the AI to have.
                </p>
                <div className="mt-3">
                  <Link
                    href="/mcp"
                    className="inline-flex items-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    View MCP setup guide
                  </Link>
                </div>
              </div>
            </div>
          </Surface>

          <Surface id="coding-stats-card" className="scroll-mt-24">
            <SettingsSectionHeader
              title="Coding Stats Card"
              description="Generate a public stats card image showing your coding activity across all connected forges. Embed it in your README on GitHub, GitLab, Codeberg, or anywhere else."
            />

            <div className="space-y-4">
              <ToggleRow
                id="coding_stats_enabled"
                checked={codingStatsEnabled}
                onChange={handleCodingStatsEnabledChange}
                title="Enable coding stats card"
                description="When enabled, a public image endpoint is available at /api/coding-stats. The card is regenerated once per week (including an AI-generated insight line)."
              />

              {codingStatsEnabled && (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-900/40">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Embed in your README</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      Copy this snippet into any README to display your stats card:
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      This snippet automatically shows the dark card on dark-theme pages and the light card on light-theme pages (supported on GitHub, GitLab, and Codeberg).
                    </p>
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Embed snippet</label>
                      <pre className="mt-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300">
                        {`<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${typeof window !== "undefined" ? window.location.origin : ""}/api/coding-stats?theme=dark" />\n  <img src="${typeof window !== "undefined" ? window.location.origin : ""}/api/coding-stats?theme=light" alt="Coding Stats" width="600" />\n</picture>`}
                      </pre>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleRegenerateCodingStats}
                      disabled={codingStatsRegenerating}
                    >
                      {codingStatsRegenerating ? "Regenerating…" : "Regenerate Now"}
                    </Button>
                    <a
                      href="/api/coding-stats?theme=dark"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Preview dark ↗
                    </a>
                    <a
                      href="/api/coding-stats?theme=light"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Preview light ↗
                    </a>
                  </div>

                  <PrivacyCallout>
                    <p>
                      The stats card is a <strong>public, unauthenticated endpoint</strong>. It will never expose client names, project names, or other private information — only aggregate coding stats, language breakdowns, and public repository contributions.
                    </p>
                  </PrivacyCallout>
                </>
              )}
            </div>
          </Surface>

          <Surface id="api-keys" className="scroll-mt-24">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  API Keys
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Generate API keys for programmatic access to your data
                </p>
              </div>
              <Button
                onClick={() => setIsApiKeyModalOpen(true)}
              >
                Generate New Key
              </Button>
            </div>

            <ApiKeyList apiKeys={apiKeys} onRevoke={handleRevokeApiKey} />
          </Surface>
        </div>
      </div>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onGenerate={handleGenerateApiKey}
        availablePermissions={availablePermissions}
      />
        </Section>
      </PageContent>
    </Page>
  );
}
