import React from "react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => {
  return (
    <div className={compact ? "text-center py-8" : "text-center py-12"}>
      {icon && (
        <div className="mb-4 flex justify-center text-slate-400 dark:text-slate-600">
          {icon}
        </div>
      )}
      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="mx-auto mb-6 max-w-md text-slate-600 dark:text-slate-400">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};

EmptyState.displayName = "EmptyState";
