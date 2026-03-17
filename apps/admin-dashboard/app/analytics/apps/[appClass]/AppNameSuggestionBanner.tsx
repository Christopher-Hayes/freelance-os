"use client";

import { useState, useTransition } from "react";
import { Sparkles, X, Check } from "lucide-react";
import { authFetch } from "@/lib/util";

type AppNameSuggestionBannerProps = {
  appClass: string;
  suggestedName: string;
  currentDisplayName: string;
};

export default function AppNameSuggestionBanner({
  appClass,
  suggestedName,
  currentDisplayName,
}: AppNameSuggestionBannerProps) {
  const [visible, setVisible] = useState(true);
  const [isPending, startTransition] = useTransition();

  if (!visible) return null;

  async function updateApp(data: Record<string, unknown>) {
    await authFetch(`/api/apps/${encodeURIComponent(appClass)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  function handleAccept() {
    startTransition(async () => {
      await updateApp({ displayName: suggestedName, suggestNameDismissed: true });
      // Reload so the page picks up the new name
      window.location.reload();
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      await updateApp({ suggestNameDismissed: true });
      setVisible(false);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-950/30">
      <Sparkles className="h-5 w-5 shrink-0 text-amber-500" />
      <div className="flex-1 text-sm text-slate-700 dark:text-slate-300">
        <span className="font-medium text-slate-900 dark:text-white">Name suggestion:</span>{" "}
        Rename <span className="font-medium">&ldquo;{currentDisplayName}&rdquo;</span> to{" "}
        <span className="font-semibold text-amber-700 dark:text-amber-400">&ldquo;{suggestedName}&rdquo;</span>?
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleAccept}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
        >
          <Check className="h-3.5 w-3.5" />
          Accept
        </button>
        <button
          onClick={handleDismiss}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </button>
      </div>
    </div>
  );
}
