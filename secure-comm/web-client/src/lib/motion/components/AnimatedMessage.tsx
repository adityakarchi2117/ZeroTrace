/**
 * Animated Message Bubble Component
 * 
 * Features:
 * - 3D bubble pop animation on send
 * - Float-in from depth on receive
 * - Glow pulse effect
 * - Scale bounce on new messages
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useMotion } from '../useMotion';
import { useReducedMotion } from '../useReducedMotion';
import { motionVariants, easings } from '../config';

interface AnimatedMessageProps {
  children: React.ReactNode;
  isSent: boolean;
  isNew?: boolean;
  index?: number;
  className?: string;
}

export function AnimatedMessage({
  children,
  isSent,
  isNew = false,
  index = 0,
  className = '',
}: AnimatedMessageProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd } = useMotion({ disabled: true });

  // Choose animation based on message type
  const variants = isSent 
    ? motionVariants.messageSend 
    : motionVariants.messageReceive;

  // Calculate stagger delay
  const delay = Math.min(index * 0.05, 0.3);

  // Simple fade for reduced motion
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  // 2D fallback for low-end devices
  if (isLowEnd) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.2 }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      variants={variants}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
      transition={{
        delay,
        duration: 0.4,
        ease: easings.elastic,
      }}
    >
      {/* Glow effect for new sent messages */}
      {isSent && isNew && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          initial={{ boxShadow: '0 0 0 0 rgba(var(--accent-rgb), 0.4)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(var(--accent-rgb), 0.4)',
              '0 0 20px 5px rgba(var(--accent-rgb), 0.2)',
              '0 0 0 0 rgba(var(--accent-rgb), 0)',
            ],
          }}
          transition={{
            duration: 1.5,
            ease: 'easeOut',
          }}
        />
      )}
      {children}
    </motion.div>
  );
}

export default AnimatedMessage;
