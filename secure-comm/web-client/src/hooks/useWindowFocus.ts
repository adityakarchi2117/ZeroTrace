/**
 * Window Focus & Visibility Hook
 * Tracks window focus, visibility, and blur events
 * Essential for smart minimize and call persistence
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface WindowFocusState {
  isFocused: boolean;
  isVisible: boolean;
  wasBlurred: boolean;
  blurTime: number | null;
}

interface UseWindowFocusOptions {
  onBlur?: () => void;
  onFocus?: () => void;
  onVisibilityChange?: (isVisible: boolean) => void;
  onBeforeUnload?: (event: BeforeUnloadEvent) => void;
}

export function useWindowFocus(options: UseWindowFocusOptions = {}) {
  const [state, setState] = useState<WindowFocusState>({
    isFocused: true,
    isVisible: !document.hidden,
    wasBlurred: false,
    blurTime: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Handle window focus
  const handleFocus = useCallback(() => {
    setState(prev => ({
      ...prev,
      isFocused: true,
      wasBlurred: false,
      blurTime: null,
    }));
    options.onFocus?.();
  }, [options]);

  // Handle window blur
  const handleBlur = useCallback(() => {
    setState(prev => ({
      ...prev,
      isFocused: false,
      wasBlurred: true,
      blurTime: Date.now(),
    }));
    options.onBlur?.();
  }, [options]);

  // Handle visibility change (tab switch)
  const handleVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    setState(prev => ({
      ...prev,
      isVisible,
    }));
    options.onVisibilityChange?.(isVisible);
  }, [options]);

  // Handle before unload (close/refresh)
  const handleBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    options.onBeforeUnload?.(event);
  }, [options]);

  useEffect(() => {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [handleFocus, handleBlur, handleVisibilityChange, handleBeforeUnload]);

  // Utility: Check if window was blurred for a long time
  const wasBlurredFor = useCallback((ms: number): boolean => {
    if (!stateRef.current.blurTime) return false;
    return Date.now() - stateRef.current.blurTime > ms;
  }, []);

  return {
    ...state,
    wasBlurredFor,
  };
}

export default useWindowFocus;
