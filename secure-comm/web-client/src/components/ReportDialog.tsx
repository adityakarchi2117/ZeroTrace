import React, { useState, useEffect } from "react";
import { ReportReason, ProfileReportCreate } from "@/lib/profileTypes";
import profileApi from "@/lib/profileApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetUsername: string;
}

const REPORT_REASONS: { value: ReportReason; label: string; icon: string }[] = [
  { value: "fake_profile", label: "Fake profile", icon: "🎭" },
  { value: "impersonation", label: "Impersonation", icon: "👤" },
  { value: "harassment", label: "Harassment", icon: "⚠️" },
  { value: "spam", label: "Spam", icon: "📧" },
  { value: "inappropriate", label: "Inappropriate content", icon: "🚫" },
  { value: "other", label: "Other", icon: "📝" },
];

export default function ReportDialog({
  isOpen,
  onClose,
  targetUsername,
}: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState<string>("");

  // Reset form state when dialog opens with a new target
  useEffect(() => {
    if (isOpen) {
      setReason(null);
      setDescription("");
      setSubmitted(false);
      setReportId("");
    }
  }, [isOpen, targetUsername]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const payload: ProfileReportCreate = {
        reported_username: targetUsername,
        reason,
        description: description || undefined,
      };
      const result = await profileApi.report(payload);
      setReportId(result.report_id);
      setSubmitted(true);
    } catch (e) {
      console.error("Report failed:", e);
      alert("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason(null);
    setDescription("");
    setSubmitted(false);
    setReportId("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="w-full max-w-md bg-gray-900/90 rounded-2xl border border-gray-800 p-6 space-y-4">
        {submitted ? (
          <div className="text-center space-y-3 py-4">
            <div className="text-4xl">✅</div>
            <h3 className="text-white font-semibold">Report submitted</h3>
            <p className="text-gray-400 text-sm">
              Report ID: <code className="text-cyan-300">{reportId}</code>
            </p>
            <p className="text-gray-500 text-xs">
              We take reports seriously. An evidence snapshot of the profile has
              been captured.
            </p>
            <button
              className="px-4 py-2 rounded-lg bg-cyan-500/80 text-white hover:bg-cyan-500"
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Report @{targetUsername}
              </h2>
              <button
                className="text-gray-400 hover:text-white"
                onClick={handleClose}
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-400">
              Select a reason for reporting this profile. A snapshot of their
              current profile will be captured as evidence.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  className={`p-3 rounded-lg border text-left text-sm transition ${
                    reason === r.value
                      ? "border-red-400 bg-red-500/10 text-white"
                      : "border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-600"
                  }`}
                  onClick={() => setReason(r.value)}
                >
                  <span className="mr-1">{r.icon}</span> {r.label}
                </button>
              ))}
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details (optional)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              rows={3}
              maxLength={1000}
            />

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-200"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50"
                onClick={handleSubmit}
                disabled={!reason || submitting}
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
