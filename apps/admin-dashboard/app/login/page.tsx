"use client";

import { useState, useEffect, useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authenticateCredentials, authenticateEmail } from "@/lib/login-actions";

type ProviderConfig = {
  id: string;
  provider: string;
  enabled: boolean;
};

function LoginForm() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeTab, setActiveTab] = useState<"credentials" | "email">("credentials");
  const [emailForDisplay, setEmailForDisplay] = useState("");
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const errorParam = searchParams.get("error");

  const [credError, credAction, credPending] = useActionState(authenticateCredentials, null);
  const [emailResult, emailAction, emailPending] = useActionState(authenticateEmail, null);

  const emailSent = emailResult === "__EMAIL_SENT__";
  const emailError = emailResult && emailResult !== "__EMAIL_SENT__" ? emailResult : null;

  // Derive error message from either server action or URL params
  const displayError =
    activeTab === "credentials"
      ? credError
      : emailError;
  const urlError = errorParam === "AccessDenied"
    ? "Access denied. Only admin users can sign in here."
    : errorParam === "CredentialsSignin"
      ? "Invalid email or password."
      : errorParam
        ? "An authentication error occurred."
        : null;
  const error = displayError || urlError;

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: ProviderConfig[]) => {
        setProviders(data);
      })
      .catch(() => {
        // Default to credentials if we can't fetch
        setProviders([{ id: "credentials", provider: "credentials", enabled: true }]);
      });
  }, []);

  const isEmailEnabled = providers.some(
    (p) => p.provider === "email" && p.enabled
  );

  const loading = credPending || emailPending;

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/50 p-8 text-center">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Check your email
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              A magic link has been sent to <strong>{emailForDisplay}</strong>. Click the
              link to sign in.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Use a different method
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/50 p-8">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Admin Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Sign in to continue
            </p>
          </div>

          {/* Tab switcher (only show if email is enabled) */}
          {isEmailEnabled && (
            <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab("credentials")}
                className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "credentials"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                Email & Password
              </button>
              <button
                onClick={() => setActiveTab("email")}
                className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "email"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                Magic Link
              </button>
            </div>
          )}

          {/* Credentials form */}
          {activeTab === "credentials" && (
            <form action={credAction} className="space-y-5">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  placeholder="admin@example.com"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          )}

          {/* Email magic link form */}
          {activeTab === "email" && isEmailEnabled && (
            <form action={(formData) => {
              setEmailForDisplay(formData.get("email") as string);
              emailAction(formData);
            }} className="space-y-5">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <div>
                <label
                  htmlFor="magic-email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Email
                </label>
                <input
                  id="magic-email"
                  name="email"
                  type="email"
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  placeholder="admin@example.com"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 dark:bg-blue-500 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Sending link...
                  </>
                ) : (
                  "Send Magic Link"
                )}
              </button>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                We&apos;ll send you a magic link to sign in
              </p>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Default admin credentials are set via{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                ADMIN_EMAIL
              </code>{" "}
              and{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                ADMIN_PASSWORD
              </code>{" "}
              environment variables
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
