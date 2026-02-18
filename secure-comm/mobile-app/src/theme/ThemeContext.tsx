/**
 * ThemeContext — Dynamic theme provider for the mobile app.
 * Bridges appearanceService settings with React component tree.
 * Mirrors web's AppearanceProvider + useAppearance hook.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Appearance, StatusBar } from 'react-native';
import {
  AppearanceSettings,
  ThemeColors,
  AccentColor,
  ThemeMode,
  FontSize,
  ChatDensity,
  BubbleStyle,
  FontStyle,
  WallpaperSettings,
  accentColors,
  fontSizeValues,
  densityValues,
  bubbleStyleConfig,
  fontStyleConfig,
  presetWallpapers,
  loadAppearanceSettings,
  saveAppearanceSettings,
  getThemeColors,
  lightTheme,
  darkTheme,
} from '../services/appearanceService';

interface ThemeContextValue {
  settings: AppearanceSettings;
  themeColors: ThemeColors;
  isLoaded: boolean;
  isDark: boolean;
  updateSettings: (partial: Partial<AppearanceSettings>) => Promise<void>;
  updateWallpaper: (wallpaper: Partial<WallpaperSettings>) => Promise<void>;
  getAccentColors: () => { primary: string; secondary: string; name: string };
  getFontSize: () => { base: number; small: number; xs: number };
  getDensity: () => { messagePadding: number; messageGap: number; bubblePadding: number };
  getBubbleConfig: () => typeof bubbleStyleConfig[BubbleStyle];
  getFontConfig: () => typeof fontStyleConfig[FontStyle];
  accentColorOptions: typeof accentColors;
  presetWallpapers: typeof presetWallpapers;
}

const defaultSettings: AppearanceSettings = {
  theme: 'dark',
  accent: 'blue',
  fontSize: 'medium',
  density: 'comfortable',
  messagePreview: true,
  animationsEnabled: true,
  wallpaper: { enabled: false, type: 'preset', value: 'gradient-1', opacity: 100, blur: 0 },
  bubbleStyle: 'rounded',
  fontStyle: 'inter',
};

const ThemeContext = createContext<ThemeContextValue>({
  settings: defaultSettings,
  themeColors: darkTheme,
  isLoaded: false,
  isDark: true,
  updateSettings: async () => {},
  updateWallpaper: async () => {},
  getAccentColors: () => accentColors.blue,
  getFontSize: () => fontSizeValues.medium,
  getDensity: () => densityValues.comfortable,
  getBubbleConfig: () => bubbleStyleConfig.rounded,
  getFontConfig: () => fontStyleConfig.inter,
  accentColorOptions: accentColors,
  presetWallpapers,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppearanceSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  const resolveThemeMode = useCallback((mode: ThemeMode): 'light' | 'dark' => {
    if (mode === 'system') {
      return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
    }
    return mode;
  }, []);

  const isDark = resolveThemeMode(settings.theme) === 'dark';
  const themeColors = getThemeColors(resolveThemeMode(settings.theme), settings.accent);

  useEffect(() => {
    (async () => {
      const loaded = await loadAppearanceSettings();
      setSettings(loaded);
      setIsLoaded(true);
    })();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (settings.theme === 'system') {
        // Force re-render by re-setting settings
        setSettings(s => ({ ...s }));
      }
    });
    return () => sub.remove();
  }, [settings.theme]);

  // Update status bar based on theme
  useEffect(() => {
    StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content');
  }, [isDark]);

  const updateSettings = useCallback(async (partial: Partial<AppearanceSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveAppearanceSettings(next);
      return next;
    });
  }, []);

  const updateWallpaper = useCallback(async (wallpaper: Partial<WallpaperSettings>) => {
    setSettings(prev => {
      const next = { ...prev, wallpaper: { ...prev.wallpaper, ...wallpaper } };
      saveAppearanceSettings(next);
      return next;
    });
  }, []);

  const getAccentColors = useCallback(() => accentColors[settings.accent], [settings.accent]);
  const getFontSize = useCallback(() => fontSizeValues[settings.fontSize], [settings.fontSize]);
  const getDensity = useCallback(() => densityValues[settings.density], [settings.density]);
  const getBubbleConfig = useCallback(() => bubbleStyleConfig[settings.bubbleStyle], [settings.bubbleStyle]);
  const getFontConfig = useCallback(() => fontStyleConfig[settings.fontStyle], [settings.fontStyle]);

  return (
    <ThemeContext.Provider
      value={{
        settings,
        themeColors,
        isLoaded,
        isDark,
        updateSettings,
        updateWallpaper,
        getAccentColors,
        getFontSize,
        getDensity,
        getBubbleConfig,
        getFontConfig,
        accentColorOptions: accentColors,
        presetWallpapers,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
