'use client';

import { useState, useEffect, useCallback } from 'react';

// Types
export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
export type FontSize = 'small' | 'medium' | 'large';
export type ChatDensity = 'compact' | 'comfortable' | 'spacious';

export interface WallpaperSettings {
  enabled: boolean;
  type: 'preset' | 'custom' | 'url';
  value: string; // preset name, base64 data, or URL
  opacity: number; // 0-100
  blur: number; // 0-20px
}

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: AccentColor;
  fontSize: FontSize;
  density: ChatDensity;
  messagePreview: boolean;
  animationsEnabled: boolean;
  wallpaper: WallpaperSettings;
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
const WALLPAPER_STORAGE_KEY = 'cipherlink_wallpaper';

// Preset wallpapers (gradient patterns)
export const presetWallpapers = [
  { id: 'none', name: 'None', preview: 'transparent' },
  { id: 'gradient-1', name: 'Midnight', value: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  { id: 'gradient-2', name: 'Purple Haze', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
  { id: 'gradient-3', name: 'Ocean', value: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
  { id: 'gradient-4', name: 'Sunset', value: 'linear-gradient(135deg, #232526 0%, #414345 50%, #232526 100%)' },
  { id: 'gradient-5', name: 'Forest', value: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { id: 'gradient-6', name: 'Cyberpunk', value: 'linear-gradient(135deg, #0f0f0f 0%, #1a0a1a 50%, #0a1a1a 100%)' },
  { id: 'dots', name: 'Dots Pattern', value: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)' },
  { id: 'grid', name: 'Grid Pattern', value: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)' },
];

const defaultWallpaper: WallpaperSettings = {
  enabled: false,
  type: 'preset',
  value: 'gradient-1',
  opacity: 100,
  blur: 0,
};

const defaultSettings: AppearanceSettings = {
  theme: 'dark',
  accent: 'blue',
  fontSize: 'medium',
  density: 'comfortable',
  messagePreview: true,
  animationsEnabled: true,
  wallpaper: defaultWallpaper,
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

// Get wallpaper CSS value
export const getWallpaperCSSValue = (wallpaper: WallpaperSettings): string => {
  if (!wallpaper.enabled) return 'none';
  
  if (wallpaper.type === 'preset') {
    const preset = presetWallpapers.find(p => p.id === wallpaper.value);
    if (preset && preset.id !== 'none') {
      return preset.value;
    }
    return 'none';
  }
  
  if (wallpaper.type === 'custom' || wallpaper.type === 'url') {
    return `url(${wallpaper.value})`;
  }
  
  return 'none';
};

// Apply wallpaper to document
const applyWallpaper = (wallpaper: WallpaperSettings) => {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  const cssValue = getWallpaperCSSValue(wallpaper);
  
  root.style.setProperty('--chat-wallpaper', cssValue);
  root.style.setProperty('--chat-wallpaper-opacity', String(wallpaper.opacity / 100));
  root.style.setProperty('--chat-wallpaper-blur', `${wallpaper.blur}px`);
  
  // Toggle wallpaper class
  if (wallpaper.enabled && cssValue !== 'none') {
    root.classList.add('has-wallpaper');
  } else {
    root.classList.remove('has-wallpaper');
  }
};

// Save custom wallpaper image to localStorage
export const saveCustomWallpaper = (base64Image: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WALLPAPER_STORAGE_KEY, base64Image);
  } catch (e) {
    console.error('Failed to save wallpaper:', e);
  }
};

// Load custom wallpaper from localStorage
export const loadCustomWallpaper = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(WALLPAPER_STORAGE_KEY);
  } catch (e) {
    return null;
  }
};

// Delete custom wallpaper
export const deleteCustomWallpaper = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WALLPAPER_STORAGE_KEY);
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
    applyWallpaper(loaded.wallpaper);
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
        applyWallpaper(newSettings.wallpaper);
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
      if (updates.wallpaper !== undefined) applyWallpaper(updates.wallpaper);
      
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
    presetWallpapers,
    updateWallpaper: (updates: Partial<WallpaperSettings>) => {
      setSettings(prev => {
        const newWallpaper = { ...prev.wallpaper, ...updates };
        const newSettings = { ...prev, wallpaper: newWallpaper };
        saveAppearanceSettings(newSettings);
        applyWallpaper(newWallpaper);
        return newSettings;
      });
    },
    getWallpaperStyle: () => {
      const cssValue = getWallpaperCSSValue(settings.wallpaper);
      if (cssValue === 'none') return {};
      
      return {
        backgroundImage: cssValue,
        backgroundSize: settings.wallpaper.type === 'custom' || settings.wallpaper.type === 'url' ? 'cover' : 'initial',
        backgroundPosition: 'center',
        backgroundRepeat: settings.wallpaper.type === 'custom' || settings.wallpaper.type === 'url' ? 'no-repeat' : 'initial',
        opacity: settings.wallpaper.opacity / 100,
        filter: `blur(${settings.wallpaper.blur}px)`,
      };
    },
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
  applyWallpaper(settings.wallpaper);
}
