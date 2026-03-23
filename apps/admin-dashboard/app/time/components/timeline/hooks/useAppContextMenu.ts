"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@repo/ui";
import { syncAppDataToLocalStorage, authFetch, formatAppTitle } from "@/lib/util";
import type { ActivitySession } from "../utils";

type AppSessionContextMenuState = {
  x: number;
  y: number;
  session: ActivitySession;
} | null;

function getAppAnalyticsHref(appClass: string) {
  return `/analytics/apps/${encodeURIComponent(appClass)}`;
}

interface UseAppContextMenuReturn {
  appContextMenu: AppSessionContextMenuState;
  setAppContextMenu: React.Dispatch<React.SetStateAction<AppSessionContextMenuState>>;
  handleSessionContextMenu: (
    event: React.MouseEvent<HTMLDivElement>,
    session: ActivitySession
  ) => void;
  handleSessionClick: (session: ActivitySession) => void;
  handleRenameApp: (session: ActivitySession) => Promise<void>;
  handleHideApp: (session: ActivitySession) => Promise<void>;
}

export function useAppContextMenu(
  fetchDayData: () => Promise<void>
): UseAppContextMenuReturn {
  const router = useRouter();
  const [appContextMenu, setAppContextMenu] = useState<AppSessionContextMenuState>(null);

  // Dismiss context menu on outside interaction
  useEffect(() => {
    if (!appContextMenu) return;
    const handleDismiss = () => setAppContextMenu(null);
    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [appContextMenu]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAppContextMenu(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────

  const upsertApp = async (appClass: string, data: Record<string, unknown>) => {
    const response = await authFetch(`/api/apps/${encodeURIComponent(appClass)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update app");
    return response.json();
  };

  const showUndoToast = (message: string, undo: () => Promise<void>) => {
    toast.success(message, {
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await undo();
          } catch (error) {
            console.error("Undo failed:", error);
            toast.error("Undo failed");
          }
        },
      },
      duration: 6000,
    });
  };

  // ── Handlers ────────────────────────────────────────────────────────

  const handleSessionContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, session: ActivitySession) => {
      event.preventDefault();
      event.stopPropagation();
      setAppContextMenu({ x: event.clientX, y: event.clientY, session });
    },
    []
  );

  const handleSessionClick = useCallback(
    (session: ActivitySession) => {
      setAppContextMenu(null);
      router.push(getAppAnalyticsHref(session.appClass));
    },
    [router]
  );

  const handleRenameApp = useCallback(
    async (session: ActivitySession) => {
      const currentFriendlyName = formatAppTitle(session.appClass);
      const nextName = window.prompt(`Rename "${currentFriendlyName}"`, currentFriendlyName);
      if (!nextName) return;
      const trimmedName = nextName.trim();
      if (!trimmedName) return;

      try {
        const currentRes = await authFetch(`/api/apps/${encodeURIComponent(session.appClass)}`);
        const currentData = await currentRes.json();
        const previousDisplayName = currentData.app?.displayName ?? null;

        await upsertApp(session.appClass, { displayName: trimmedName });
        await syncAppDataToLocalStorage();
        setAppContextMenu(null);
        await fetchDayData();

        showUndoToast(`Renamed ${currentFriendlyName} to ${trimmedName}`, async () => {
          await upsertApp(session.appClass, { displayName: previousDisplayName });
          await syncAppDataToLocalStorage();
          await fetchDayData();
          toast.success(`Restored ${currentFriendlyName}`);
        });
      } catch (error) {
        console.error("Error renaming app:", error);
        toast.error("Failed to rename app");
      }
    },
    [fetchDayData]
  );

  const handleHideApp = useCallback(
    async (session: ActivitySession) => {
      const currentFriendlyName = formatAppTitle(session.appClass);
      try {
        await upsertApp(session.appClass, { hidden: true });
        await syncAppDataToLocalStorage();
        setAppContextMenu(null);
        await fetchDayData();

        showUndoToast(`Hid ${currentFriendlyName} from timeline and analytics`, async () => {
          await upsertApp(session.appClass, { hidden: false });
          await syncAppDataToLocalStorage();
          await fetchDayData();
          toast.success(`Unhid ${currentFriendlyName}`);
        });
      } catch (error) {
        console.error("Error hiding app:", error);
        toast.error("Failed to hide app");
      }
    },
    [fetchDayData]
  );

  return {
    appContextMenu,
    setAppContextMenu,
    handleSessionContextMenu,
    handleSessionClick,
    handleRenameApp,
    handleHideApp,
  };
}
