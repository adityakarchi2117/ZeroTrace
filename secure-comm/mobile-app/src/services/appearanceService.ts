/**
 * Appearance/Theme Service (Mobile)
 * 
 * Manages app theme, accent colors, font sizes, chat density,
 * wallpaper settings, bubble styles, and font styles.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ==================== Types ====================

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';
export type FontSize = 'small' | 'medium' | 'large';
export type ChatDensity = 'compact' | 'comfortable' | 'spacious';
export type BubbleStyle = 'rounded' | 'glass' | 'neon' | 'minimal' | 'gradient' | 'retro' | 'elegant' | 'brutal';
export type FontStyle = 'inter' | 'mono' | 'serif' | 'cursive' | 'rounded' | 'code';

export interface WallpaperSettings {
    enabled: boolean;
    type: 'preset' | 'custom';
    value: string;
    opacity: number;
    blur: number;
}

export interface AppearanceSettings {
    theme: ThemeMode;
    accent: AccentColor;
    fontSize: FontSize;
    density: ChatDensity;
    messagePreview: boolean;
    animationsEnabled: boolean;
    wallpaper: WallpaperSettings;
    bubbleStyle: BubbleStyle;
    fontStyle: FontStyle;
}

// ==================== Constants ====================

export const accentColors: Record<AccentColor, { primary: string; secondary: string; name: string }> = {
    blue: { primary: '#3B82F6', secondary: '#1D4ED8', name: 'Blue' },
    purple: { primary: '#8B5CF6', secondary: '#7C3AED', name: 'Purple' },
    green: { primary: '#10B981', secondary: '#059669', name: 'Green' },
    orange: { primary: '#F59E0B', secondary: '#D97706', name: 'Orange' },
    pink: { primary: '#EC4899', secondary: '#DB2777', name: 'Pink' },
    cyan: { primary: '#06B6D4', secondary: '#0891B2', name: 'Cyan' },
};

export const fontSizeValues: Record<FontSize, { base: number; small: number; xs: number }> = {
    small: { base: 13, small: 11, xs: 10 },
    medium: { base: 15, small: 13, xs: 11 },
    large: { base: 17, small: 15, xs: 13 },
};

export const densityValues: Record<ChatDensity, { messagePadding: number; messageGap: number; bubblePadding: number }> = {
    compact: { messagePadding: 4, messageGap: 4, bubblePadding: 8 },
    comfortable: { messagePadding: 8, messageGap: 8, bubblePadding: 12 },
    spacious: { messagePadding: 12, messageGap: 12, bubblePadding: 16 },
};

export const presetWallpapers = [
    { id: 'none', name: 'None', colors: ['transparent'] },
    { id: 'gradient-1', name: 'Midnight', colors: ['#1a1a2e', '#16213e', '#0f3460'] },
    { id: 'gradient-2', name: 'Purple Haze', colors: ['#0f0c29', '#302b63', '#24243e'] },
    { id: 'gradient-3', name: 'Ocean', colors: ['#0f2027', '#203a43', '#2c5364'] },
    { id: 'gradient-4', name: 'Sunset', colors: ['#232526', '#414345', '#232526'] },
    { id: 'gradient-5', name: 'Forest', colors: ['#134e5e', '#71b280'] },
    { id: 'gradient-6', name: 'Cyberpunk', colors: ['#0f0f0f', '#1a0a1a', '#0a1a1a'] },
];

export const validBubbleStyles: BubbleStyle[] = ['rounded', 'glass', 'neon', 'minimal', 'gradient', 'retro', 'elegant', 'brutal'];
export const validFontStyles: FontStyle[] = ['inter', 'mono', 'serif', 'cursive', 'rounded', 'code'];

export const bubbleStyleConfig: Record<BubbleStyle, {
    borderRadius: number;
    borderWidth: number;
    shadowOpacity: number;
    label: string;
}> = {
    rounded: { borderRadius: 16, borderWidth: 0, shadowOpacity: 0.1, label: 'Rounded' },
    glass: { borderRadius: 16, borderWidth: 1, shadowOpacity: 0.2, label: 'Glass' },
    neon: { borderRadius: 16, borderWidth: 2, shadowOpacity: 0.3, label: 'Neon' },
    minimal: { borderRadius: 8, borderWidth: 1, shadowOpacity: 0, label: 'Minimal' },
    gradient: { borderRadius: 16, borderWidth: 0, shadowOpacity: 0.15, label: 'Gradient' },
    retro: { borderRadius: 0, borderWidth: 2, shadowOpacity: 0.2, label: 'Retro' },
    elegant: { borderRadius: 24, borderWidth: 1, shadowOpacity: 0.15, label: 'Elegant' },
    brutal: { borderRadius: 2, borderWidth: 2, shadowOpacity: 0.1, label: 'Brutal' },
};

export const fontStyleConfig: Record<FontStyle, { family: string; label: string }> = {
    inter: { family: 'System', label: 'Default' },
    mono: { family: Platform.OS === 'ios' ? 'Menlo' : 'monospace', label: 'Mono' },
    serif: { family: Platform.OS === 'ios' ? 'Georgia' : 'serif', label: 'Serif' },
    cursive: { family: Platform.OS === 'ios' ? 'Snell Roundhand' : 'cursive', label: 'Cursive' },
    rounded: { family: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif-medium', label: 'Rounded' },
    code: { family: Platform.OS === 'ios' ? 'Courier New' : 'monospace', label: 'Code' },
};

import { Platform } from 'react-native';

// ==================== Defaults ====================

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
    bubbleStyle: 'rounded',
    fontStyle: 'inter',
};

// ==================== Storage ====================

const STORAGE_KEY = 'zerotrace_appearance';

export async function loadAppearanceSettings(): Promise<AppearanceSettings> {
    try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch (e) {
        console.error('Failed to load appearance settings:', e);
    }
    return defaultSettings;
}

export async function saveAppearanceSettings(settings: AppearanceSettings): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save appearance settings:', e);
    }
}

// ==================== Message Theme ====================

export interface MessageTheme {
    bubbleColor: string;
    textColor: string;
    style: BubbleStyle;
    font: FontStyle;
    accentPrimary?: string;
    accentSecondary?: string;
}

export const defaultMessageTheme: MessageTheme = {
    bubbleColor: '#3B82F6',
    textColor: '#ffffff',
    style: 'rounded',
    font: 'inter',
    accentPrimary: '#3B82F6',
    accentSecondary: '#1D4ED8',
};

export function buildMessageTheme(
    accent: AccentColor,
    customStyle?: BubbleStyle,
    customFont?: FontStyle,
): MessageTheme {
    const colors = accentColors[accent];
    return {
        bubbleColor: colors.primary,
        textColor: '#ffffff',
        style: customStyle || 'rounded',
        font: customFont || 'inter',
        accentPrimary: colors.primary,
        accentSecondary: colors.secondary,
    };
}

export function parseMessageTheme(messageData: any): MessageTheme | null {
    try {
        if (messageData?.theme) {
            const theme = messageData.theme;
            if (theme.bubbleColor && theme.textColor && theme.style && theme.font) {
                return {
                    bubbleColor: theme.bubbleColor,
                    textColor: theme.textColor,
                    style: validBubbleStyles.includes(theme.style) ? theme.style : 'rounded',
                    font: validFontStyles.includes(theme.font) ? theme.font : 'inter',
                    accentPrimary: theme.accentPrimary,
                    accentSecondary: theme.accentSecondary,
                };
            }
        }
    } catch { /* ignore */ }
    return null;
}

