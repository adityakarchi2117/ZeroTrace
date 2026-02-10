import React, { useEffect, useState } from "react";
import {
  PrivacySettings,
  VisibilityLevel,
  ActiveSession,
} from "@/lib/profileTypes";
import VisibilitySelector from "./VisibilitySelector";
import profileApi from "@/lib/profileApi";
import { Shield, Eye, MessageSquare, Search, Download } from "lucide-react";

interface Props {
  settings: PrivacySettings | null;
  onChange: (data: Partial<PrivacySettings>) => Promise<void>;
  onLoad: () => Promise<void>;
}

export default function PrivacyDashboard({
  settings,
  onChange,
  onLoad,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    onLoad();
  }, [onLoad]);

  if (!settings) {
    return (
      <div className="text-gray-400 text-sm py-8 text-center">Loading privacy settings…</div>
    );
  }

  const update = (key: keyof PrivacySettings, value: any) =>
    onChange({ [key]: value });

  return (
    <div className="space-y-5">
      {/* Profile Visibility */}
      <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-indigo-400" />
          <h3 className="text-white font-semibold">Profile Visibility</h3>
        </div>
        <div className="space-y-1">
          <VisibilitySelector
            label="Profile"
            value={settings.profile_visibility}
            onChange={(v) => update("profile_visibility", v)}
          />
          <VisibilitySelector
            label="Avatar"
            value={settings.avatar_visibility}
            onChange={(v) => update("avatar_visibility", v)}
          />
        </div>
      </div>

      {/* Activity Status */}
      <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-purple-400" />
          <h3 className="text-white font-semibold">Activity Status</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Control who can see your activity indicators.
        </p>
        <div className="space-y-1">
          <VisibilitySelector
            label="Online status"
            value={settings.online_visibility}
            onChange={(v) => update("online_visibility", v)}
          />
          <VisibilitySelector
            label="Last seen"
            value={settings.last_seen_visibility}
            onChange={(v) => update("last_seen_visibility", v)}
          />
          <VisibilitySelector
            label="Typing indicator"
            value={settings.typing_visibility}
            onChange={(v) => update("typing_visibility", v)}
          />
          <VisibilitySelector
            label="Read receipts"
            value={settings.read_receipts_visibility}
            onChange={(v) => update("read_receipts_visibility", v)}
          />
        </div>
      </div>

      {/* Communication */}
      <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-cyan-400" />
          <h3 className="text-white font-semibold">Communication</h3>
        </div>
        <div className="space-y-1">
          <VisibilitySelector
            label="Message requests"
            value={settings.message_request_policy}
            onChange={(v) => update("message_request_policy", v)}
          />
          <div className="flex items-center justify-between py-3">
            <div>
              <span className="text-sm text-gray-300">Discoverability</span>
              <p className="text-xs text-gray-500 mt-0.5">Allow others to find you via search</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.discovery_opt_in}
              onClick={() => update("discovery_opt_in", !settings.discovery_opt_in)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.discovery_opt_in ? 'bg-indigo-500' : 'bg-gray-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.discovery_opt_in ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Advanced */}
      <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
        <button
          className="w-full text-sm text-gray-400 hover:text-white flex items-center justify-between transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Advanced Options
          </span>
          <span>{showAdvanced ? '▾' : '▸'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-3">
            <button
              className="w-full px-4 py-3 rounded-lg bg-gray-900 text-gray-300 hover:text-white text-sm text-left border border-gray-800 hover:border-gray-700 transition-colors"
              onClick={async () => {
                try {
                  const data = await profileApi.exportProfile();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "zerotrace-profile-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  console.error("Export failed:", e);
                }
              }}
            >
              <span className="font-medium">Export all profile data</span>
              <p className="text-xs text-gray-500 mt-1">Download your data as JSON (GDPR compliant)</p>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
