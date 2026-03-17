"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "@repo/ui";
import { JobsProvider } from "@/components/JobsProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Toaster
        position="bottom-right"
        richColors
        theme="system"
        toastOptions={{
          style: {
            background: "rgb(31 41 55)",
            border: "1px solid rgb(55 65 81)",
            color: "rgb(243 244 246)",
          },
        }}
      />
      <JobsProvider>{children}</JobsProvider>
    </SessionProvider>
  );
}
