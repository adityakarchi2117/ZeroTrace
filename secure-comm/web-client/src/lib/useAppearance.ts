'use client';

import { useState, useEffect, useCallback } from 'react';

// Types
export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
export type FontSize = 'small' | 'medium' | 'large';
export type ChatDensity = 'compact' | 'comfortable' | 'spacious';

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: AccentColor;
  fontSize: FontSize;
  density: ChatDensity;
  messagePreview: boolean;
  animationsEnabled: boolean;
}

// Accent color configurations
export const accentColors: Record<AccentColor, { primary: string; secondary: string; name: string }> = {
  blue: { primary: '#3B82F6', secondary: '#1D4ED8', name: 'Blue' },
  purple: { primary: '#8B5CF6', secondary: '#7C3AED', name: 'Purple' },
  green: { primary: '#10B981', secondary: '#059669', name: 'Green' },
  orange: { primary: '#F59E0B', secondary: '#D97706', name: 'Orange' },
  pink: { primary: '#EC4899', secondary: '#DB2777', name: 'Pink' },
  cyan: { primary: '#06B6D4', secondary: '#0891B2', name: 'Cyan' },
};

// Density configurations for padding/margins
export const densityConfig: Record<ChatDensity, { messagePadding: string; messageGap: string; bubblePadding: string }> = {
  compact: { messagePadding: 'py-1', messageGap: 'space-y-2', bubblePadding: 'px-3 py-1.5' },
  comfortable: { messagePadding: 'py-2', messageGap: 'space-y-4', bubblePadding: 'px-4 py-2' },
  spacious: { messagePadding: 'py-3', messageGap: 'space-y-6', bubblePadding: 'px-5 py-3' },
};

// Font size configurations
export const fontSizeConfig: Record<FontSize, { base: string; small: string; xs: string }> = {
  small: { base: 'text-sm', small: 'text-xs', xs: 'text-[10px]' },
  medium: { base: 'text-base', small: 'text-sm', xs: 'text-xs' },
  large: { base: 'text-lg', small: 'text-base', xs: 'text-sm' },
};

const STORAGE_KEY = 'cipherlink_appearance';

const defaultSettings: AppearanceSettings = {
  theme: 'dark',
  accent: 'blue',
  fontSize: 'medium',
  density: 'comfortable',
  messagePreview: true,
  animationsEnabled: true,
};

// Apply theme to document
const applyTheme = (mode: ThemeMode) => {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  let isDark = mode === 'dark' || (mode === 'system' && systemDark);
  
  if (isDark) {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
};

// Apply accent color
const applyAccentColor = (accent: AccentColor) => {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  const colors = accentColors[accent];
  root.style.setProperty('--color-cipher-primary', colors.primary);
  root.style.setProperty('--color-cipher-secondary', colors.secondary);
  root.style.setProperty('--cipher-primary', colors.primary);
  root.style.setProperty('--cipher-secondary', colors.secondary);
};

// Apply font size
const applyFontSize = (size: FontSize) => {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  const sizes = { small: '14px', medium: '16px', large: '18px' };
  root.style.setProperty('--base-font-size', sizes[size]);
};

// Apply animations setting
const applyAnimations = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', !enabled);
};

// Load settings from localStorage
export const loadAppearanceSettings = (): AppearanceSettings => {
  if (typeof window === 'undefined') return defaultSettings;
  
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load appearance settings:', e);
  }
  return defaultSettings;
};

// Save settings to localStorage
export const saveAppearanceSettings = (settings: AppearanceSettings) => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save appearance settings:', e);
  }
};

// Hook to use appearance settings
export function useAppearance() {
  const [settings, setSettings] = useState<AppearanceSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadAppearanceSettings();
    setSettings(loaded);
    setIsLoaded(true);
    
    // Apply all settings
    applyTheme(loaded.theme);
    applyAccentColor(loaded.accent);
    applyFontSize(loaded.fontSize);
    applyAnimations(loaded.animationsEnabled);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.theme]);

  // Listen for storage changes (sync across tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const newSettings = JSON.parse(e.newValue);
        setSettings(newSettings);
        applyTheme(newSettings.theme);
        applyAccentColor(newSettings.accent);
        applyFontSize(newSettings.fontSize);
        applyAnimations(newSettings.animationsEnabled);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Update a specific setting
  const updateSettings = useCallback((updates: Partial<AppearanceSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      saveAppearanceSettings(newSettings);
      
      // Apply changes immediately
      if (updates.theme !== undefined) applyTheme(updates.theme);
      if (updates.accent !== undefined) applyAccentColor(updates.accent);
      if (updates.fontSize !== undefined) applyFontSize(updates.fontSize);
      if (updates.animationsEnabled !== undefined) applyAnimations(updates.animationsEnabled);
      
      return newSettings;
    });
  }, []);

  // Get CSS classes/styles based on current settings
  const getAccentGradient = useCallback(() => {
    const colors = accentColors[settings.accent];
    return `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`;
  }, [settings.accent]);

  const getAccentColors = useCallback(() => {
    return accentColors[settings.accent];
  }, [settings.accent]);

  const getDensityClasses = useCallback(() => {
    return densityConfig[settings.density];
  }, [settings.density]);

  const getFontClasses = useCallback(() => {
    return fontSizeConfig[settings.fontSize];
  }, [settings.fontSize]);

  return {
    settings,
    isLoaded,
    updateSettings,
    getAccentGradient,
    getAccentColors,
    getDensityClasses,
    getFontClasses,
    accentColors,
    densityConfig,
    fontSizeConfig,
  };
}

// Initialize appearance on app load (call this in layout or root component)
export function initializeAppearance() {
  if (typeof window === 'undefined') return;
  
  const settings = loadAppearanceSettings();
  applyTheme(settings.theme);
  applyAccentColor(settings.accent);
  applyFontSize(settings.fontSize);
  applyAnimations(settings.animationsEnabled);
}
