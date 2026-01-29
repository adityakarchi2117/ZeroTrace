'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useAppearance, accentColors, ThemeMode, AccentColor, FontSize, ChatDensity } from '@/lib/useAppearance';
import { X, User, Shield, Bell, Palette, Key, Download, Sun, Moon, Monitor, Check, Circle, Type } from 'lucide-react';
import { loadBubbleStyle, saveBubbleStyle, loadFontStyle, saveFontStyle, bubbleStyles, fontStyles } from '@/lib/themeSync';

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
  const [bubbleStyle, setBubbleStyle] = useState<'rounded' | 'glass' | 'neon'>('rounded');
  const [fontStyle, setFontStyle] = useState<'inter' | 'mono'>('inter');

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
  };

  // Update bubble style
  const handleBubbleStyleChange = (style: 'rounded' | 'glass' | 'neon') => {
    setBubbleStyle(style);
    saveBubbleStyle(style);
  };

  // Update font style
  const handleFontStyleChange = (font: 'inter' | 'mono') => {
    setFontStyle(font);
    saveFontStyle(font);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const handleLogout = () => {
    logout();
    onClose();
  };

  const exportKeys = () => {
    // TODO: Implement key export functionality
    console.log('Exporting keys...');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 dark:bg-gray-900 p-4">
            <nav className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
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

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={user?.username || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
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

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Security & Privacy
                </h3>

                <div className="space-y-4">
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

                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Cryptographic Keys
                    </h4>

                    <button
                      onClick={exportKeys}
                      className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export Key Backup</span>
                    </button>

                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Export your keys for backup or device migration. Keep this file secure.
                    </p>
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
                      defaultChecked
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
                      defaultChecked
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
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: 'rounded' as const, label: 'Rounded', desc: 'Classic' },
                        { value: 'glass' as const, label: 'Glass', desc: 'Translucent' },
                        { value: 'neon' as const, label: 'Neon', desc: 'Glow effect' },
                      ].map((option) => {
                        const isSelected = bubbleStyle === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleBubbleStyleChange(option.value)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${isSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                          >
                            <div
                              className={`w-12 h-8 rounded-lg flex items-center justify-center ${option.value === 'glass'
                                  ? 'backdrop-blur-md border border-white/20'
                                  : option.value === 'neon'
                                    ? 'shadow-lg'
                                    : ''
                                }`}
                              style={{
                                background: `linear-gradient(135deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary})`,
                                boxShadow: option.value === 'neon' ? `0 0 10px ${accentColors[accent].primary}50` : undefined
                              }}
                            >
                              <Circle className="w-3 h-3 text-white" />
                            </div>
                            <span className={`text-xs font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
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
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'inter' as const, label: 'Sans-serif', sample: 'Hello!' },
                        { value: 'mono' as const, label: 'Monospace', sample: 'Hello!' },
                      ].map((option) => {
                        const isSelected = fontStyle === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleFontStyleChange(option.value)}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${isSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              }`}
                          >
                            <Type className={`w-5 h-5 ${isSelected ? 'text-blue-500' : 'text-gray-500'}`} />
                            <div className="text-left">
                              <p className={`text-sm font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {option.label}
                              </p>
                              <p className={`text-xs text-gray-500 ${option.value === 'mono' ? 'font-mono' : 'font-sans'}`}>
                                {option.sample}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
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
                        className="px-4 py-2 rounded-2xl text-white max-w-xs"
                        style={{ background: `linear-gradient(135deg, ${accentColors[accent].primary}, ${accentColors[accent].secondary})` }}
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