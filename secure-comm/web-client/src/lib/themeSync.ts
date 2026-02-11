'use client';

/**
 * Theme Sync Module
 * Enables sender's theme style to travel with messages
 * Unencrypted UI metadata that doesn't affect crypto integrity
 */

import { AccentColor, accentColors } from './useAppearance';

// All available bubble styles
export type BubbleStyle = 'rounded' | 'glass' | 'neon' | 'minimal' | 'gradient' | 'retro' | 'elegant' | 'brutal';

// All available font styles
export type FontStyle = 'inter' | 'mono' | 'serif' | 'cursive' | 'rounded' | 'code';

// Theme metadata that travels with each message
export interface MessageTheme {
    bubbleColor: string;
    textColor: string;
    style: BubbleStyle;
    font: FontStyle;
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
export const bubbleStyles: Record<BubbleStyle, {
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
    minimal: {
        className: 'rounded-lg shadow-none border border-white/5',
    },
    gradient: {
        className: 'rounded-2xl shadow-md',
    },
    retro: {
        className: 'rounded-none border-2 border-white/20 shadow-[3px_3px_0px_rgba(0,0,0,0.3)]',
    },
    elegant: {
        className: 'rounded-3xl shadow-md border border-white/5',
    },
    brutal: {
        className: 'rounded-sm border-2 border-white/30 shadow-[4px_4px_0px_rgba(255,255,255,0.15)]',
    },
};

// Font configurations
export const fontStyles: Record<FontStyle, string> = {
    inter: 'font-sans',
    mono: 'font-mono',
    serif: 'font-serif',
    cursive: 'font-cursive',
    rounded: 'font-rounded',
    code: 'font-code',
};

// Valid style/font arrays for validation
export const validBubbleStyles: BubbleStyle[] = ['rounded', 'glass', 'neon', 'minimal', 'gradient', 'retro', 'elegant', 'brutal'];
export const validFontStyles: FontStyle[] = ['inter', 'mono', 'serif', 'cursive', 'rounded', 'code'];

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
export function buildMessageTheme(accent: AccentColor, customStyle?: BubbleStyle, customFont?: FontStyle): MessageTheme {
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
    // Gradient style uses a diagonal multi-stop gradient
    if (theme.style === 'gradient' && theme.accentPrimary && theme.accentSecondary) {
        return {
            background: `linear-gradient(160deg, ${theme.accentPrimary}, ${theme.accentSecondary}, ${theme.accentPrimary}dd)`,
        };
    }
    if (theme.accentGradient) {
        return { background: theme.accentGradient };
    }
    return { backgroundColor: theme.bubbleColor };
}

// Get extra inline styles for special bubble effects
export function getExtraBubbleStyle(theme: MessageTheme): React.CSSProperties | undefined {
    switch (theme.style) {
        case 'neon':
            return {
                boxShadow: `0 0 15px ${theme.bubbleColor}40, 0 0 30px ${theme.bubbleColor}20`,
            };
        case 'retro':
            return {
                imageRendering: 'pixelated' as any,
                letterSpacing: '0.02em',
            };
        case 'elegant':
            return {
                letterSpacing: '0.03em',
            };
        case 'brutal':
            return {
                textTransform: 'none' as any,
                letterSpacing: '0.01em',
            };
        default:
            return undefined;
    }
}

// Get neon ring style if applicable (kept for backward compat)
export function getNeonRingStyle(theme: MessageTheme): React.CSSProperties | undefined {
    return getExtraBubbleStyle(theme);
}

// Storage key for custom bubble style preference
const BUBBLE_STYLE_KEY = 'zerotrace_bubble_style';
const FONT_STYLE_KEY = 'zerotrace_font_style';

// Load saved bubble style preference
export function loadBubbleStyle(): BubbleStyle {
    if (typeof window === 'undefined') return 'rounded';
    try {
        const saved = localStorage.getItem(BUBBLE_STYLE_KEY);
        if (saved && validBubbleStyles.includes(saved as BubbleStyle)) {
            return saved as BubbleStyle;
        }
    } catch (e) {
        console.error('Failed to load bubble style:', e);
    }
    return 'rounded';
}

// Save bubble style preference
export function saveBubbleStyle(style: BubbleStyle): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(BUBBLE_STYLE_KEY, style);
    } catch (e) {
        console.error('Failed to save bubble style:', e);
    }
}

// Load saved font style preference
export function loadFontStyle(): FontStyle {
    if (typeof window === 'undefined') return 'inter';
    try {
        const saved = localStorage.getItem(FONT_STYLE_KEY);
        if (saved && validFontStyles.includes(saved as FontStyle)) {
            return saved as FontStyle;
        }
    } catch (e) {
        console.error('Failed to load font style:', e);
    }
    return 'inter';
}

// Save font style preference
export function saveFontStyle(font: FontStyle): void {
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
                    style: validBubbleStyles.includes(theme.style) ? theme.style : 'rounded',
                    font: validFontStyles.includes(theme.font) ? theme.font : 'inter',
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
