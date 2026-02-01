/**
 * Type definitions for the ZeroTrace Motion System
 */

export type AnimationType = 
  | 'fade' 
  | 'slide' 
  | 'scale' 
  | 'rotate' 
  | '3d-flip'
  | 'bubble-pop'
  | 'portal'
  | 'tilt';

export type PerformanceTier = 'low' | 'medium' | 'high';

export interface MotionConfig {
  /** Enable/disable animations */
  enabled: boolean;
  /** Performance tier - affects animation complexity */
  tier: PerformanceTier;
  /** Respect reduced motion preference */
  respectReducedMotion: boolean;
  /** Maximum concurrent animations */
  maxConcurrentAnimations: number;
  /** Disable on battery saver */
  disableOnLowBattery: boolean;
}

export interface TransitionConfig {
  duration: number;
  ease: number[] | string;
  delay?: number;
  type?: 'tween' | 'spring';
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface MessageAnimationProps {
  isSent: boolean;
  isNew?: boolean;
  index?: number;
}

export interface TiltConfig {
  maxTilt: number;
  scale: number;
  speed: number;
  glare: boolean;
  maxGlare: number;
}

export interface ParticleConfig {
  count: number;
  color: string;
  size: number;
  speed: number;
  opacity: number;
}

export interface GlassmorphismConfig {
  blur: number;
  transparency: number;
  borderRadius: number;
  borderWidth: number;
  shadowIntensity: number;
}
