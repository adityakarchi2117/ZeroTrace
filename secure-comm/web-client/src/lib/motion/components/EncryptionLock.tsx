/**
 * Encryption Lock Animation Component
 * 
 * Features:
 * - 3D lock rotation
 * - Particle flow between users
 * - "Secure tunnel" visual effect
 * - Shows privacy visually
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../useReducedMotion';
import { useMotion } from '../useMotion';

interface EncryptionLockProps {
  isEncrypting?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showParticles?: boolean;
}

export function EncryptionLock({
  isEncrypting = true,
  size = 'md',
  className = '',
  showParticles = true,
}: EncryptionLockProps) {
  const prefersReducedMotion = useReducedMotion();
  const { isLowEnd } = useMotion({ disabled: true });

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  // Simple lock for reduced motion or low-end
  if (prefersReducedMotion || isLowEnd) {
    return (
      <div className={`${sizeClasses[size]} ${className}`}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-cipher-primary">
          <path
            d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21ZM16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11H16Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Particle effect */}
      {showParticles && isEncrypting && (
        <div className="absolute inset-0 -m-4">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-cipher-primary/60 rounded-full"
              style={{
                left: `${20 + i * 12}%`,
                top: '50%',
              }}
              animate={{
                x: [0, 20, 40, 20, 0],
                y: [0, -10, 0, 10, 0],
                opacity: [0, 1, 1, 1, 0],
                scale: [0.5, 1, 1, 1, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}

      {/* 3D Lock */}
      <motion.div
        className={sizeClasses[size]}
        style={{ perspective: 200 }}
        animate={isEncrypting ? {
          rotateY: [0, 360],
        } : {}}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-full h-full text-cipher-primary"
          animate={isEncrypting ? {
            filter: [
              'drop-shadow(0 0 2px rgba(var(--accent-rgb), 0.3))',
              'drop-shadow(0 0 8px rgba(var(--accent-rgb), 0.6))',
              'drop-shadow(0 0 2px rgba(var(--accent-rgb), 0.3))',
            ],
          } : {}}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* Lock body */}
          <motion.path
            d="M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21Z"
            stroke="currentColor"
            strokeWidth="2"
            fill="rgba(var(--accent-rgb), 0.1)"
          />
          {/* Lock shackle */}
          <motion.path
            d="M16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            animate={isEncrypting ? {
              strokeDasharray: ['0 20', '20 0', '0 20'],
            } : {}}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          {/* Keyhole */}
          <motion.circle
            cx="12"
            cy="16"
            r="1.5"
            fill="currentColor"
            animate={isEncrypting ? {
              scale: [1, 1.2, 1],
            } : {}}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.path
            d="M12 17.5V19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </motion.svg>
      </motion.div>

      {/* Glow effect */}
      {isEncrypting && (
        <motion.div
          className="absolute inset-0 rounded-full -z-10"
          animate={{
            boxShadow: [
              '0 0 10px 2px rgba(var(--accent-rgb), 0.2)',
              '0 0 20px 5px rgba(var(--accent-rgb), 0.4)',
              '0 0 10px 2px rgba(var(--accent-rgb), 0.2)',
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </div>
  );
}

// Secure tunnel visualization for message sending
interface SecureTunnelProps {
  isActive: boolean;
  className?: string;
}

export function SecureTunnel({ isActive, className = '' }: SecureTunnelProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) return null;

  return (
    <div className={`relative ${className}`}>
      {/* Tunnel background */}
      <motion.div
        className="absolute inset-0 rounded-full"
        initial={{ opacity: 0 }}
        animate={isActive ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Concentric circles */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-cipher-primary/20"
            animate={isActive ? {
              scale: [1, 1.5 + i * 0.3],
              opacity: [0.5, 0],
            } : {}}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.3,
              ease: 'easeOut',
            }}
          />
        ))}
      </motion.div>

      {/* Data packets */}
      {isActive && (
        <>
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 left-0 w-2 h-2 -mt-1 rounded-full bg-cipher-primary"
              animate={{
                left: ['0%', '100%'],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.25,
                ease: 'linear',
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default EncryptionLock;
