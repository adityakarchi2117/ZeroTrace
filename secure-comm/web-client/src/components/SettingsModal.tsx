'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { useAppearance, accentColors, ThemeMode, AccentColor, FontSize, ChatDensity } from '@/lib/useAppearance';
import { WallpaperSettings } from './WallpaperSettings';
import { api } from '@/lib/api';
import profileApi from '@/lib/profileApi';
import { PrivacySettings, VisibilityLevel, ActiveSession } from '@/lib/profileTypes';
import VisibilitySelector from './VisibilitySelector';
import { X, User, Shield, Bell, Palette, Key, Download, Sun, Moon, Monitor, Check, Circle, Type, Camera, Save, Loader2, Eye, Lock, Smartphone, Globe, UserX, ChevronRight, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { loadBubbleStyle, saveBubbleStyle, loadFontStyle, saveFontStyle, bubbleStyles, fontStyles, BubbleStyle, FontStyle } from '@/lib/themeSync';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, logout } = useStore();
  const [activeTab, setActiveTab] = useState('profile');

  // Use the shared appearance hook
  const { settings, updateSettings, getAccentGradient } = useAppearance();
  const { theme, accent, fontSize, density, messagePreview, animationsEnabled } = settings;

  // Bubble style and font state
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>('rounded');
  const [fontStyle, setFontStyle] = useState<FontStyle>('inter');

  // Load bubble style and font preferences on mount
  useEffect(() => {
    setBubbleStyle(loadBubbleStyle());
    setFontStyle(loadFontStyle());
  }, []);

  // Wrapper for updating settings
  const saveSettings = (newSettings: Partial<{
    theme: ThemeMode;
    accent: AccentColor;
    fontSize: FontSize;
    density: ChatDensity;
    messagePreview: boolean;
    animationsEnabled: boolean;
  }>) => {
    updateSettings(newSettings);
    api.updateSettings(newSettings).catch(e => console.error('Failed to save settings to server:', e));
  };

  // Update bubble style
  const handleBubbleStyleChange = (style: BubbleStyle) => {
    setBubbleStyle(style);
    saveBubbleStyle(style);
  };

  // Update font style
  const handleFontStyleChange = (font: FontStyle) => {
    setFontStyle(font);
    saveFontStyle(font);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'privacy', label: 'Privacy', icon: Eye },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'account', label: 'Account', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const handleLogout = () => {
    logout();
    onClose();
  };

  // Notification settings state
  const [notifications, setNotifications] = useState({
    messageNotifications: true,
    soundNotifications: true,
  });

  const updateNotification = (key: keyof typeof notifications, value: boolean) => {
    setNotifications(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem('zerotrace_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  // Load notification settings on mount
  useEffect(() => {
    const saved = localStorage.getItem('zerotrace_notifications');
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load notification settings:', e);
      }
    }
  }, []);

  // Profile editing state
  const [profileForm, setProfileForm] = useState({
    display_name: '',
    bio: '',
    status_message: '',
    location_city: '',
    website: '',
    pronouns: '',
    birthday: '',
    emoji_badge: '',
    social_links: {} as Record<string, string>,
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Privacy state
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Account management state
  const [accountStatus, setAccountStatus] = useState<{
    username: string;
    email: string;
    can_change_username: boolean;
    days_until_username_change: number;
    last_username_change: string | null;
    previous_usernames: Array<{ username: string; changed_at: string }>;
    created_at: string | null;
  } | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' });
  const [usernameChanging, setUsernameChanging] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountActionMsg, setAccountActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper: construct full avatar URL
  const getAvatarUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${API_BASE}${url}`;
  };

  // Load profile on mount
  useEffect(() => {
    if (!user?.id) return;
    profileApi.getProfile(user.id).then((p) => {
      setProfileForm({
        display_name: p.display_name || '',
        bio: p.bio || '',
        status_message: p.status_message || '',
        location_city: p.location_city || '',
        website: p.website || '',
        pronouns: p.pronouns || '',
        birthday: p.birthday || '',
        emoji_badge: p.emoji_badge || '',
        social_links: p.social_links || {},
      });
      if (p.avatar_url) setAvatarPreview(p.avatar_url);
    }).catch(() => { });
  }, [user?.id]);

  // Load privacy settings
  const loadPrivacy = useCallback(async () => {
    setPrivacyLoading(true);
    setPrivacyError(false);
    try {
      const p = await profileApi.getPrivacy();
      setPrivacySettings(p);
    } catch (e: any) {
      // Handle 404 gracefully - privacy settings not yet configured
      if (e?.response?.status === 404) {
        // Set default privacy settings for new users
        console.log('Privacy settings not found, using defaults');
        setPrivacySettings({
          user_id: user?.id || 0,
          profile_visibility: 'friends',
          avatar_visibility: 'friends',
          last_seen_visibility: 'friends',
          online_visibility: 'friends',
          typing_visibility: 'friends',
          read_receipts_visibility: 'friends',
          message_request_policy: 'friends',
          discovery_opt_in: true,
          field_visibility: {},
        });
      } else {
        console.error('Failed to load privacy settings:', e);
        setPrivacyError(true);
      }
    } finally {
      setPrivacyLoading(false);
    }
  }, []);


  useEffect(() => {
    loadPrivacy();
  }, [loadPrivacy]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const s = await profileApi.getSessions();
      setSessions(s);
    } catch (e: any) {
      // Sessions endpoint may not be implemented - silently ignore 404
      if (e?.response?.status === 404) {
        console.log('Sessions endpoint not available, using empty list');
        setSessions([]);
      } else {
        console.error('Failed to load sessions:', e);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const updatePrivacySetting = async (key: keyof PrivacySettings, value: any) => {
    try {
      await profileApi.updatePrivacy({ [key]: value });
      setPrivacySettings(prev => prev ? { ...prev, [key]: value } : null);
    } catch (e) {
      console.error('Failed to update privacy:', e);
    }
  };

  const revokeSession = async (id: number) => {
    try {
      await profileApi.revokeSession(id);
      setSessions(s => s.filter(x => x.id !== id));
    } catch (e) {
      console.error('Failed to revoke session:', e);
    }
  };

  const revokeAllSessions = async () => {
    try {
      await profileApi.revokeAllSessions();
      setSessions(s => s.filter(x => x.is_current));
    } catch (e) {
      console.error('Failed to revoke all:', e);
    }
  };

  // Account management functions
  const loadAccountStatus = useCallback(async () => {
    setAccountLoading(true);
    try {
      const status = await api.getAccountStatus();
      setAccountStatus(status);
    } catch (e) {
      console.error('Failed to load account status:', e);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const handleUsernameChange = async () => {
    if (!usernameForm.newUsername.trim() || !usernameForm.password) {
      setUsernameMsg({ type: 'error', text: 'Please fill in all fields' });
      return;
    }

    setUsernameChanging(true);
    setUsernameMsg(null);
    try {
      const result = await api.changeUsername(usernameForm.newUsername.trim(), usernameForm.password);
      setUsernameMsg({ type: 'success', text: result.message });
      setUsernameForm({ newUsername: '', password: '' });
      loadAccountStatus(); // Refresh account status
      // Force re-login after username change
      setTimeout(() => {
        logout();
        onClose();
      }, 2000);
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Failed to change username';
      setUsernameMsg({ type: 'error', text: msg });
    } finally {
      setUsernameChanging(false);
    }
  };

  const handleDisableAccount = async () => {
    if (!disablePassword) {
      setAccountActionMsg({ type: 'error', text: 'Please enter your password' });
      return;
    }

    setDisabling(true);
    setAccountActionMsg(null);
    try {
      const result = await api.disableAccount(disablePassword);
      setAccountActionMsg({ type: 'success', text: result.message });
      setDisablePassword('');
      // Log out after disabling
      setTimeout(() => {
        logout();
        onClose();
      }, 2000);
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Failed to disable account';
      setAccountActionMsg({ type: 'error', text: msg });
    } finally {
      setDisabling(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setAccountActionMsg({ type: 'error', text: 'Please enter your password' });
      return;
    }

    setDeleting(true);
    setAccountActionMsg(null);
    try {
      const result = await api.deleteAccount(deletePassword);
      setAccountActionMsg({ type: 'success', text: result.message });
      setDeletePassword('');
      setShowDeleteConfirm(false);
      // Log out after deleting
      setTimeout(() => {
        logout();
        onClose();
      }, 3000);
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Failed to delete account';
      setAccountActionMsg({ type: 'error', text: msg });
    } finally {
      setDeleting(false);
    }
  };


  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(profileForm)) {
        if (k === 'social_links') {
          const filtered: Record<string, string> = {};
          for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
            if (sv?.trim()) filtered[sk] = sv.trim();
          }
          if (Object.keys(filtered).length > 0) payload.social_links = filtered;
        } else if (typeof v === 'string' && v.trim()) {
          payload[k] = v.trim();
        }
      }
      await profileApi.updateProfile(payload);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
      // Dispatch event so other components (sidebar, etc.) can refresh
      window.dispatchEvent(new CustomEvent('profile_updated', { detail: { userId: user?.id, ...payload } }));
      setTimeout(() => setProfileMsg(null), 3000);
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err?.response?.data?.detail || 'Failed to update profile' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileMsg({ type: 'error', text: 'Image must be under 5 MB' });
      return;
    }
    try {
      setProfileSaving(true);
      const result = await profileApi.uploadAvatar(file);
      setAvatarPreview(result.avatar_url);
      setProfileMsg({ type: 'success', text: 'Avatar uploaded!' });
      // Dispatch event so other components can refresh
      window.dispatchEvent(new CustomEvent('profile_updated', { detail: { userId: user?.id, avatar_url: result.avatar_url } }));
      setTimeout(() => setProfileMsg(null), 3000);
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to upload avatar' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await profileApi.removeAvatar();
      setAvatarPreview(null);
      setProfileMsg({ type: 'success', text: 'Avatar removed' });
      // Dispatch event so other components can refresh
      window.dispatchEvent(new CustomEvent('profile_updated', { detail: { userId: user?.id, avatar_url: null } }));
      setTimeout(() => setProfileMsg(null), 3000);
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to remove avatar' });
    }
  };

  const exportKeys = () => {
    try {
      // Get keys from localStorage
      const keyStorage = localStorage.getItem('zerotrace_keys');
      if (!keyStorage) {
        alert('No keys found to export');
        return;
      }

      // Parse and create export object
      const keys = JSON.parse(keyStorage);
      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        user: user?.username,
        keys: keys,
        warning: 'Keep this file secure! Anyone with these keys can decrypt your messages.',
      };

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zerotrace-keys-${user?.username || 'backup'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Keys exported successfully! Store this file in a secure location.');
    } catch (error) {
      console.error('Failed to export keys:', error);
      alert('Failed to export keys. Please try again.');
    }
  };

  // Load account status when account tab is active
  useEffect(() => {
    if (activeTab === 'account') {
      loadAccountStatus();
    }
  }, [activeTab, loadAccountStatus]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-cipher-dark border border-gray-700/60 rounded-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-700/60">
          <h2 className="text-xl font-semibold text-white">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 bg-cipher-darker/70 border-r border-gray-700/50 p-4">
            <nav className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === tab.id
                      ? 'text-white'
                      : 'text-gray-300 hover:bg-cipher-light/60'
                      }`}
                    style={activeTab === tab.id ? { background: getAccentGradient() } : undefined}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Profile Information
                </h3>

                {/* Status message */}
                {profileMsg && (
                  <div className={`px-4 py-2 rounded-lg text-sm font-medium ${profileMsg.type === 'success'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                    }`}>
                    {profileMsg.text}
                  </div>
                )}

                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {avatarPreview ? (
                      <img
                        src={getAvatarUrl(avatarPreview) || ''}
                        alt="Avatar"
                        className="w-20 h-20 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                        {(user?.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white shadow-lg transition-colors"
                      title="Change avatar"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAvatarUpload(f);
                      }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{user?.username}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                    {avatarPreview && (
                      <button
                        onClick={handleRemoveAvatar}
                        className="text-xs text-red-500 hover:text-red-400 mt-1"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>

                {/* Basic fields */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={profileForm.display_name}
                        onChange={(e) => setProfileForm(p => ({ ...p, display_name: e.target.value }))}
                        placeholder="How others see your name"
                        maxLength={50}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Emoji Badge
                      </label>
                      <input
                        type="text"
                        value={profileForm.emoji_badge}
                        onChange={(e) => setProfileForm(p => ({ ...p, emoji_badge: e.target.value }))}
                        placeholder="🔥"
                        maxLength={2}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status Message
                    </label>
                    <input
                      type="text"
                      value={profileForm.status_message}
                      onChange={(e) => setProfileForm(p => ({ ...p, status_message: e.target.value }))}
                      placeholder="What's on your mind?"
                      maxLength={100}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={profileForm.bio}
                      onChange={(e) => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                      placeholder="Tell others about yourself"
                      maxLength={500}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <p className="text-xs text-gray-400 text-right mt-1">{profileForm.bio.length}/500</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Location
                      </label>
                      <input
                        type="text"
                        value={profileForm.location_city}
                        onChange={(e) => setProfileForm(p => ({ ...p, location_city: e.target.value }))}
                        placeholder="City"
                        maxLength={60}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Pronouns
                      </label>
                      <input
                        type="text"
                        value={profileForm.pronouns}
                        onChange={(e) => setProfileForm(p => ({ ...p, pronouns: e.target.value }))}
                        placeholder="e.g. they/them"
                        maxLength={30}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Birthday
                      </label>
                      <input
                        type="date"
                        value={profileForm.birthday}
                        onChange={(e) => setProfileForm(p => ({ ...p, birthday: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={profileForm.website}
                      onChange={(e) => setProfileForm(p => ({ ...p, website: e.target.value }))}
                      placeholder="https://example.com"
                      maxLength={200}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Social Links */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Social Links</p>
                    <div className="grid grid-cols-2 gap-3">
                      {['twitter', 'github', 'linkedin', 'instagram'].map((platform) => (
                        <div key={platform} className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm w-20 capitalize">{platform}</span>
                          <input
                            value={profileForm.social_links[platform] || ''}
                            onChange={(e) =>
                              setProfileForm(p => ({
                                ...p,
                                social_links: { ...p.social_links, [platform]: e.target.value },
                              }))
                            }
                            placeholder={`@username`}
                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {profileSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {profileSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Privacy Controls
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Control who can see your information. Private by default.
                </p>

                {privacyLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading privacy settings...</span>
                  </div>
                ) : privacyError || !privacySettings ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-gray-500 dark:text-gray-400">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unable to load privacy settings</p>
                      <p className="text-xs">Please check your connection and try again</p>
                    </div>
                    <button
                      onClick={loadPrivacy}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Profile Visibility */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Eye className="w-4 h-4 text-blue-500" />
                        <h4 className="font-medium text-gray-900 dark:text-white">Profile Visibility</h4>
                      </div>
                      <VisibilitySelector label="Profile" value={privacySettings.profile_visibility} onChange={(v) => updatePrivacySetting('profile_visibility', v)} />
                      <VisibilitySelector label="Avatar" value={privacySettings.avatar_visibility} onChange={(v) => updatePrivacySetting('avatar_visibility', v)} />
                    </div>

                    {/* Activity Status */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-4 h-4 text-purple-500" />
                        <h4 className="font-medium text-gray-900 dark:text-white">Activity Status</h4>
                      </div>
                      <VisibilitySelector label="Online status" value={privacySettings.online_visibility} onChange={(v) => updatePrivacySetting('online_visibility', v)} />
                      <VisibilitySelector label="Last seen" value={privacySettings.last_seen_visibility} onChange={(v) => updatePrivacySetting('last_seen_visibility', v)} />
                      <VisibilitySelector label="Typing indicator" value={privacySettings.typing_visibility} onChange={(v) => updatePrivacySetting('typing_visibility', v)} />
                      <VisibilitySelector label="Read receipts" value={privacySettings.read_receipts_visibility} onChange={(v) => updatePrivacySetting('read_receipts_visibility', v)} />
                    </div>

                    {/* Communication */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Lock className="w-4 h-4 text-cyan-500" />
                        <h4 className="font-medium text-gray-900 dark:text-white">Communication</h4>
                      </div>
                      <VisibilitySelector label="Message requests" value={privacySettings.message_request_policy} onChange={(v) => updatePrivacySetting('message_request_policy', v)} />
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-start gap-2">
                          <Globe className="w-5 h-5 text-gray-500 mt-0.5" />
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Discoverability</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Allow others to find you via search</p>
                          </div>
                        </div>
                        <button
                          onClick={() => updatePrivacySetting('discovery_opt_in', !privacySettings.discovery_opt_in)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${privacySettings.discovery_opt_in ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                        >
                          <span
                            className={`${privacySettings.discovery_opt_in ? 'translate-x-6' : 'translate-x-1'
                              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Data Export */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Download className="w-4 h-4 text-green-500" />
                        <h4 className="font-medium text-gray-900 dark:text-white">Data Export</h4>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Download all your profile data (GDPR compliant)</p>
                      <button
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 transition-colors"
                        onClick={async () => {
                          try {
                            const data = await profileApi.exportProfile();
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `zerotrace-profile-export.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            console.error('Export failed:', e);
                          }
                        }}
                      >
                        Export Profile Data
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Security
                </h3>

                {/* E2E Status */}
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      End-to-End Encryption Active
                    </span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your messages are encrypted with X25519 + Ed25519 cryptography.
                    Only you and your recipients can read them.
                  </p>
                </div>

                {/* Key Management */}
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                  <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Key className="w-4 h-4" /> Cryptographic Keys
                  </h4>
                  <button
                    onClick={exportKeys}
                    className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Key Backup</span>
                  </button>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Export your keys for backup or device migration. Keep this file secure.
                  </p>
                </div>

                {/* Active Sessions */}
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> Active Sessions
                    </h4>
                    <button
                      onClick={loadSessions}
                      className="text-sm text-blue-500 hover:text-blue-400 flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {sessionsLoading ? (
                    <div className="flex items-center gap-2 text-gray-400 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading sessions...</span>
                    </div>
                  ) : sessions.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">Click refresh to load active sessions.</p>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            {s.device_type === 'mobile' ? (
                              <Smartphone className="w-5 h-5 text-gray-400" />
                            ) : s.device_type === 'desktop' ? (
                              <Monitor className="w-5 h-5 text-gray-400" />
                            ) : (
                              <Globe className="w-5 h-5 text-gray-400" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {s.device_name || 'Unknown device'}
                                {s.is_current && (
                                  <span className="ml-2 text-xs text-green-500 font-normal">(this device)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {s.ip_address || 'Unknown IP'} · {new Date(s.last_active).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          {!s.is_current && (
                            <button
                              onClick={() => revokeSession(s.id)}
                              className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      ))}
                      {sessions.length > 1 && (
                        <button
                          onClick={revokeAllSessions}
                          className="text-sm text-red-500 hover:text-red-400 mt-1"
                        >
                          Sign out all other devices
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Safety Tips */}
                <div className="p-4 border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200">Security Tips</h4>
                  </div>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1.5 ml-6 list-disc">
                    <li>Never share your encryption keys with anyone</li>
                    <li>Regularly review active sessions and revoke unknown devices</li>
                    <li>Enable two-factor authentication when available</li>
                    <li>Back up your keys before clearing browser data</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Account Management
                </h3>

                {/* Account Info */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                      <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {user?.username}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {user?.email}
                      </p>
                      {accountStatus?.created_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          Member since {new Date(accountStatus.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Change Username */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                    Change Username
                  </h4>

                  {accountStatus && !accountStatus.can_change_username ? (
                    <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800/30 mb-4">
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Username change unavailable
                          </p>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                            You can change your username again in {accountStatus.days_until_username_change} days.
                            Usernames can only be changed once every 14 days.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Choose a new unique username. This will change how others see you.
                        Note: You can only do this once every 14 days.
                      </p>

                      <div className="grid gap-4 max-w-md">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            New Username
                          </label>
                          <input
                            type="text"
                            value={usernameForm.newUsername}
                            onChange={(e) => setUsernameForm({ ...usernameForm, newUsername: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Enter new username"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Current Password
                          </label>
                          <input
                            type="password"
                            value={usernameForm.password}
                            onChange={(e) => setUsernameForm({ ...usernameForm, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Confirm with password"
                          />
                        </div>

                        {usernameMsg && (
                          <div className={`text-sm ${usernameMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {usernameMsg.text}
                          </div>
                        )}

                        <button
                          onClick={handleUsernameChange}
                          disabled={usernameChanging || !usernameForm.newUsername || !usernameForm.password}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {usernameChanging ? 'Updating...' : 'Update Username'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h4 className="font-medium text-red-600 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Danger Zone
                  </h4>

                  <div className="space-y-4">
                    {/* Disable Account */}
                    <div className="p-4 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-red-900/10">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white">Disable Account</h5>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Temporarily disable your account. You can reactivate it by logging in again.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3 items-end">
                        <div className="flex-1 max-w-xs">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Enter Password to Disable
                          </label>
                          <input
                            type="password"
                            value={disablePassword}
                            onChange={(e) => setDisablePassword(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                            placeholder="Your password"
                          />
                        </div>
                        <button
                          onClick={handleDisableAccount}
                          disabled={disabling || !disablePassword}
                          className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
                        >
                          {disabling ? 'Disabling...' : 'Disable Account'}
                        </button>
                      </div>
                    </div>

                    {/* Delete Account */}
                    <div className="p-4 border border-red-200 dark:border-red-900/30 rounded-lg bg-red-50 dark:bg-red-900/10">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h5 className="font-medium text-red-600">Delete Account</h5>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Permanently delete your account and all data. There is a 30-day grace period.
                          </p>
                        </div>
                      </div>

                      {!showDeleteConfirm ? (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                        >
                          I want to delete my account
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-800 dark:text-red-200">
                            <strong>Warning:</strong> This action cannot be undone after 30 days. All your messages, contacts, and shared data will be permanently removed.
                          </div>

                          <div className="flex gap-3 items-end">
                            <div className="flex-1 max-w-xs">
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Confirm Password to Delete
                              </label>
                              <input
                                type="password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-red-300 dark:border-red-800 rounded-lg bg-white dark:bg-gray-700"
                                placeholder="Your password"
                              />
                            </div>
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleting || !deletePassword}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
                            >
                              {deleting ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(false);
                                setDeletePassword('');
                                setAccountActionMsg(null);
                              }}
                              className="px-3 py-1.5 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {accountActionMsg && (
                      <div className={`text-sm p-2 rounded ${accountActionMsg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {accountActionMsg.text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Notification Preferences
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Message Notifications
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Get notified when you receive new messages
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.messageNotifications}
                      onChange={(e) => updateNotification('messageNotifications', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Sound Notifications
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Play sound for new messages
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.soundNotifications}
                      onChange={(e) => updateNotification('soundNotifications', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Appearance
                </h3>

                {/* Theme Mode */}
                <div className="space-y-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    Theme Mode
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'light' as ThemeMode, icon: Sun, label: 'Light' },
                      { value: 'dark' as ThemeMode, icon: Moon, label: 'Dark' },
                      { value: 'system' as ThemeMode, icon: Monitor, label: 'System' },
                    ].map((option) => {
                      const Icon = option.icon;
                      const isSelected = theme === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ theme: option.value })}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                        >
                          <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-500' : 'text-gray-500'}`} />
                          <span className={`text-sm font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {option.label}
                          </span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-blue-500 absolute top-2 right-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accent Color */}
                <div className="space-y-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    Accent Color
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {(Object.keys(accentColors) as AccentColor[]).map((color) => {
                      const colorConfig = accentColors[color];
                      const isSelected = accent === color;
                      return (
                        <button
                          key={color}
                          onClick={() => saveSettings({ accent: color })}
                          className={`relative w-12 h-12 rounded-full transition-transform hover:scale-110 ${isSelected ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : ''
                            }`}
                          style={{
                            background: `linear-gradient(135deg, ${colorConfig.primary}, ${colorConfig.secondary})`,
                            boxShadow: isSelected ? `0 0 0 2px ${colorConfig.primary}` : undefined,
                          }}
                          title={colorConfig.name}
                        >
                          {isSelected && (
                            <Check className="w-5 h-5 text-white absolute inset-0 m-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Selected: {accentColors[accent].name}
                  </p>
                </div>

                {/* Font Size */}
                <div className="space-y-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    Font Size
                  </p>
                  <div className="flex items-center gap-4">
                    {[
                      { value: 'small' as FontSize, label: 'Small', size: 'text-sm' },
                      { value: 'medium' as FontSize, label: 'Medium', size: 'text-base' },
                      { value: 'large' as FontSize, label: 'Large', size: 'text-lg' },
                    ].map((option) => {
                      const isSelected = fontSize === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ fontSize: option.value })}
                          className={`px-4 py-2 rounded-lg border-2 transition-all ${option.size} ${isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                            }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chat Density */}
                <div className="space-y-3">
                  <p className="font-medium text-gray-900 dark:text-white">
                    Chat Density
                  </p>
                  <div className="space-y-2">
                    {[
                      { value: 'compact' as ChatDensity, label: 'Compact', desc: 'More messages visible' },
                      { value: 'comfortable' as ChatDensity, label: 'Comfortable', desc: 'Balanced spacing' },
                      { value: 'spacious' as ChatDensity, label: 'Spacious', desc: 'More breathing room' },
                    ].map((option) => {
                      const isSelected = density === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="density"
                              checked={isSelected}
                              onChange={() => saveSettings({ density: option.value })}
                              className="w-4 h-4 text-blue-600"
                            />
                            <div>
                              <p className={`font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                                {option.label}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {option.desc}
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Options */}
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="font-medium text-gray-900 dark:text-white">
                    Additional Options
                  </p>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Message Preview
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Show message preview in sidebar
                      </p>
                    </div>
                    <button
                      onClick={() => saveSettings({ messagePreview: !messagePreview })}
                      className={`relative w-12 h-6 rounded-full transition-colors ${messagePreview ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${messagePreview ? 'translate-x-7' : 'translate-x-1'
                        }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Animations
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Enable UI animations and transitions
                      </p>
                    </div>
                    <button
                      onClick={() => saveSettings({ animationsEnabled: !animationsEnabled })}
                      className={`relative w-12 h-6 rounded-full transition-colors ${animationsEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${animationsEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`} />
                    </button>
                  </div>
                </div>

                {/* Message Style (Theme Sync) */}
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Message Style
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Your message style will be visible to recipients
                    </p>
                  </div>

                  {/* Bubble Style */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bubble Style
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: 'rounded' as BubbleStyle, label: 'Rounded', desc: 'Classic smooth' },
                        { value: 'glass' as BubbleStyle, label: 'Glass', desc: 'Translucent' },
                        { value: 'neon' as BubbleStyle, label: 'Neon', desc: 'Glow effect' },
                        { value: 'minimal' as BubbleStyle, label: 'Minimal', desc: 'Clean & flat' },
                        { value: 'gradient' as BubbleStyle, label: 'Gradient', desc: 'Multi-tone' },
                        { value: 'retro' as BubbleStyle, label: 'Retro', desc: 'Pixel sharp' },
                        { value: 'elegant' as BubbleStyle, label: 'Elegant', desc: 'Soft & round' },
                        { value: 'brutal' as BubbleStyle, label: 'Brutal', desc: 'Bold edges' },
                      ].map((option) => {
                        const isSelected = bubbleStyle === option.value;
                        // Classes match ChatView's bubbleShapeClass for visual consistency
                        const previewClass = (() => {
                          switch (option.value) {
                            case 'glass': return 'rounded-2xl backdrop-blur-md border border-white/10';
                            case 'neon': return 'rounded-2xl';
                            case 'minimal': return 'rounded-lg border border-white/5 shadow-none';
                            case 'gradient': return 'rounded-2xl';
                            case 'retro': return 'rounded-none border-2 border-white/20 shadow-[3px_3px_0px_rgba(0,0,0,0.3)]';
                            case 'elegant': return 'rounded-3xl border border-white/5';
                            case 'brutal': return 'rounded-sm border-2 border-white/30 shadow-[4px_4px_0px_rgba(255,255,255,0.15)]';
                            default: return 'rounded-2xl';
                          }
                        })();
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleBubbleStyleChange(option.value)}
                            className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all ${isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                          >
                            <div
                              className={`w-12 h-7 flex items-center justify-center ${previewClass}`}
                              style={{
                                background: option.value === 'gradient'
                                  ? `linear-gradient(160deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary}, ${accentColors[accent].primary}dd)`
                                  : `linear-gradient(135deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary})`,
                                boxShadow: option.value === 'neon' ? `0 0 10px ${accentColors[accent].primary}50` : undefined
                              }}
                            >
                              <Circle className="w-2.5 h-2.5 text-white" />
                            </div>
                            <span className={`text-[10px] font-medium leading-tight ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Font Style */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Message Font
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'inter' as FontStyle, label: 'Sans-serif', sample: 'Hello!', fontClass: 'font-sans' },
                        { value: 'mono' as FontStyle, label: 'Monospace', sample: 'Hello!', fontClass: 'font-mono' },
                        { value: 'serif' as FontStyle, label: 'Serif', sample: 'Hello!', fontClass: 'font-serif' },
                        { value: 'cursive' as FontStyle, label: 'Cursive', sample: 'Hello!', fontClass: 'font-cursive' },
                        { value: 'rounded' as FontStyle, label: 'Rounded', sample: 'Hello!', fontClass: 'font-rounded' },
                        { value: 'code' as FontStyle, label: 'Code', sample: 'Hello!', fontClass: 'font-code' },
                      ].map((option) => {
                        const isSelected = fontStyle === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleFontStyleChange(option.value)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all ${isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                          >
                            <Type className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-500'}`} />
                            <div className="text-left min-w-0">
                              <p className={`text-xs font-medium leading-tight ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {option.label}
                              </p>
                              <p className={`text-[11px] text-gray-500 ${option.fontClass} truncate`}>
                                {option.sample}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Wallpaper Settings */}
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <WallpaperSettings />
                </div>

                {/* Preview */}
                <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="font-medium text-gray-900 dark:text-white">
                    Preview
                  </p>
                  <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                        style={{ background: `linear-gradient(135deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary})` }}
                      >
                        J
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">John Doe</span>
                          <span className="text-xs text-gray-500">12:34 PM</span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 mt-1">
                          This is how your messages will look with the current settings! 🎨
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <div
                        className={`px-4 py-2 text-white max-w-xs ${fontStyles[fontStyle] || 'font-sans'} ${(() => {
                          switch (bubbleStyle) {
                            case 'minimal': return 'rounded-lg border border-white/5';
                            case 'retro': return 'rounded-none border-2 border-white/20 shadow-[3px_3px_0px_rgba(0,0,0,0.3)]';
                            case 'elegant': return 'rounded-3xl';
                            case 'brutal': return 'rounded-sm border-2 border-white/30 shadow-[4px_4px_0px_rgba(255,255,255,0.15)]';
                            case 'glass': return 'rounded-2xl backdrop-blur-md border border-white/10';
                            case 'neon': return 'rounded-2xl';
                            case 'gradient': return 'rounded-2xl';
                            default: return 'rounded-2xl';
                          }
                        })()}`}
                        style={{
                          background: bubbleStyle === 'gradient'
                            ? `linear-gradient(160deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary}, ${accentColors[accent].primary}dd)`
                            : `linear-gradient(135deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary})`,
                          boxShadow: bubbleStyle === 'neon' ? `0 0 15px ${accentColors[accent].primary}40, 0 0 30px ${accentColors[accent].primary}20` : undefined,
                        }}
                      >
                        <p>Looking great! ✨</p>
                        <div className="flex justify-end mt-1">
                          <span className="text-xs opacity-70">12:35 PM</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
