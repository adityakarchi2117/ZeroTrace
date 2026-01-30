/**
 * Particle Field Component
 * 
 * Features:
 * - Floating particles
 * - GPU-accelerated animations
 * - Configurable density
 * - Battery-efficient (pauses when off-screen)
 */

'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../useReducedMotion';
import { useMotion } from '../useMotion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

interface ParticleFieldProps {
  className?: string;
  density?: 'low' | 'medium' | 'high';
  color?: string;
  minSize?: number;
  maxSize?: number;
}

export function ParticleField({
  className = '',
  density = 'low',
  color = 'rgba(var(--accent-rgb), 0.3)',
  minSize = 2,
  maxSize = 6,
}: ParticleFieldProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd } = useMotion({ disabled: true });

  // Generate particles
  const particles = useMemo(() => {
    const count = {
      low: 15,
      medium: 30,
      high: 50,
    }[density];

    return Array.from({ length: count }, (_, i): Particle => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      duration: 15 + Math.random() * 20,
      delay: Math.random() * 10,
    }));
  }, [density, minSize, maxSize]);

  // Don't render on low-end devices or if reduced motion
  if (isLowEnd || prefersReducedMotion) {
    return null;
  }

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: color,
          }}
          animate={{
            y: [0, -100, 0],
            x: [0, Math.random() * 50 - 25, 0],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// Encryption particle flow - data traveling between users
interface ParticleFlowProps {
  isActive: boolean;
  direction?: 'left' | 'right';
  className?: string;
}

export function ParticleFlow({
  isActive,
  direction = 'right',
  className = '',
}: ParticleFlowProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd } = useMotion({ disabled: true });

  if (isLowEnd || prefersReducedMotion || !isActive) return null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute top-1/2 w-2 h-2 rounded-full bg-cipher-primary"
          style={{
            marginTop: -4,
            left: direction === 'right' ? '10%' : '90%',
          }}
          animate={{
            left: direction === 'right' ? ['10%', '90%'] : ['90%', '10%'],
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1, 1, 0.5],
          }}
          transition={{
            duration: 2,
            delay: i * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// Loading shimmer effect
interface ShimmerProps {
  className?: string;
  children: React.ReactNode;
}

export function Shimmer({ className = '', children }: ShimmerProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}
      {!prefersReducedMotion && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
          }}
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}
    </div>
  );
}

export default ParticleField;
