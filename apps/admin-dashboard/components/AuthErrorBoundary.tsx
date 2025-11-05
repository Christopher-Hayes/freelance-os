'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary that catches auth-related errors and redirects to login
 * This is a safety net for any fetch calls that might not use authFetch
 */
export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Check if this is an auth-related error
    if (
      error.message.includes('Unauthorized') ||
      error.message.includes('401') ||
      error.message.includes('session')
    ) {
      // Redirect to login with callback URL
      const callbackUrl = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?callbackUrl=${callbackUrl}`;
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Check if this is an auth error
      if (
        this.state.error.message.includes('Unauthorized') ||
        this.state.error.message.includes('401') ||
        this.state.error.message.includes('session')
      ) {
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Session Expired
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Redirecting to login...
              </p>
            </div>
          </div>
        );
      }

      // For non-auth errors, show a generic error message
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
