"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./utils";
import { useTheme, type Theme } from "./theme";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-white/10 dark:bg-white/5",
        className
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center justify-center rounded-md p-1.5 transition-colors",
              active
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
