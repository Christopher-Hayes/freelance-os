import type { ReactNode } from "react";
import { EmptyState } from "./empty-state";
import { ErrorMessage } from "./error-message";
import { Spinner } from "./spinner";
import { Surface } from "./surface";

export function PageLoading({ title = "Loading…", message }: { title?: string; message?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner size="lg" className="text-blue-600 dark:text-blue-400" />
        <div className="space-y-1">
          <p className="text-base font-medium text-slate-900 dark:text-white">{title}</p>
          {message ? <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function SectionLoading({ title = "Loading…" }: { title?: string }) {
  return (
    <Surface className="flex min-h-40 items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <Spinner size="sm" className="text-blue-600 dark:text-blue-400" />
        <span>{title}</span>
      </div>
    </Surface>
  );
}

export function PageError({
  message,
  retry,
  title,
}: {
  message: string;
  retry?: () => void;
  title?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <ErrorMessage title={title} message={message} retry={retry} />
    </div>
  );
}

export function EmptySurfaceState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Surface>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </Surface>
  );
}