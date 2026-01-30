/**
 * Chat Transition Component
 * 
 * Features:
 * - Sidebar rotates slightly in Z-axis
 * - Chat window slides forward
 * - Depth blur background
 * - "Entering a private space" effect
 */

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotion } from '../useMotion';
import { useReducedMotion } from '../useReducedMotion';
import { motionVariants, easings } from '../config';

interface ChatTransitionProps {
  children: React.ReactNode;
  isActive: boolean;
  className?: string;
}

export function ChatTransition({
  children,
  isActive,
  className = '',
}: ChatTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd, supports3D } = useMotion({ disabled: true });

  // Reduced motion - no animation
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  // Low-end or no 3D support - simple fade
  if (isLowEnd || !supports3D) {
    return (
      <AnimatePresence mode="wait">
        {isActive && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={className}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Full 3D transition
  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          key="chat"
          className={className}
          initial={{
            x: 50,
            opacity: 0,
            rotateY: -15,
            scale: 0.95,
            filter: 'blur(10px)',
          }}
          animate={{
            x: 0,
            opacity: 1,
            rotateY: 0,
            scale: 1,
            filter: 'blur(0px)',
          }}
          exit={{
            x: -30,
            opacity: 0,
            rotateY: 10,
            scale: 0.95,
            filter: 'blur(5px)',
          }}
          transition={{
            duration: 0.4,
            ease: easings.smooth,
          }}
          style={{
            transformStyle: 'preserve-3d',
            perspective: 1200,
            transformOrigin: 'center center',
          }}
        >
          {/* Depth shadow overlay */}
          <motion.div
            className="absolute inset-0 pointer-events-none z-10"
            initial={{ 
              background: 'linear-gradient(90deg, rgba(0,0,0,0.3) 0%, transparent 30%)',
              opacity: 1 
            }}
            animate={{ 
              background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, transparent 0%)',
              opacity: 0 
            }}
            transition={{ duration: 0.5, delay: 0.1 }}
          />
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Sidebar rotation component (used alongside ChatTransition)
interface Sidebar3DProps {
  children: React.ReactNode;
  isVisible: boolean;
  className?: string;
}

export function Sidebar3D({ children, isVisible, className = '' }: Sidebar3DProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd, supports3D } = useMotion({ disabled: true });

  if (prefersReducedMotion || isLowEnd || !supports3D) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ rotateY: 0 }}
      animate={{
        rotateY: isVisible ? -3 : 0,
        scale: isVisible ? 0.98 : 1,
      }}
      transition={{
        duration: 0.4,
        ease: easings.smooth,
      }}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1200,
        transformOrigin: 'left center',
      }}
    >
      {children}
    </motion.div>
  );
}

export default ChatTransition;
