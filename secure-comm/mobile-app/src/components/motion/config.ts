/**
 * Motion configuration constants for React Native
 * Port of web's lib/motion/config.ts — fine-tuned for 60 FPS native animations
 */

import { Easing } from 'react-native';

// ============================================
// EASINGS — Smooth, natural motion curves
// ============================================
export const easings = {
  /** Apple-style smooth ease */
  smooth: Easing.bezier(0.4, 0, 0.2, 1),
  /** Bouncy but professional */
  bounce: Easing.bezier(0.68, -0.55, 0.265, 1.55),
  /** Quick start, slow end */
  decelerate: Easing.bezier(0, 0, 0.2, 1),
  /** Slow start, quick end */
  accelerate: Easing.bezier(0.4, 0, 1, 1),
  /** Elastic finish */
  elastic: Easing.bezier(0.175, 0.885, 0.32, 1.275),
  /** Dramatic entrance */
  dramatic: Easing.bezier(0.87, 0, 0.13, 1),
  /** Premium slide */
  slide: Easing.bezier(0.25, 0.46, 0.45, 0.94),
} as const;

// ============================================
// SPRING CONFIGS — Physics-based animations
// ============================================
export const springConfigs = {
  /** Gentle, subtle */
  gentle: {
    stiffness: 120,
    damping: 20,
    mass: 1,
    useNativeDriver: true,
  },
  /** Snappy response */
  snappy: {
    stiffness: 400,
    damping: 30,
    mass: 1,
    useNativeDriver: true,
  },
  /** Bouncy and playful */
  bouncy: {
    stiffness: 300,
    damping: 15,
    mass: 1.2,
    useNativeDriver: true,
  },
  /** Smooth and elegant */
  elegant: {
    stiffness: 200,
    damping: 25,
    mass: 1.5,
    useNativeDriver: true,
  },
  /** Quick and precise */
  quick: {
    stiffness: 500,
    damping: 35,
    mass: 0.8,
    useNativeDriver: true,
  },
} as const;

// ============================================
// DURATION PRESETS
// ============================================
export const durations = {
  /** Micro-interaction */
  micro: 150,
  /** Default fade */
  fade: 200,
  /** Slide in from side */
  slideIn: 350,
  /** Scale up */
  scale: 250,
  /** 3D rotation */
  rotate3d: 400,
  /** Bubble pop */
  bubblePop: 300,
  /** Portal expansion */
  portal: 500,
  /** Layout change */
  layout: 300,
  /** Cinematic (special effects only) */
  cinematic: 500,
} as const;

// ============================================
// ANIMATION LIMITS
// ============================================
export const ANIMATION_LIMITS = {
  /** 300ms for non-cinematic animations */
  maxDuration: 300,
  /** 500ms for special effects */
  cinematicDuration: 500,
  /** 150ms for micro-interactions */
  microDuration: 150,
};

// ============================================
// STAGGER CONFIGS
// ============================================
export const stagger = {
  /** Delay between children items */
  default: 50,
  /** Delay before first child */
  initialDelay: 100,
  /** Fast stagger for lists */
  fast: 30,
  /** Slow for dramatic reveals */
  slow: 80,
};

// ============================================
// PRESET ANIMATION FACTORIES
// ============================================
/** Creates a timing config with an easing and duration. */
export function timingConfig(duration: number, easing = easings.smooth) {
  return {
    duration,
    easing,
    useNativeDriver: true,
  };
}

/** Creates a spring config from a named preset. */
export function springConfig(
  preset: keyof typeof springConfigs = 'gentle',
) {
  return { ...springConfigs[preset] };
}

// Accent colors for glow effects
export const accentGlow = {
  blue: 'rgba(59, 130, 246, 0.35)',
  purple: 'rgba(139, 92, 246, 0.35)',
  cyan: 'rgba(6, 182, 212, 0.35)',
  green: 'rgba(16, 185, 129, 0.35)',
  pink: 'rgba(236, 72, 153, 0.35)',
};
