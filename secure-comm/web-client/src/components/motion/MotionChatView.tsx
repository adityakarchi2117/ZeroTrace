'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatTransition } from '@/lib/motion';
import { easings } from '@/lib/motion/config';

interface MotionChatViewProps {
  children: React.ReactNode;
  isActive: boolean;
  className?: string;
}

export function MotionChatView({ children, isActive, className = '' }: MotionChatViewProps) {
  return (
    <ChatTransition isActive={isActive} className={className}>
      {children}
    </ChatTransition>
  );
}

// Animated header for chat
interface MotionChatHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionChatHeader({ children, className = '' }: MotionChatHeaderProps) {
  return (
    <motion.div
      className={className}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: easings.smooth }}
    >
      {children}
    </motion.div>
  );
}

// Animated message list with stagger
interface MotionMessageListProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionMessageList({ children, className = '' }: MotionMessageListProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.03,
            delayChildren: 0.1,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// Animated input area
interface MotionInputAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionInputArea({ children, className = '' }: MotionInputAreaProps) {
  return (
    <motion.div
      className={className}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2, ease: easings.smooth }}
    >
      {children}
    </motion.div>
  );
}

export default MotionChatView;
