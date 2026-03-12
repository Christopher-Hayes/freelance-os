import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
}

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Surface({
  className,
  padding = "md",
  interactive = false,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900",
        paddingStyles[padding],
        interactive &&
          "transition-all hover:border-slate-300 hover:shadow-md dark:hover:border-white/20 dark:hover:shadow-black/20",
        className
      )}
      {...props}
    />
  );
}

export function SurfaceHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description ? <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}