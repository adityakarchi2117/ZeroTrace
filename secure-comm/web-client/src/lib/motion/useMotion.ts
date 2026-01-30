/**
 * Main motion hook - combines all motion system features
 * Provides easy access to animations with automatic fallbacks
 */

import { useMemo } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { usePerformance } from './usePerformance';
import { motionVariants, transitions } from './config';
import { AnimationType, TransitionConfig } from './types';

interface UseMotionOptions {
  /** Animation type */
  type?: AnimationType;
  /** Custom transition override */
  transition?: TransitionConfig;
  /** Delay before animation starts */
  delay?: number;
  /** Stagger delay for children */
  staggerDelay?: number;
  /** Disable animation */
  disabled?: boolean;
  /** Force 2D fallback */
  force2D?: boolean;
}

export function useMotion(options: UseMotionOptions = {}) {
  const {
    type = 'fade',
    transition,
    delay = 0,
    staggerDelay = 0.05,
    disabled = false,
    force2D = false,
  } = options;

  const prefersReducedMotion = useReducedMotion();
  const performance = usePerformance();

  // Determine if we should animate
  const shouldAnimate = useMemo(() => {
    if (disabled) return false;
    if (prefersReducedMotion) return false;
    if (performance.isLowBattery && performance.tier !== 'high') return false;
    return true;
  }, [disabled, prefersReducedMotion, performance]);

  // Get appropriate variants based on type
  const variants = useMemo(() => {
    if (!shouldAnimate) {
      // Return instant variants when disabled
      return {
        hidden: { opacity: 1 },
        visible: { opacity: 1 },
        exit: { opacity: 1 },
      };
    }

    // Use 2D fallback for low-end devices
    if (force2D || performance.tier === 'low' || !performance.supports3D) {
      switch (type) {
        case '3d-flip':
        case 'tilt':
          return motionVariants.scale; // Fallback to scale
        case 'bubble-pop':
          return motionVariants.bubblePop;
        case 'slide':
          return motionVariants.slideRight;
        case 'portal':
          return motionVariants.scale;
        default:
          return motionVariants.fade;
      }
    }

    // Full 3D animations for capable devices
    switch (type) {
      case 'bubble-pop':
        return motionVariants.bubblePop;
      case '3d-flip':
        return motionVariants.chat3D;
      case 'slide':
        return motionVariants.slideRight;
      case 'portal':
        return motionVariants.portal;
      case 'tilt':
        return motionVariants.scale;
      case 'rotate':
        return motionVariants.lockRotate;
      default:
        return motionVariants.fade;
    }
  }, [type, shouldAnimate, performance, force2D]);

  // Build transition config
  const finalTransition = useMemo(() => {
    const baseTransition = transition || transitions.fade;
    
    // Adjust duration based on performance tier
    let durationMultiplier = 1;
    if (performance.tier === 'low') durationMultiplier = 0.8; // Faster on low-end
    if (prefersReducedMotion) durationMultiplier = 0; // Instant

    return {
      ...baseTransition,
      duration: (baseTransition.duration || 0.2) * durationMultiplier,
      delay,
    };
  }, [transition, delay, performance.tier, prefersReducedMotion]);

  // Stagger config for lists
  const staggerConfig = useMemo(() => {
    if (!shouldAnimate) return {};
    
    return {
      staggerChildren: staggerDelay,
      delayChildren: delay,
    };
  }, [shouldAnimate, staggerDelay, delay]);

  // Animation state helpers
  const animateProps = useMemo(() => ({
    initial: 'hidden',
    animate: 'visible',
    exit: 'exit',
    variants,
    transition: finalTransition,
  }), [variants, finalTransition]);

  return {
    // Core animation props
    ...animateProps,
    
    // Raw values for custom usage
    variants,
    transition: finalTransition,
    staggerConfig,
    
    // State info
    shouldAnimate,
    performance,
    prefersReducedMotion,
    
    // Convenience helpers
    isLowEnd: performance.tier === 'low',
    supports3D: performance.supports3D && !force2D,
  };
}

export default useMotion;
