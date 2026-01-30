/**
 * Performance monitoring hook
 * Detects device capabilities and adjusts animation quality
 */

import { useState, useEffect, useCallback } from 'react';
import { PerformanceTier } from './types';

interface PerformanceMetrics {
  tier: PerformanceTier;
  fps: number;
  memory: number | null;
  isLowBattery: boolean;
  supports3D: boolean;
}

export function usePerformance(): PerformanceMetrics {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    tier: 'high',
    fps: 60,
    memory: null,
    isLowBattery: false,
    supports3D: true,
  });

  // Detect performance tier based on device
  const detectTier = useCallback((): PerformanceTier => {
    // Check for low-end device indicators
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    
    // Check if mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    if (memory && memory <= 4) return 'low';
    if (cores && cores <= 4 && isMobile) return 'low';
    if (memory && memory <= 8) return 'medium';
    if (isMobile) return 'medium';
    
    return 'high';
  }, []);

  // Check battery status
  const checkBattery = useCallback(async () => {
    try {
      const battery = await (navigator as any).getBattery?.();
      if (battery) {
        setMetrics(prev => ({
          ...prev,
          isLowBattery: battery.level < 0.2 && !battery.charging,
        }));

        // Listen for battery changes
        battery.addEventListener('levelchange', () => {
          setMetrics(prev => ({
            ...prev,
            isLowBattery: battery.level < 0.2 && !battery.charging,
          }));
        });
      }
    } catch {
      // Battery API not supported
    }
  }, []);

  // Check WebGL support for 3D
  const check3DSupport = useCallback((): boolean => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch {
      return false;
    }
  }, []);

  // FPS monitoring
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        setMetrics(prev => ({ ...prev, fps }));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };

    animationId = requestAnimationFrame(measureFPS);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // Initialize metrics
  useEffect(() => {
    const tier = detectTier();
    const supports3D = check3DSupport();
    const memory = (navigator as any).deviceMemory || null;
    
    setMetrics(prev => ({
      ...prev,
      tier,
      supports3D,
      memory,
    }));

    checkBattery();
  }, [detectTier, check3DSupport, checkBattery]);

  return metrics;
}

export default usePerformance;
