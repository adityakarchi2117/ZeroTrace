import React, { useEffect, useState, useCallback } from "react";
import { ProfileHistoryEntry } from "@/lib/profileTypes";
import profileApi from "@/lib/profileApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRollback?: () => void;
}

export default function ProfileHistoryViewer({
  isOpen,
  onClose,
  onRollback,
}: Props) {
  const [entries, setEntries] = useState<ProfileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileApi.getHistory(30);
      setEntries(data);
    } catch (e) {
      console.error("Failed to load history:", e);
      setError("Failed to load profile history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleRollback = async (historyId: number) => {
    if (rollingBack !== null) return; // Prevent concurrent rollback
    if (
      !confirm(
        "Roll back your profile to this snapshot? This creates a new history entry.",
      )
    )
      return;
    setRollingBack(historyId);
    try {
      await profileApi.rollback(historyId);
      onRollback?.();
      onClose();
    } catch (e) {
      console.error("Rollback failed:", e);
      alert("Failed to rollback");
    } finally {
      setRollingBack(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <div role="dialog" aria-modal="true" aria-labelledby="history-title" className="w-full max-w-lg bg-gray-900/90 rounded-2xl border border-gray-800 p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 id="history-title" className="text-lg font-semibold text-white">Profile History</h2>
          <button className="text-gray-400 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Every profile change is recorded. You can rollback to any previous
          snapshot.
        </p>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-gray-400 text-sm">Loading history…</p>
          ) : error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No profile changes recorded yet.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">
                      {new Date(entry.created_at).toLocaleString()} ·{" "}
                      <span className="text-gray-400">
                        {entry.change_source}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.changed_fields.map((f) => (
                        <span
                          key={f}
                          className="text-xs bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="text-xs text-amber-400 hover:text-amber-300 ml-2 whitespace-nowrap disabled:opacity-30"
                    onClick={() => handleRollback(entry.id)}
                    disabled={rollingBack !== null}
                  >
                    {rollingBack === entry.id ? "Rolling back…" : "Rollback"}
                  </button>
                </div>
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                    View snapshot
                  </summary>
                  <pre className="text-xs text-gray-400 mt-1 bg-gray-900 rounded p-2 overflow-x-auto max-h-40">
                    {JSON.stringify(entry.snapshot, null, 2)}
                  </pre>
                </details>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