// ==================== Theme Colors (for dynamic theming) ====================

export interface ThemeColors {
    background: { primary: string; secondary: string; tertiary: string };
    text: { primary: string; secondary: string; inverse: string };
    accent: { primary: string; secondary: string };
    border: string;
    card: string;
    input: string;
    status: { success: string; warning: string; error: string; info: string };
}

export const lightTheme: ThemeColors = {
    background: { primary: '#FFFFFF', secondary: '#F8F9FA', tertiary: '#F0F2F5' },
    text: { primary: '#1A1A2E', secondary: '#6B7280', inverse: '#FFFFFF' },
    accent: { primary: '#3B82F6', secondary: '#1D4ED8' },
    border: '#E5E7EB',
    card: '#FFFFFF',
    input: '#F3F4F6',
    status: { success: '#10B981', warning: '#F59E0B', error: '#EF4444', info: '#3B82F6' },
};

export const darkTheme: ThemeColors = {
    background: { primary: '#0A0A1A', secondary: '#12121F', tertiary: '#1A1A2E' },
    text: { primary: '#FFFFFF', secondary: '#A0AEC0', inverse: '#1A1A2E' },
    accent: { primary: '#3B82F6', secondary: '#1D4ED8' },
    border: '#2D2D44',
    card: '#1E1E32',
    input: '#16162A',
    status: { success: '#10B981', warning: '#F59E0B', error: '#EF4444', info: '#3B82F6' },
};

export function getThemeColors(mode: ThemeMode, accent: AccentColor): ThemeColors {
    const base = mode === 'light' ? lightTheme : darkTheme;
    const colors = accentColors[accent];
    return {
        ...base,
        accent: { primary: colors.primary, secondary: colors.secondary },
    };
}
