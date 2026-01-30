/**
 * Call Portal Animation Component
 * 
 * Features:
 * - Circular portal morphing effect
 * - Expands into full screen
 * - Glass layer fade-in
 * - FaceTime × sci-fi UI feel
 */

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../useReducedMotion';
import { useMotion } from '../useMotion';
import { easings } from '../config';

interface CallPortalProps {
  children: React.ReactNode;
  isActive: boolean;
  className?: string;
  onAnimationComplete?: () => void;
}

export function CallPortal({
  children,
  isActive,
  className = '',
  onAnimationComplete,
}: CallPortalProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd, supports3D } = useMotion({ disabled: true });

  // Reduced motion - instant
  if (prefersReducedMotion) {
    return (
      <AnimatePresence>
        {isActive && (
          <div className={className}>
            {children}
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Low-end fallback - simple scale
  if (isLowEnd || !supports3D) {
    return (
      <AnimatePresence>
        {isActive && (
          <motion.div
            className={className}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Full cinematic portal animation
  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Portal background blur */}
          <motion.div
            className="fixed inset-0 z-40 backdrop-blur-xl bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
          
          {/* Portal container */}
          <motion.div
            className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${className}`}
            initial={{ 
              clipPath: 'circle(0% at 50% 50%)',
              opacity: 0,
            }}
            animate={{ 
              clipPath: 'circle(150% at 50% 50%)',
              opacity: 1,
            }}
            exit={{ 
              clipPath: 'circle(0% at 50% 50%)',
              opacity: 0,
            }}
            transition={{
              duration: 0.6,
              ease: easings.dramatic,
            }}
            onAnimationComplete={onAnimationComplete}
          >
            {/* Glassmorphism layer */}
            <motion.div
              className="absolute inset-0"
              initial={{ 
                background: 'radial-gradient(circle at 50% 50%, rgba(30,30,40,0.9) 0%, rgba(0,0,0,0.95) 100%)',
                opacity: 0,
              }}
              animate={{ 
                opacity: 1,
              }}
              transition={{ duration: 0.4, delay: 0.2 }}
            />
            
            {/* Content */}
            <motion.div
              className="relative z-10 w-full h-full"
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.05, opacity: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.2,
                ease: easings.smooth,
              }}
            >
              {children}
            </motion.div>
            
            {/* Portal ring effect */}
            <motion.div
              className="absolute pointer-events-none"
              initial={{ 
                width: 100, 
                height: 100,
                border: '2px solid rgba(var(--accent-rgb), 0.5)',
                borderRadius: '50%',
                opacity: 0,
              }}
              animate={{ 
                width: ['100px', '150vw'],
                height: ['100px', '150vw'],
                opacity: [0.8, 0],
                borderWidth: ['4px', '0px'],
              }}
              transition={{
                duration: 0.8,
                ease: easings.decelerate,
              }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Incoming call overlay with bounce animation
interface IncomingCallOverlayProps {
  callerName: string;
  callerAvatar?: React.ReactNode;
  onAccept: () => void;
  onReject: () => void;
  callType: 'audio' | 'video';
}

export function IncomingCallOverlay({
  callerName,
  callerAvatar,
  onAccept,
  onReject,
  callType,
}: IncomingCallOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="text-center">
        {/* Avatar with pulse */}
        <motion.div
          className="relative mx-auto mb-6"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ 
            scale: 1, 
            opacity: 1,
            transition: { type: 'spring', stiffness: 200, damping: 15 }
          }}
        >
          {!prefersReducedMotion && (
            <>
              {/* Pulse rings */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cipher-primary/30"
                animate={{
                  scale: [1, 1.5, 1.5],
                  opacity: [0.5, 0, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              />
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cipher-primary/20"
                animate={{
                  scale: [1, 1.8, 1.8],
                  opacity: [0.3, 0, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: 0.3,
                }}
              />
            </>
          )}
          
          {/* Avatar */}
          <div className="relative w-24 h-24 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center">
            {callerAvatar || (
              <span className="text-3xl text-white font-bold">
                {callerName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </motion.div>

        {/* Caller info */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold text-white mb-2">{callerName}</h2>
          <p className="text-gray-400 mb-8">
            Incoming {callType} call...
          </p>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          className="flex items-center justify-center gap-6"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {/* Reject button */}
          <motion.button
            onClick={onReject}
            className="p-5 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </motion.button>

          {/* Accept button */}
          <motion.button
            onClick={onAccept}
            className="p-5 bg-green-500 rounded-full hover:bg-green-600 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            animate={!prefersReducedMotion ? {
              scale: [1, 1.05, 1],
            } : {}}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {callType === 'video' ? (
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            )}
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default CallPortal;
