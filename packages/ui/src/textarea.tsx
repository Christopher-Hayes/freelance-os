import React from "react";
import { cn } from "./utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = "", id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full space-y-1.5">
        {label ? (
          <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "block min-h-24 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100",
            error
              ? "border-red-300 focus:border-red-500 dark:border-red-800"
              : "border-slate-300 dark:border-white/10",
            className
          )}
          {...props}
        />
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {helperText && !error ? <p className="text-sm text-slate-500 dark:text-slate-400">{helperText}</p> : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";