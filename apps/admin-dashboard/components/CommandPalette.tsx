"use client";

import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  FolderKanban,
  FilePlus2,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/util";
import type { CommandPaletteItem } from "@/lib/command-palette";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

const CATEGORY_LABELS: Record<CommandPaletteItem["category"], string> = {
  page: "Pages",
  client: "Clients",
  project: "Projects",
  action: "Quick actions",
};

function getItemIcon(item: CommandPaletteItem) {
  switch (item.category) {
    case "page":
      return LayoutDashboard;
    case "client":
      return Briefcase;
    case "project":
      return FolderKanban;
    case "action":
      return item.action?.startsWith("create-") ? FilePlus2 : Sparkles;
    default:
      return Search;
  }
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CommandPaletteItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    const result: Array<{ label: string; items: CommandPaletteItem[]; startIndex: number }> = [];
    let runningIndex = 0;

    for (const category of ["page", "client", "project", "action"] as const) {
      const categoryItems = items.filter((item) => item.category === category);
      if (categoryItems.length === 0) {
        continue;
      }

      result.push({
        label: CATEGORY_LABELS[category],
        items: categoryItems,
        startIndex: runningIndex,
      });
      runningIndex += categoryItems.length;
    }

    return result;
  }, [items]);

  const loadResults = useCallback(async (nextQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) {
        params.set("q", nextQuery.trim());
      }
      params.set("limit", "18");

      const response = await authFetch(`/api/command-palette?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load command palette results");
      }

      const data = (await response.json()) as { items: CommandPaletteItem[] };
      setItems(data.items);
      setActiveIndex(0);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : "Failed to load results");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setItems([]);
      setActiveIndex(0);
      setError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);

    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadResults(query);
    }, query.trim() ? 120 : 0);

    return () => window.clearTimeout(timeout);
  }, [loadResults, open, query]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(items.length > 0 ? items.length - 1 : 0);
    }
  }, [activeIndex, items.length]);

  const handleSelect = useCallback(
    (item: CommandPaletteItem) => {
      onClose();
      if (item.href) {
        router.push(item.href);
      }
    },
    [onClose, router]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (items.length === 0 ? 0 : (current - 1 + items.length) % items.length));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const activeItem = items[activeIndex];
        if (activeItem) {
          handleSelect(activeItem);
        }
      }
    },
    [activeIndex, handleSelect, items]
  );

  return (
  <Dialog open={open} onClose={onClose} className="relative z-60">
      <DialogBackdrop className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm transition-opacity" />

      <div className="fixed inset-0 overflow-y-auto p-4 pt-[12vh] sm:p-6 sm:pt-[14vh]">
        <DialogPanel className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-white/10 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-5">
            <div className="flex items-center gap-3">
              <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, clients, projects, or actions..."
                className="h-11 w-full border-0 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                aria-label="Search pages, clients, projects, or actions"
              />
              <button
                type="button"
                onClick={onClose}
                className="hidden rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 sm:inline dark:border-white/10 dark:text-gray-400"
              >
                Esc
              </button>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto">
            <div className="border-b border-gray-200/80 px-4 py-2 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400 sm:px-5">
              Prioritized by pages first, then clients and projects, then quick actions.
            </div>

            {error ? (
              <div className="px-5 py-8 text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : null}

            {!error && groupedItems.length === 0 && !loading ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                No matches yet. Try a page name like “Invoices”, a client name, or “new project”.
              </div>
            ) : null}

            {groupedItems.map((group) => (
              <div key={group.label} className="border-b border-gray-200/80 last:border-b-0 dark:border-white/10">
                <div className="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  {group.label}
                </div>

                <ul className="pb-2">
                  {group.items.map((item, offset) => {
                    const absoluteIndex = group.startIndex + offset;
                    const isActive = absoluteIndex === activeIndex;
                    const Icon = getItemIcon(item);

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(absoluteIndex)}
                          onClick={() => handleSelect(item)}
                          className={`flex w-full items-center gap-3 px-5 py-3 text-left transition ${
                            isActive
                              ? "bg-blue-50 text-gray-900 dark:bg-blue-500/10 dark:text-white"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
                          }`}
                        >
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                              isActive
                                ? "border-blue-200 bg-white text-blue-600 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300"
                                : "border-gray-200 bg-gray-50 text-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-500"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{item.title}</div>
                            {item.subtitle ? (
                              <div className="truncate text-xs text-gray-500 dark:text-gray-400">{item.subtitle}</div>
                            ) : null}
                          </div>

                          {item.shortcut ? (
                            <span className="hidden rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-400 sm:inline dark:border-white/10 dark:text-gray-500">
                              {item.shortcut}
                            </span>
                          ) : null}

                          <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="rounded border border-gray-200 px-1.5 py-0.5 dark:border-white/10">↑↓</span>
              <span>Move</span>
              <span className="rounded border border-gray-200 px-1.5 py-0.5 dark:border-white/10">↵</span>
              <span>Open</span>
            </div>
            <div>{loading ? "Searching…" : `${items.length} result${items.length === 1 ? "" : "s"}`}</div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
