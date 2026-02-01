'use client';

/**
 * Theme Sync Module
 * Enables sender's theme style to travel with messages
 * Unencrypted UI metadata that doesn't affect crypto integrity
 */

import { AccentColor, accentColors } from './useAppearance';

// Theme metadata that travels with each message
export interface MessageTheme {
    bubbleColor: string;
    textColor: string;
    style: 'rounded' | 'glass' | 'neon';
    font: 'inter' | 'mono';
    accentGradient?: string;
    accentPrimary?: string;
    accentSecondary?: string;
}

// Extended message with theme
export interface ThemedMessage {
    ciphertext: string;
    theme: MessageTheme;
    [key: string]: any;
}

// Bubble style configurations
export const bubbleStyles: Record<'rounded' | 'glass' | 'neon', {
    className: string;
    overlayClassName?: string;
}> = {
    rounded: {
        className: 'rounded-2xl shadow-sm',
    },
    glass: {
        className: 'rounded-2xl backdrop-blur-md bg-opacity-80 shadow-lg border border-white/10',
    },
    neon: {
        className: 'rounded-2xl shadow-lg',
        overlayClassName: 'ring-2 ring-opacity-50',
    },
};

// Font configurations
export const fontStyles: Record<'inter' | 'mono', string> = {
    inter: 'font-sans',
    mono: 'font-mono',
};

// Default fallback theme
export const defaultMessageTheme: MessageTheme = {
    bubbleColor: '#3B82F6',
    textColor: '#ffffff',
    style: 'rounded',
    font: 'inter',
    accentGradient: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
    accentPrimary: '#3B82F6',
    accentSecondary: '#1D4ED8',
};

// Build theme from current appearance settings
export function buildMessageTheme(accent: AccentColor, customStyle?: 'rounded' | 'glass' | 'neon', customFont?: 'inter' | 'mono'): MessageTheme {
    const colors = accentColors[accent];
    return {
        bubbleColor: colors.primary,
        textColor: '#ffffff',
        style: customStyle || 'rounded',
        font: customFont || 'inter',
        accentGradient: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
        accentPrimary: colors.primary,
        accentSecondary: colors.secondary,
    };
}

// Build theme from current user settings (reads from localStorage)
// This is the convenience function used in sendMessage
export function buildCurrentMessageTheme(): MessageTheme {
    if (typeof window === 'undefined') return defaultMessageTheme;

    try {
        // Read accent color from appearance settings
        const appearanceSettings = localStorage.getItem('zerotrace_appearance');
        let accent: AccentColor = 'blue';
        if (appearanceSettings) {
            const parsed = JSON.parse(appearanceSettings);
            accent = parsed.accent || 'blue';
        }

        // Read custom bubble and font styles
        const bubbleStyle = loadBubbleStyle();
        const fontStyle = loadFontStyle();

        return buildMessageTheme(accent, bubbleStyle, fontStyle);
    } catch (e) {
        console.error('Failed to build current message theme:', e);
        return defaultMessageTheme;
    }
}

// Get bubble style classes based on theme
export function getBubbleClasses(theme: MessageTheme): string {
    const styleConfig = bubbleStyles[theme.style] || bubbleStyles.rounded;
    const fontClass = fontStyles[theme.font] || fontStyles.inter;
    return `${styleConfig.className} ${fontClass}`;
}

// Get inline style for bubble background
export function getBubbleStyle(theme: MessageTheme): React.CSSProperties {
    if (theme.accentGradient) {
        return { background: theme.accentGradient };
    }
    return { backgroundColor: theme.bubbleColor };
}

// Get neon ring style if applicable
export function getNeonRingStyle(theme: MessageTheme): React.CSSProperties | undefined {
    if (theme.style === 'neon') {
        return {
            boxShadow: `0 0 15px ${theme.bubbleColor}40, 0 0 30px ${theme.bubbleColor}20`,
        };
    }
    return undefined;
}

// Storage key for custom bubble style preference
const BUBBLE_STYLE_KEY = 'zerotrace_bubble_style';
const FONT_STYLE_KEY = 'zerotrace_font_style';

// Load saved bubble style preference
export function loadBubbleStyle(): 'rounded' | 'glass' | 'neon' {
    if (typeof window === 'undefined') return 'rounded';
    try {
        const saved = localStorage.getItem(BUBBLE_STYLE_KEY);
        if (saved && ['rounded', 'glass', 'neon'].includes(saved)) {
            return saved as 'rounded' | 'glass' | 'neon';
        }
    } catch (e) {
        console.error('Failed to load bubble style:', e);
    }
    return 'rounded';
}

// Save bubble style preference
export function saveBubbleStyle(style: 'rounded' | 'glass' | 'neon'): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(BUBBLE_STYLE_KEY, style);
    } catch (e) {
        console.error('Failed to save bubble style:', e);
    }
}

// Load saved font style preference
export function loadFontStyle(): 'inter' | 'mono' {
    if (typeof window === 'undefined') return 'inter';
    try {
        const saved = localStorage.getItem(FONT_STYLE_KEY);
        if (saved && ['inter', 'mono'].includes(saved)) {
            return saved as 'inter' | 'mono';
        }
    } catch (e) {
        console.error('Failed to load font style:', e);
    }
    return 'inter';
}

// Save font style preference
export function saveFontStyle(font: 'inter' | 'mono'): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(FONT_STYLE_KEY, font);
    } catch (e) {
        console.error('Failed to save font style:', e);
    }
}

// Parse theme from message if present
export function parseMessageTheme(messageData: any): MessageTheme | null {
    try {
        if (messageData?.theme) {
            const theme = messageData.theme;
            // Validate theme object
            if (theme.bubbleColor && theme.textColor && theme.style && theme.font) {
                return {
                    bubbleColor: theme.bubbleColor,
                    textColor: theme.textColor,
                    style: ['rounded', 'glass', 'neon'].includes(theme.style) ? theme.style : 'rounded',
                    font: ['inter', 'mono'].includes(theme.font) ? theme.font : 'inter',
                    accentGradient: theme.accentGradient,
                    accentPrimary: theme.accentPrimary,
                    accentSecondary: theme.accentSecondary,
                };
            }
        }
    } catch (e) {
        console.warn('Failed to parse message theme:', e);
    }
    return null;
}
