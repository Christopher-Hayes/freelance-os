import "@repo/ui/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import { Providers } from "@/components/Providers";
import { AuthErrorBoundary } from "@/components/AuthErrorBoundary";
import AdminAppShell from "@/components/AdminAppShell";
import { EmailVerifiedToast } from "@/components/EmailVerifiedToast";
// Initialize Temporal API polyfill
import "@/lib/temporal-polyfill";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freelance OS - Admin Dashboard",
  description: "Manage your freelance business operations",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/logo.webp" }],
    shortcut: ["/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <AuthErrorBoundary>
          <Providers>
            <Suspense fallback={null}>
              <EmailVerifiedToast />
            </Suspense>
            <AdminAppShell>{children}</AdminAppShell>
          </Providers>
        </AuthErrorBoundary>
      </body>
    </html>
  );
}
