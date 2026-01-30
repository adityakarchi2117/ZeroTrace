/**
 * Glassmorphism Component
 * 
 * Features:
 * - Backdrop blur
 * - Semi-transparent backgrounds
 * - Subtle borders
 * - Depth shadows
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../useReducedMotion';

interface GlassmorphismProps {
  children: React.ReactNode;
  className?: string;
  blur?: 'sm' | 'md' | 'lg' | 'xl';
  opacity?: number;
  borderRadius?: string;
  border?: boolean;
  shadow?: boolean;
  hover?: boolean;
  interactive?: boolean;
}

export function Glassmorphism({
  children,
  className = '',
  blur = 'md',
  opacity = 0.1,
  borderRadius = '1rem',
  border = true,
  shadow = true,
  hover = false,
  interactive = false,
}: GlassmorphismProps) {
  const prefersReducedMotion = useReducedMotion();

  const blurValues = {
    sm: 'backdrop-blur-sm',
    md: 'backdrop-blur-md',
    lg: 'backdrop-blur-lg',
    xl: 'backdrop-blur-xl',
  };

  const baseClasses = `
    ${blurValues[blur]}
    ${border ? 'border border-white/10' : ''}
    ${shadow ? 'shadow-lg shadow-black/10' : ''}
  `;

  const style = {
    background: `rgba(255, 255, 255, ${opacity})`,
    borderRadius,
  };

  if (hover || interactive) {
    return (
      <motion.div
        className={`${baseClasses} ${className}`}
        style={style}
        whileHover={!prefersReducedMotion ? {
          scale: interactive ? 1.02 : 1,
          background: `rgba(255, 255, 255, ${opacity * 1.5})`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        } : {}}
        whileTap={interactive && !prefersReducedMotion ? { scale: 0.98 } : {}}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={`${baseClasses} ${className}`} style={style}>
      {children}
    </div>
  );
}

// Floating glass panel with entrance animation
interface FloatingGlassProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FloatingGlass({ children, className = '', delay = 0 }: FloatingGlassProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <Glassmorphism className={className}>
        {children}
      </Glassmorphism>
    );
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={className}
    >
      <Glassmorphism className="h-full" hover>
        {children}
      </Glassmorphism>
    </motion.div>
  );
}

// Glass morphism card with 3D tilt
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ children, className = '' }: GlassCardProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={`relative ${className}`}
      whileHover={!prefersReducedMotion ? {
        y: -5,
        transition: { duration: 0.2 },
      } : {}}
    >
      <Glassmorphism className="h-full" hover>
        {children}
      </Glassmorphism>
      
      {/* Bottom glow */}
      {!prefersReducedMotion && (
        <motion.div
          className="absolute -bottom-2 left-4 right-4 h-4 rounded-full -z-10 blur-xl"
          style={{ background: 'rgba(var(--accent-rgb), 0.3)' }}
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
        />
      )}
    </motion.div>
  );
}

export default Glassmorphism;
