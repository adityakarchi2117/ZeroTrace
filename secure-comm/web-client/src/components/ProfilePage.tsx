'use client';

import React, { useEffect, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { VisibilityLevel } from "@/lib/profileTypes";
import profileApi from "@/lib/profileApi";
import ProfilePreview from "./ProfilePreview";
import EditProfileModal from "./EditProfileModal";
import PrivacyDashboard from "./PrivacyDashboard";
import ProfileHistoryViewer from "./ProfileHistoryViewer";
import ReportDialog from "./ReportDialog";
import BlockedUsersPanel from "./BlockedUsersPanel";
import {
  X, Shield, AlertTriangle, Download, Eye, EyeOff,
  UserX, Flag, History, Edit3, ChevronRight, Lock, Smartphone,
  Monitor, Globe,
} from "lucide-react";

interface ProfilePageProps {
  onClose?: () => void;
}

type ProfileTab = 'overview' | 'privacy' | 'safety' | 'sessions';

export default function ProfilePage({ onClose }: ProfilePageProps) {
  const {
    profile,
    privacy,
    loadProfile,
    loadPrivacy,
    updateProfile,
    uploadAvatar,
    updatePrivacy,
    blockUser,
    user,
  } = useStore();

  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockInput, setBlockInput] = useState("");
  const [reportTarget, setReportTarget] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadProfile();
    loadPrivacy();
  }, [loadProfile, loadPrivacy]);

  const handleFieldVisibilityChange = useCallback(
    (field: string, level: VisibilityLevel) => {
      const current = privacy?.field_visibility || {};
      updatePrivacy({ field_visibility: { ...current, [field]: level } });
    },
    [privacy, updatePrivacy],
  );

  const handleRemovePhoto = useCallback(async () => {
    try {
      await profileApi.removeAvatar();
      loadProfile();
    } catch (e) {
      console.error("Failed to remove photo:", e);
    }
  }, [loadProfile]);

  const handleBlock = useCallback(async () => {
    if (!blockInput.trim()) return;
    try {
      await blockUser(blockInput.trim());
      setBlockInput("");
    } catch (e) {
      console.error("Failed to block user:", e);
    }
  }, [blockInput, blockUser]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await profileApi.exportProfile();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zerotrace-profile-${user?.username || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  }, [user?.username]);

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Profile', icon: <Eye className="w-4 h-4" /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield className="w-4 h-4" /> },
    { id: 'safety', label: 'Safety', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'sessions', label: 'Devices', icon: <Smartphone className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="min-h-full flex items-start justify-center py-6 px-4">
        <div className="w-full max-w-4xl bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-gray-800/80 shadow-2xl relative animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-800/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Profile & Privacy</h1>
                <p className="text-xs text-gray-500">You own your data. Private by default.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-800/60 px-5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowEdit(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 text-sm transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Profile
                  </button>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 text-sm transition-colors"
                  >
                    <History className="w-4 h-4" /> History
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 text-sm transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export Data'}
                  </button>
                </div>

                {/* Profile Preview */}
                <ProfilePreview profile={profile} />

                {/* Verification Badges */}
                {profile?.verification_badges && profile.verification_badges.length > 0 && (
                  <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/10 p-4 flex items-center gap-3">
                    <Shield className="w-5 h-5 text-emerald-400" />
                    <div>
                      <p className="text-emerald-300 text-sm font-medium">Verified Profile</p>
                      <p className="text-emerald-400/60 text-xs">
                        {profile.verification_badges.length} verification badge{profile.verification_badges.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                )}

                {/* Privacy Summary Card */}
                {privacy && (
                  <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-4">
                    <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-indigo-400" /> Privacy Summary
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Profile', value: privacy.profile_visibility },
                        { label: 'Avatar', value: privacy.avatar_visibility },
                        { label: 'Online status', value: privacy.online_visibility },
                        { label: 'Last seen', value: privacy.last_seen_visibility },
                      ].map((item) => (
                        <div key={item.label} className="text-center p-2 rounded-lg bg-gray-900/50">
                          <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            item.value === 'nobody' ? 'bg-red-500/10 text-red-400' :
                            item.value === 'friends' ? 'bg-indigo-500/10 text-indigo-400' :
                            'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setActiveTab('privacy')}
                      className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      Manage privacy settings <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Privacy Tab */}
            {activeTab === 'privacy' && (
              <PrivacyDashboard
                settings={privacy}
                onChange={updatePrivacy}
                onLoad={loadPrivacy}
              />
            )}

            {/* Safety Tab */}
            {activeTab === 'safety' && (
              <div className="space-y-5">
                {/* Block Users */}
                <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <UserX className="w-5 h-5 text-red-400" />
                    <h3 className="text-white font-semibold">Block Users</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    Blocked users cannot see your profile, send you messages, or find you in search.
                    Blocking is mutual and enforced across all features.
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-indigo-500 transition-colors"
                      placeholder="Enter username to block"
                      value={blockInput}
                      onChange={(e) => setBlockInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleBlock()}
                    />
                    <button
                      className="px-4 py-2.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 text-sm font-medium transition-colors disabled:opacity-40"
                      onClick={handleBlock}
                      disabled={!blockInput.trim()}
                    >
                      Block
                    </button>
                  </div>
                  <button
                    onClick={() => setShowBlocked(true)}
                    className="mt-3 text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    View blocked users <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Report Users */}
                <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Flag className="w-5 h-5 text-amber-400" />
                    <h3 className="text-white font-semibold">Report a Profile</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">
                    Report fake profiles, impersonation, harassment, or abuse.
                    A snapshot of the reported profile is captured as evidence.
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-amber-500 transition-colors"
                      placeholder="Enter username to report"
                      value={reportTarget}
                      onChange={(e) => setReportTarget(e.target.value)}
                    />
                    <button
                      className="px-4 py-2.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 text-sm font-medium transition-colors disabled:opacity-40"
                      onClick={() => { if (reportTarget.trim()) setShowReport(true); }}
                      disabled={!reportTarget.trim()}
                    >
                      Report
                    </button>
                  </div>
                </div>

                {/* Safety Tips */}
                <div className="rounded-xl border border-gray-800 bg-gray-800/30 p-5">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-400" /> Safety Tips
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      Keep your profile visibility set to &quot;Friends only&quot; for maximum privacy
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      Verify contacts using QR codes to prevent impersonation
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      Review active sessions regularly and revoke unknown devices
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      Export your data periodically as an encrypted backup
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
              <SessionsPanel />
            )}
          </div>

          {/* Modals */}
          <EditProfileModal
            isOpen={showEdit}
            onClose={() => setShowEdit(false)}
            profile={profile}
            onSave={updateProfile}
            onUpload={uploadAvatar}
            onRemovePhoto={handleRemovePhoto}
            fieldVisibility={privacy?.field_visibility}
            onFieldVisibilityChange={handleFieldVisibilityChange}
          />

          <ProfileHistoryViewer
            isOpen={showHistory}
            onClose={() => setShowHistory(false)}
            onRollback={() => loadProfile()}
          />

          <ReportDialog
            isOpen={showReport}
            onClose={() => { setShowReport(false); setReportTarget(""); }}
            targetUsername={reportTarget}
          />

          <BlockedUsersPanel
            isOpen={showBlocked}
            onClose={() => setShowBlocked(false)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Sessions Panel (embedded) ── */
function SessionsPanel() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await profileApi.getSessions();
        setSessions(data);
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const revokeSession = async (id: number) => {
    try {
      await profileApi.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
    } catch (e) {
      console.error("Failed to revoke session:", e);
    }
  };

  const revokeAll = async () => {
    try {
      await profileApi.revokeAllSessions();
      setSessions((s) => s.filter((x) => x.is_current));
    } catch (e) {
      console.error("Failed to revoke all:", e);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile': return <Smartphone className="w-5 h-5 text-indigo-400" />;
      case 'desktop': return <Monitor className="w-5 h-5 text-purple-400" />;
      default: return <Globe className="w-5 h-5 text-cyan-400" />;
    }
  };

  if (loading) {
    return <div className="text-gray-400 text-sm py-8 text-center">Loading sessions…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Active Sessions</h3>
          <p className="text-xs text-gray-500 mt-1">Devices logged into your account</p>
        </div>
        {sessions.length > 1 && (
          <button
            className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 text-xs font-medium transition-colors"
            onClick={revokeAll}
          >
            Sign out all other devices
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <Monitor className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No active session data available</p>
          <p className="text-gray-600 text-xs mt-1">Session tracking requires a server restart</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between rounded-xl p-4 border transition-colors ${
                s.is_current
                  ? 'bg-indigo-500/5 border-indigo-500/20'
                  : 'bg-gray-800/40 border-gray-800 hover:bg-gray-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                {getDeviceIcon(s.device_type)}
                <div>
                  <p className="text-sm text-white font-medium">
                    {s.device_name || 'Unknown device'}
                    {s.is_current && (
                      <span className="ml-2 text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.device_type} · {s.ip_address || 'N/A'} · Last active {new Date(s.last_active).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {!s.is_current && (
                <button
                  className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors"
                  onClick={() => revokeSession(s.id)}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}