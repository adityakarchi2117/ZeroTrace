import React, { useState, useEffect } from 'react';
import { Profile, VisibilityLevel } from '@/lib/profileTypes';
import PhotoUploader from './PhotoUploader';
import VisibilitySelector from './VisibilitySelector';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSave: (data: Partial<Profile>) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onRemovePhoto?: () => Promise<void>;
  fieldVisibility?: Record<string, VisibilityLevel>;
  onFieldVisibilityChange?: (field: string, level: VisibilityLevel) => void;
}

/** Fields that support per-field visibility overrides */
const VISIBILITY_FIELDS = [
  { key: 'bio', label: 'Bio' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'location_city', label: 'City' },
  { key: 'website', label: 'Website' },
  { key: 'social_links', label: 'Social links' },
  { key: 'status_message', label: 'Status' },
] as const;

export default function EditProfileModal({
  isOpen,
  onClose,
  profile,
  onSave,
  onUpload,
  onRemovePhoto,
  fieldVisibility,
  onFieldVisibilityChange,
}: Props) {
  const [form, setForm] = useState<Partial<Profile>>({});
  const [isSaving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showFieldVis, setShowFieldVis] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'social' | 'appearance'>('details');

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  if (!isOpen) return null;

  const update = (key: keyof Profile, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      const msg = err?.response?.status === 404
        ? 'Profile service unavailable. Please redeploy the backend with the latest changes.'
        : err?.message || 'Failed to save profile';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'details' as const, label: 'Details' },
    { id: 'social' as const, label: 'Social' },
    { id: 'appearance' as const, label: 'Appearance' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Edit profile</h2>
          <button className="text-gray-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800" onClick={onClose}>
            ✕
          </button>
        </div>

        <PhotoUploader currentUrl={form.avatar_url} onUpload={onUpload} onRemove={onRemovePhoto} />

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-800 pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {}
        {activeTab === 'details' && (
          <div className="grid grid-cols-1 gap-3">
            <input
              value={form.display_name || ''}
              onChange={(e) => update('display_name', e.target.value)}
              placeholder="Display name"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <textarea
              value={form.bio || ''}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="Bio"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              rows={3}
              maxLength={500}
            />
            <div className="text-right text-xs text-gray-500">
              {(form.bio || '').length}/500
            </div>
            <input
              value={form.status_message || ''}
              onChange={(e) => update('status_message', e.target.value)}
              placeholder="Status message"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.pronouns || ''}
                onChange={(e) => update('pronouns', e.target.value)}
                placeholder="Pronouns"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
              <input
                value={form.emoji_badge || ''}
                onChange={(e) => update('emoji_badge', e.target.value)}
                placeholder="Emoji badge"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                maxLength={2}
              />
            </div>
            <input
              value={form.location_city || ''}
              onChange={(e) => update('location_city', e.target.value)}
              placeholder="City"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <input
              value={form.birthday || ''}
              onChange={(e) => update('birthday', e.target.value)}
              placeholder="Birthday (YYYY-MM-DD)"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              type="date"
            />
          </div>
        )}

        {}
        {activeTab === 'social' && (
          <div className="grid grid-cols-1 gap-3">
            <input
              value={form.website || ''}
              onChange={(e) => update('website', e.target.value)}
              placeholder="Website URL"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
            <p className="text-sm text-gray-400">Social links</p>
            {['twitter', 'github', 'linkedin', 'instagram'].map((platform) => (
              <div key={platform} className="flex items-center gap-2">
                <span className="text-gray-500 text-sm w-20 capitalize">{platform}</span>
                <input
                  value={(form.social_links || {})[platform] || ''}
                  onChange={(e) =>
                    update('social_links', { ...(form.social_links || {}), [platform]: e.target.value })
                  }
                  placeholder={`${platform} URL`}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {}
        {activeTab === 'appearance' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Banner image URL</p>
            <input
              value={form.banner_url || ''}
              onChange={(e) => update('banner_url', e.target.value)}
              placeholder="Banner URL"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white w-full"
            />
            <p className="text-sm text-gray-400">Avatar blur hash (auto-generated)</p>
            <input
              value={form.avatar_blur || ''}
              onChange={(e) => update('avatar_blur', e.target.value)}
              placeholder="Blur hash (auto)"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white w-full"
              readOnly
            />
          </div>
        )}

        {}
        {onFieldVisibilityChange && (
          <div className="border-t border-gray-800 pt-3">
            <button
              className="text-sm text-cyan-300 hover:text-cyan-100"
              onClick={() => setShowFieldVis(!showFieldVis)}
            >
              {showFieldVis ? '▾ Hide' : '▸ Show'} per-field visibility
            </button>
            {showFieldVis && (
              <div className="mt-2 space-y-1">
                {VISIBILITY_FIELDS.map(({ key, label }) => (
                  <VisibilitySelector
                    key={key}
                    label={label}
                    value={fieldVisibility?.[key] || 'friends'}
                    onChange={(v) => onFieldVisibilityChange(key, v)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {saveError && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {saveError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-200"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-cyan-500/80 text-white hover:bg-cyan-500 disabled:opacity-50"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
