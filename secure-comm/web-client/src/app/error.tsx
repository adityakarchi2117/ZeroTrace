'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cipher-darker text-white px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-slate-300 text-sm">
          We hit an unexpected error. You can try reloading the current view.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-white font-medium hover:bg-cyan-400"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:border-slate-400"
          >
            Reload
          </button>
        </div>
        <p className="text-xs text-slate-500 break-words">{error?.message ? 'An unexpected error occurred.' : ''}</p>
      </div>
    </div>
  );
}
