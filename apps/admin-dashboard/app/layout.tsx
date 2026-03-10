import "@repo/ui/styles.css";
import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Providers } from "@/components/Providers";
import { AuthErrorBoundary } from "@/components/AuthErrorBoundary";
import JobsIndicator from "@/components/JobsIndicator";
import LogoutButton from "@/components/LogoutButton";
// Initialize Temporal API polyfill
import "@/lib/temporal-polyfill";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freelance OS - Admin Dashboard",
  description: "Manage your freelance business operations",
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
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Navigation */}
            <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <div className="flex">
                    <Link href="/" className="flex items-center text-xl font-bold text-gray-900 dark:text-white">
                      Freelance OS
                    </Link>
                    <div className="ml-6 flex space-x-8">
                      <Link
                        href="/clients"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-900 dark:text-gray-100"
                      >
                        Clients
                      </Link>
                      <Link
                        href="/projects"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Projects
                      </Link>
                      <Link
                        href="/time"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Time Tracking
                      </Link>
                      <Link
                        href="/invoices"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Invoices
                      </Link>
                      <Link
                        href="/analytics"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Analytics
                      </Link>
                      <Link
                        href="/debug"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Debug
                      </Link>
                      <Link
                        href="/users"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Users
                      </Link>
                      <Link
                        href="/settings"
                        className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-blue-500 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Settings
                      </Link>
                    </div>
                  </div>
                  
                  {/* Jobs indicator and logout button on the right */}
                  <div className="flex items-center gap-2">
                    <JobsIndicator />
                    <LogoutButton />
                  </div>
                </div>
              </div>
            </nav>

            {/* Main content */}
            <main className="max-w-7xl mx-auto">{children}</main>
          </div>
        </Providers>
        </AuthErrorBoundary>
      </body>
    </html>
  );
}
