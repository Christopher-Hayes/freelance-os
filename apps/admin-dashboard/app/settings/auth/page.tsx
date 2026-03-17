"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Button,
  Page,
  PageContent,
  PageHeader,
  PageLoading,
  Surface,
  toast,
} from "@repo/ui";
import { authFetch } from "@/lib/util";
import {
  ArrowLeft,
  Check,
  KeyRound,
  Mail,
  Shield,
  X,
} from "lucide-react";

type ProviderConfig = {
  id: string;
  provider: string;
  enabled: boolean;
};

const PROVIDER_INFO: Record<
  string,
  {
    name: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    alwaysEnabled?: boolean;
    configFields?: { key: string; label: string; type: string; placeholder?: string }[];
  }
> = {
  credentials: {
    name: "Credentials (Email & Password)",
    description:
      "Users sign in with their email address and password. The default admin account is created from ADMIN_EMAIL and ADMIN_PASSWORD environment variables.",
    icon: KeyRound,
    alwaysEnabled: true,
  },
  email: {
    name: "Email (Magic Link)",
    description:
      "Users receive a magic link via email to sign in without a password. Requires JMAP email to be configured in Integrations.",
    icon: Mail,
    configFields: [],
  },
};

export default function AuthSettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  async function loadProviders() {
    try {
      const res = await authFetch("/api/auth/providers");
      const data = await res.json();
      setProviders(data);
    } catch (err) {
      console.error("Failed to load providers:", err);
      toast.error("Failed to load auth providers");
    } finally {
      setLoading(false);
    }
  }

  async function toggleProvider(provider: string, enabled: boolean) {
    setToggling(provider);
    try {
      const res = await authFetch("/api/auth/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to update provider");
        return;
      }

      // Update local state
      setProviders((prev) =>
        prev.map((p) =>
          p.provider === provider ? { ...p, enabled } : p
        )
      );

      toast.success(
        `${PROVIDER_INFO[provider]?.name || provider} ${enabled ? "enabled" : "disabled"}`
      );
    } catch (err) {
      console.error("Failed to toggle provider:", err);
      toast.error("Failed to update provider");
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <PageLoading
        title="Loading auth settings"
        message="Fetching authentication provider configurations."
      />
    );
  }

  // Ensure all known providers appear in the list
  const allProviders = Object.keys(PROVIDER_INFO).map((key) => {
    const existing = providers.find((p) => p.provider === key);
    return {
      id: existing?.id || key,
      provider: key,
      enabled: existing?.enabled ?? (key === "credentials"),
    };
  });

  return (
    <Page>
      <PageHeader
        title="Authentication Providers"
        description="Enable or disable sign-in methods for the admin dashboard and client portal."
        actions={
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
        }
      />

      <PageContent>
        <div className="space-y-4">
          {allProviders.map((p) => {
            const info = PROVIDER_INFO[p.provider];
            if (!info) return null;

            const Icon = info.icon;
            const isToggling = toggling === p.provider;

            return (
              <Surface key={p.provider} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2.5 rounded-lg ${
                        p.enabled
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {info.name}
                        </h3>
                        {p.enabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <Check className="h-3 w-3" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            <X className="h-3 w-3" />
                            Disabled
                          </span>
                        )}
                        {info.alwaysEnabled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            <Shield className="h-3 w-3" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {info.description}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {info.alwaysEnabled ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                        Always on
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          toggleProvider(p.provider, !p.enabled)
                        }
                        disabled={isToggling}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 ${
                          p.enabled
                            ? "bg-blue-600"
                            : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            p.enabled ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>

        <Surface className="mt-8 p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Environment Variables
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            The following environment variables configure the default admin account and auth secret:
          </p>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex gap-2">
              <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                ADMIN_EMAIL
              </code>
              <span className="text-gray-500 dark:text-gray-400">
                — Email for the default admin account (defaults to admin@localhost)
              </span>
            </div>
            <div className="flex gap-2">
              <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                ADMIN_PASSWORD
              </code>
              <span className="text-gray-500 dark:text-gray-400">
                — Password for the default admin account
              </span>
            </div>
            <div className="flex gap-2">
              <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                NEXTAUTH_SECRET
              </code>
              <span className="text-gray-500 dark:text-gray-400">
                — Secret for signing JWTs (generate with{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                  openssl rand -base64 32
                </code>
                )
              </span>
            </div>
          </div>
        </Surface>
      </PageContent>
    </Page>
  );
}
