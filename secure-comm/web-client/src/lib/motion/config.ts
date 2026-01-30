/**
 * Motion configuration constants
 * Fine-tuned for premium 60 FPS animations
 */

import { Variants, Transition } from 'framer-motion';

// ============================================
// EASINGS - Smooth, natural motion curves
// ============================================
export const easings = {
  // Apple-style smooth ease
  smooth: [0.4, 0, 0.2, 1],
  // Bouncy but professional
  bounce: [0.68, -0.55, 0.265, 1.55],
  // Quick start, slow end
  decelerate: [0, 0, 0.2, 1],
  // Slow start, quick end
  accelerate: [0.4, 0, 1, 1],
  // Elastic finish
  elastic: [0.175, 0.885, 0.32, 1.275],
  // Dramatic entrance
  dramatic: [0.87, 0, 0.13, 1],
  // Premium slide
  slide: [0.25, 0.46, 0.45, 0.94],
} as const;

// ============================================
// SPRING CONFIGS - Physics-based animations
// ============================================
export const springConfigs = {
  // Gentle, subtle
  gentle: {
    type: 'spring' as const,
    stiffness: 120,
    damping: 20,
    mass: 1,
  },
  // Snappy response
  snappy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
    mass: 1,
  },
  // Bouncy and playful
  bouncy: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 15,
    mass: 1.2,
  },
  // Smooth and elegant
  elegant: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
    mass: 1.5,
  },
  // Quick and precise
  quick: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 35,
    mass: 0.8,
  },
};

// ============================================
// TRANSITIONS - Reusable transition presets
// ============================================
export const transitions: Record<string, Transition> = {
  // Default fade
  fade: {
    duration: 0.2,
    ease: easings.smooth,
  },
  // Slide in from side
  slideIn: {
    duration: 0.35,
    ease: easings.decelerate,
  },
  // Scale up animation
  scale: {
    duration: 0.25,
    ease: easings.elastic,
  },
  // 3D rotation
  rotate3d: {
    duration: 0.4,
    ease: easings.smooth,
  },
  // Bubble pop effect
  bubblePop: {
    type: 'spring',
    stiffness: 400,
    damping: 20,
  },
  // Portal expansion
  portal: {
    duration: 0.5,
    ease: easings.dramatic,
  },
  // Micro-interaction
  micro: {
    duration: 0.15,
    ease: easings.smooth,
  },
  // Layout change
  layout: {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  },
};

// ============================================
// MOTION VARIANTS - Pre-built animation states
// ============================================
export const motionVariants = {
  // Fade in/out
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  
  // Scale with fade
  scale: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: springConfigs.gentle,
    },
    exit: { opacity: 0, scale: 0.9 },
  },
  
  // Slide from right
  slideRight: {
    hidden: { x: 100, opacity: 0 },
    visible: { 
      x: 0, 
      opacity: 1,
      transition: transitions.slideIn,
    },
    exit: { x: 100, opacity: 0 },
  },
  
  // Slide from left (sidebar)
  slideLeft: {
    hidden: { x: -100, opacity: 0 },
    visible: { 
      x: 0, 
      opacity: 1,
      transition: transitions.slideIn,
    },
    exit: { x: -100, opacity: 0 },
  },
  
  // 3D Chat transition
  chat3D: {
    hidden: { 
      x: 50, 
      opacity: 0,
      rotateY: -15,
      scale: 0.95,
    },
    visible: { 
      x: 0, 
      opacity: 1,
      rotateY: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: easings.smooth,
      },
    },
    exit: { 
      x: -30, 
      opacity: 0,
      rotateY: 10,
      scale: 0.95,
    },
  },
  
  // Sidebar 3D rotation
  sidebar3D: {
    hidden: { 
      rotateY: 5,
      x: -20,
      opacity: 0.8,
    },
    visible: { 
      rotateY: 0,
      x: 0,
      opacity: 1,
      transition: {
        duration: 0.35,
        ease: easings.smooth,
      },
    },
    exit: { 
      rotateY: 5,
      x: -20,
      opacity: 0.8,
    },
  },
  
  // Message bubble pop
  bubblePop: {
    hidden: { 
      scale: 0.8, 
      opacity: 0,
      y: 20,
    },
    visible: (i: number = 0) => ({
      scale: 1,
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 20,
        delay: i * 0.05,
      },
    }),
    exit: { 
      scale: 0.9, 
      opacity: 0,
      transition: { duration: 0.15 },
    },
  },
  
  // Message send animation
  messageSend: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { 
      scale: [0.8, 1.05, 1],
      opacity: 1,
      rotateY: [5, -2, 0],
      transition: {
        duration: 0.4,
        ease: easings.elastic,
      },
    },
  },
  
  // Message receive animation (float from depth)
  messageReceive: {
    initial: { 
      scale: 0.9, 
      opacity: 0,
      z: -50,
      y: 20,
    },
    animate: { 
      scale: 1,
      opacity: 1,
      z: 0,
      y: 0,
      transition: {
        duration: 0.35,
        ease: easings.decelerate,
      },
    },
  },
  
  // Portal expansion for calls
  portal: {
    initial: { 
      scale: 0, 
      opacity: 0,
      borderRadius: '50%',
    },
    animate: { 
      scale: 1,
      opacity: 1,
      borderRadius: '0%',
      transition: {
        duration: 0.5,
        ease: easings.dramatic,
      },
    },
    exit: { 
      scale: 0,
      opacity: 0,
      borderRadius: '50%',
      transition: {
        duration: 0.3,
        ease: easings.accelerate,
      },
    },
  },
  
  // Stagger children
  stagger: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  },
  
  // List item
  listItem: {
    hidden: { x: -20, opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: springConfigs.gentle,
    },
  },
  
  // Pulse glow
  pulseGlow: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(var(--accent-color), 0)',
        '0 0 20px 5px rgba(var(--accent-color), 0.3)',
        '0 0 0 0 rgba(var(--accent-color), 0)',
      ],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  },
  
  // Lock rotation
  lockRotate: {
    initial: { rotateY: 0 },
    animate: {
      rotateY: 360,
      transition: {
        duration: 1.5,
        ease: 'linear',
        repeat: Infinity,
      },
    },
  },
};

// ============================================
// DEFAULT CONFIG
// ============================================
export const defaultMotionConfig = {
  enabled: true,
  tier: 'high' as const,
  respectReducedMotion: true,
  maxConcurrentAnimations: 10,
  disableOnLowBattery: true,
};

// Animation duration limits (performance rule)
export const ANIMATION_LIMITS = {
  maxDuration: 0.3, // 300ms for non-cinematic animations
  cinematicDuration: 0.5, // 500ms for special effects
  microDuration: 0.15, // 150ms for micro-interactions
};
