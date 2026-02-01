'use client';

/**
 * ZeroTrace Motion System
 * 
 * A premium 3D animation system for the ZeroTrace secure messenger.
 * Built with Framer Motion, GSAP, and React Three Fiber.
 * 
 * Features:
 * - GPU-accelerated animations
 * - 60 FPS target performance
 * - Reduced motion support
 * - Battery efficiency
 * - Mobile + Web optimized
 */

// Export hooks
export { useMotion } from './useMotion';
export { usePerformance } from './usePerformance';
export { useReducedMotion } from './useReducedMotion';
export { use3DTilt } from './use3DTilt';

// Export provider
export { MotionProvider, useMotionContext } from './MotionProvider';

// Export components
export { AnimatedMessage } from './components/AnimatedMessage';
export { ChatTransition, Sidebar3D } from './components/ChatTransition';
export { CallPortal, IncomingCallOverlay } from './components/CallPortal';
export { TiltAvatar, TiltCard } from './components/TiltAvatar';
export { EncryptionLock, SecureTunnel } from './components/EncryptionLock';
export { Glassmorphism, FloatingGlass, GlassCard } from './components/Glassmorphism';
export { ParticleField, ParticleFlow, Shimmer } from './components/ParticleField';

// Export utilities
export { 
  motionVariants,
  transitions,
  springConfigs,
  easings,
  defaultMotionConfig,
  ANIMATION_LIMITS,
} from './config';

// Export types
export type { 
  MotionConfig,
  AnimationType,
  PerformanceTier,
  TransitionConfig,
  TiltConfig,
  ParticleConfig,
  GlassmorphismConfig,
} from './types';
