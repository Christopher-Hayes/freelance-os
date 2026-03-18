"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "./utils";

export interface OptionsMenuProps {
  children: React.ReactNode;
  label?: string;
  triggerClassName?: string;
  contentClassName?: string;
  align?: "left" | "right";
}

export function OptionsMenu({
  children,
  label = "More options",
  triggerClassName,
  contentClassName,
  align = "right",
}: OptionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (!open) {
      return;
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center justify-center rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
          triggerClassName
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute top-full z-20 mt-2 min-w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900",
            align === "right" ? "right-0" : "left-0",
            contentClassName
          )}
        >
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) {
              return child;
            }

            return React.cloneElement(child as React.ReactElement<{ closeMenu?: () => void }>, {
              closeMenu: () => setOpen(false),
            });
          })}
        </div>
      ) : null}
    </div>
  );
}

type OptionsMenuActionChildProps = {
  closeMenu?: () => void;
};

export interface OptionsMenuItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">,
    OptionsMenuActionChildProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "danger" | "muted";
  closeOnSelect?: boolean;
}

export function OptionsMenuItem({
  children,
  icon,
  tone = "default",
  className,
  onClick,
  closeOnSelect = true,
  closeMenu,
  type = "button",
  ...props
}: OptionsMenuItemProps) {
  const tones = {
    default: "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
    danger: "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40",
    muted: "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800",
  } as const;

  return (
    <button
      type={type}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2 text-sm transition disabled:opacity-50",
        tones[tone],
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && closeOnSelect) {
          closeMenu?.();
        }
      }}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}

export function OptionsMenuSeparator() {
  return <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />;
}