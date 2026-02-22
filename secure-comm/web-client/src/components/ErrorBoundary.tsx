'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * BUGFIX: React ErrorBoundary to catch unhandled rendering errors.
 * Without this, a single component crash (e.g., failed decryption, bad data)
 * takes down the entire app with a white screen.
 *
 * NOTE: Error boundaries do NOT catch:
 * - Event handler errors (these need try/catch)
 * - Async errors (promises, setTimeout)
 * - Server-side rendering errors
 * - Errors in the boundary itself
 *
 * For async errors, we also install a global window.onunhandledrejection handler.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🛑 ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-8">
          <div className="max-w-md text-center space-y-4">
            <h2 className="text-2xl font-bold text-red-400">Something went wrong</h2>
            <p className="text-gray-400">
              An unexpected error occurred. Your messages and keys are safe.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="text-left text-xs text-red-300 bg-gray-800 p-3 rounded overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="ml-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Install global handlers for unhandled promise rejections and errors.
 * Call this once at app startup.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event) => {
    console.error('🛑 Unhandled promise rejection:', event.reason);
    // Prevent the default browser behavior (console error)
    // but don't crash the app
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    console.error('🛑 Unhandled error:', event.error);
  });
}

export default ErrorBoundary;
