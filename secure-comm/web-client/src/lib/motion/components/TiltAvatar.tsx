/**
 * 3D Tilt Avatar Component
 * 
 * Features:
 * - Parallax tilt on mouse move
 * - Subtle light reflection
 * - Depth shadow
 * - Smooth return to center
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { use3DTilt } from '../use3DTilt';
import { useReducedMotion } from '../useReducedMotion';
import { useMotion } from '../useMotion';

interface TiltAvatarProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  scale?: number;
  glare?: boolean;
  shadow?: boolean;
}

export function TiltAvatar({
  children,
  className = '',
  maxTilt = 15,
  scale = 1.05,
  glare = true,
  shadow = true,
}: TiltAvatarProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd } = useMotion({ disabled: true });
  const { ref, style, glareStyle, handlers, isHovering } = use3DTilt({
    maxTilt,
    scale,
    glare,
    maxGlare: 0.25,
    speed: 300,
  });

  // Fallback for reduced motion or low-end devices
  if (prefersReducedMotion || isLowEnd) {
    return (
      <div className={className}>
        {children}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref} {...handlers}>
      <motion.div
        className={className}
        style={{
          ...style,
          willChange: 'transform',
        }}
      >
        {children}
      </motion.div>
      
      {/* Light reflection / glare overlay */}
      {glare && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
          style={{
            ...glareStyle,
            borderRadius: 'inherit',
          }}
        />
      )}
      
      {/* Dynamic shadow */}
      {shadow && (
        <motion.div
          className="absolute -inset-2 -z-10 rounded-full"
          animate={{
            boxShadow: isHovering
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px -5px rgba(var(--accent-rgb), 0.2)'
              : '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
            scale: isHovering ? 1.02 : 1,
          }}
          transition={{ duration: 0.3 }}
          style={{
            filter: 'blur(8px)',
            borderRadius: 'inherit',
          }}
        />
      )}
    </div>
  );
}

// Simpler version for conversation list items
interface TiltCardProps {
  children: React.ReactNode;
  isActive?: boolean;
  className?: string;
}

export function TiltCard({ children, isActive = false, className = '' }: TiltCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd } = useMotion({ disabled: true });

  if (prefersReducedMotion || isLowEnd) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      whileHover={{ 
        scale: 1.02,
        x: 4,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.98 }}
      animate={isActive ? {
        boxShadow: '0 0 0 2px rgba(var(--accent-rgb), 0.5)',
      } : {
        boxShadow: '0 0 0 0px rgba(var(--accent-rgb), 0)',
      }}
    >
      {children}
    </motion.div>
  );
}

export default TiltAvatar;
