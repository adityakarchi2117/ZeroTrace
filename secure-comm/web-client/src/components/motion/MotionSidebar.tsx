'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sidebar3D } from '@/lib/motion';
import { easings, motionVariants } from '@/lib/motion/config';

interface MotionSidebarProps {
  children: React.ReactNode;
  isVisible: boolean;
  className?: string;
}

export function MotionSidebar({ children, isVisible, className = '' }: MotionSidebarProps) {
  return (
    <Sidebar3D isVisible={isVisible} className={className}>
      {children}
    </Sidebar3D>
  );
}

// Animated conversation list item
interface MotionConversationItemProps {
  children: React.ReactNode;
  isActive: boolean;
  index: number;
  onClick: () => void;
}

export function MotionConversationItem({
  children,
  isActive,
  index,
  onClick,
}: MotionConversationItemProps) {
  return (
    <motion.button
      onClick={onClick}
      variants={motionVariants.listItem}
      whileHover={{ 
        x: 4,
        backgroundColor: isActive ? undefined : 'rgba(255,255,255,0.05)',
      }}
      whileTap={{ scale: 0.98 }}
      className={`
        w-full p-3 rounded-lg flex items-center gap-3 transition-colors
        ${isActive 
          ? 'bg-cipher-primary/20 border border-cipher-primary/30' 
          : 'hover:bg-gray-800'}
      `}
    >
      {children}
    </motion.button>
  );
}

// Animated search bar
interface MotionSearchBarProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionSearchBar({ children, className = '' }: MotionSearchBarProps) {
  return (
    <motion.div
      className={className}
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: easings.smooth }}
    >
      {children}
    </motion.div>
  );
}

// Animated header
interface MotionSidebarHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function MotionSidebarHeader({ children, className = '' }: MotionSidebarHeaderProps) {
  return (
    <motion.div
      className={className}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: easings.smooth }}
    >
      {children}
    </motion.div>
  );
}

export default MotionSidebar;
