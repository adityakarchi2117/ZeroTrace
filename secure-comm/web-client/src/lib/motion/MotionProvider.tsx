/**
 * Motion Provider - Context wrapper for animation system
 * Manages global animation state and preferences
 */

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { MotionConfig, PerformanceTier } from './types';
import { defaultMotionConfig } from './config';

interface MotionContextValue extends MotionConfig {
  /** Current performance tier */
  performanceTier: PerformanceTier;
  /** Update configuration */
  updateConfig: (config: Partial<MotionConfig>) => void;
  /** Temporarily disable animations (e.g., during heavy operations) */
  pauseAnimations: () => void;
  /** Resume animations */
  resumeAnimations: () => void;
  /** Are animations currently paused */
  isPaused: boolean;
}

const MotionContext = createContext<MotionContextValue | null>(null);

interface MotionProviderProps {
  children: React.ReactNode;
  initialConfig?: Partial<MotionConfig>;
}

export function MotionProvider({ children, initialConfig }: MotionProviderProps) {
  const [config, setConfig] = useState<MotionConfig>({
    ...defaultMotionConfig,
    ...initialConfig,
  });
  
  const [isPaused, setIsPaused] = useState(false);
  const [performanceTier, setPerformanceTier] = useState<PerformanceTier>('high');

  const updateConfig = useCallback((newConfig: Partial<MotionConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  const pauseAnimations = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeAnimations = useCallback(() => {
    setIsPaused(false);
  }, []);

  const value: MotionContextValue = {
    ...config,
    performanceTier,
    updateConfig,
    pauseAnimations,
    resumeAnimations,
    isPaused: isPaused || !config.enabled,
  };

  return (
    <MotionContext.Provider value={value}>
      {children}
    </MotionContext.Provider>
  );
}

export function useMotionContext() {
  const context = useContext(MotionContext);
  if (!context) {
    throw new Error('useMotionContext must be used within MotionProvider');
  }
  return context;
}

export default MotionProvider;
