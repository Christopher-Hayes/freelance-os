import type { ReactNode } from "react";
import { Surface } from "./surface";
import { cn } from "./utils";

export function StatCard({
  label,
  value,
  tone = "default",
  meta,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  meta?: ReactNode;
  icon?: ReactNode;
}) {
  const toneStyles = {
    default: "text-slate-900 dark:text-white",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  return (
    <Surface padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className={cn("text-2xl font-semibold tracking-tight sm:text-3xl", toneStyles[tone])}>{value}</div>
        </div>
        {icon ? <div className="text-slate-400 dark:text-slate-500">{icon}</div> : null}
      </div>
      {meta ? <div className="text-sm text-slate-500 dark:text-slate-400">{meta}</div> : null}
    </Surface>
  );
}