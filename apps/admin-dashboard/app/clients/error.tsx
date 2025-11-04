"use client";

import { ErrorMessage } from "@repo/ui";

export default function ClientsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8">
      <ErrorMessage
        title="Failed to load clients"
        message={error.message || "An unexpected error occurred while loading the clients list."}
        retry={reset}
      />
    </div>
  );
}
