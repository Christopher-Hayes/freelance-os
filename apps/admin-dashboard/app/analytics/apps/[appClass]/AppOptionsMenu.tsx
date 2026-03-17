"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, EyeOff, MoreHorizontal, Pencil, RotateCcw, X } from "lucide-react";
import { authFetch } from "@/lib/util";

type AppOptionsMenuProps = {
  appClass: string;
  displayName: string;
  hasCustomName: boolean;
};

export default function AppOptionsMenu({ appClass, displayName, hasCustomName }: AppOptionsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [renameValue, setRenameValue] = useState(displayName);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

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
    setOpen(false);
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
    setOpen(false);
    startTransition(async () => {
      await updateApp({ displayName: null });
      window.location.reload();
    });
  }

  function handleOpenHideConfirm() {
    setOpen(false);
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
    setOpen(false);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      {/* Trigger + dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="App options"
          aria-expanded={open}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900">
            {/* Rename */}
            <button
              onClick={handleOpenRename}
              disabled={isPending}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
              Rename app
            </button>

            {/* Reset name — only shown when a custom name is set */}
            {hasCustomName && (
              <button
                onClick={handleResetName}
                disabled={isPending}
                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                Reset to default name
              </button>
            )}

            <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />

            {/* Hide app */}
            <button
              onClick={handleOpenHideConfirm}
              disabled={isPending}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <EyeOff className="h-4 w-4 shrink-0" />
              Hide app
            </button>

            <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />

            {/* Copy app class */}
            <button
              onClick={handleCopyClass}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {copied ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" />
              )}
              {copied ? "Copied!" : "Copy app class"}
            </button>
          </div>
        )}
      </div>

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
