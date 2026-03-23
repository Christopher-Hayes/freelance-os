"use client";

import { createPortal } from "react-dom";
import { formatAppTitle } from "@/lib/util";
import type { ActivitySession as ActivitySessionType } from "./utils";

interface AppContextMenuState {
  x: number;
  y: number;
  session: ActivitySessionType;
}

interface AppContextMenuProps {
  contextMenu: AppContextMenuState;
  isClient: boolean;
  onClose: () => void;
  onRename: (session: ActivitySessionType) => void;
  onHide: (session: ActivitySessionType) => void;
}

export default function AppContextMenu({
  contextMenu,
  isClient,
  onClose,
  onRename,
  onHide,
}: AppContextMenuProps) {
  if (!isClient) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-48 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/95"
        style={{ top: contextMenu.y, left: contextMenu.x }}
        role="menu"
      >
        <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          {formatAppTitle(contextMenu.session.appClass)}
        </div>
        <button
          type="button"
          className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
          onClick={() => onRename(contextMenu.session)}
          role="menuitem"
        >
          Rename
        </button>
        <button
          type="button"
          className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
          onClick={() => onHide(contextMenu.session)}
          role="menuitem"
        >
          Hide
        </button>
      </div>
    </>,
    document.body
  );
}
