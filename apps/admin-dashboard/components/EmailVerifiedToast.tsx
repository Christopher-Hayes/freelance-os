"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "@repo/ui";

/**
 * Detects `?verified=1` in the URL (added by the resend-verification email
 * callback) and shows a success toast, then strips the param from the URL so
 * a refresh doesn't re-trigger it.
 */
export function EmailVerifiedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("verified") === "1") {
      toast.success("Email verified successfully!", {
        description: "Your email address has been confirmed.",
        duration: 6000,
      });

      // Remove the ?verified=1 param without triggering a full navigation
      const params = new URLSearchParams(searchParams.toString());
      params.delete("verified");
      const newUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
