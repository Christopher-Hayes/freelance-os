"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, EyeOff, Pencil, RotateCcw, X } from "lucide-react";
import { OptionsMenu, OptionsMenuItem, OptionsMenuSeparator } from "@repo/ui";
import { authFetch } from "@/lib/util";

type AppOptionsMenuProps = {
  appClass: string;
  displayName: string;
  hasCustomName: boolean;
};

export default function AppOptionsMenu({ appClass, displayName, hasCustomName }: AppOptionsMenuProps) {
  const router = useRouter();
  const [showRename, setShowRename] = useState(false);
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [renameValue, setRenameValue] = useState(displayName);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the rename input when the dialog opens
  useEffect(() => {
    if (showRename) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [showRename]);

  async function updateApp(data: Record<string, unknown>) {
    await authFetch(`/api/apps/${encodeURIComponent(appClass)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  function handleOpenRename() {
    setRenameValue(displayName);
    setShowRename(true);
  }

  function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    startTransition(async () => {
      await updateApp({ displayName: trimmed || null });
      setShowRename(false);
      window.location.reload();
    });
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") setShowRename(false);
  }

  function handleResetName() {
    startTransition(async () => {
      await updateApp({ displayName: null });
      window.location.reload();
    });
  }

  function handleOpenHideConfirm() {
    setShowHideConfirm(true);
  }

  function handleHideConfirm() {
    startTransition(async () => {
      await updateApp({ hidden: true });
      setShowHideConfirm(false);
      router.push("/analytics");
    });
  }

  function handleCopyClass() {
    navigator.clipboard.writeText(appClass).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <OptionsMenu label="App options" contentClassName="w-52">
        <OptionsMenuItem
          onClick={handleOpenRename}
          disabled={isPending}
          icon={<Pencil className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
        >
          Rename app
        </OptionsMenuItem>

        {hasCustomName && (
          <OptionsMenuItem
            onClick={handleResetName}
            disabled={isPending}
            icon={<RotateCcw className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
          >
            Reset to default name
          </OptionsMenuItem>
        )}

        <OptionsMenuSeparator />

        <OptionsMenuItem
          onClick={handleOpenHideConfirm}
          disabled={isPending}
          tone="danger"
          icon={<EyeOff className="h-4 w-4" />}
        >
          Hide app
        </OptionsMenuItem>

        <OptionsMenuSeparator />

        <OptionsMenuItem
          onClick={handleCopyClass}
          tone="muted"
          icon={copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        >
          {copied ? "Copied!" : "Copy app class"}
        </OptionsMenuItem>
      </OptionsMenu>

      {/* Rename dialog */}
      {showRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowRename(false)}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Rename app</h3>
              <button
                onClick={() => setShowRename(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Set a human-friendly display name for{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{appClass}</span>.
              Leave blank to revert to the auto-generated name.
            </p>

            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              placeholder="e.g. VS Code"
              className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowRename(false)}
                disabled={isPending}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                disabled={isPending || renameValue.trim() === displayName}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save name"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hide confirmation dialog */}
      {showHideConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowHideConfirm(false)}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
                <EyeOff className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Hide app?</h3>
            </div>

            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{displayName}</span> will be
              excluded from the analytics overview and its detail page will be unavailable. You can
              re-show it from the apps API if needed.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowHideConfirm(false)}
                disabled={isPending}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleHideConfirm}
                disabled={isPending}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Hiding…" : "Yes, hide it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
