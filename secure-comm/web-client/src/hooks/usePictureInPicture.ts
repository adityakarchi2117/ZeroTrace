/**
 * Picture-in-Picture Hook
 * Manages native PiP API for video elements
 * Falls back to custom floating window on unsupported browsers
 */

import { useState, useEffect, useCallback, RefObject } from 'react';

interface UsePictureInPictureOptions {
  onEnter?: () => void;
  onLeave?: () => void;
  onError?: (error: Error) => void;
}

interface PictureInPictureWindow {
  width: number;
  height: number;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface PictureInPictureEvent extends Event {
  pictureInPictureWindow: PictureInPictureWindow;
}

export function usePictureInPicture(
  videoRef: RefObject<HTMLVideoElement>,
  options: UsePictureInPictureOptions = {}
) {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [pipWindow, setPipWindow] = useState<PictureInPictureWindow | null>(null);

  // Check support
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const supported = 
      document.pictureInPictureEnabled &&
      typeof video.requestPictureInPicture === 'function';
    
    setIsSupported(supported);
  }, [videoRef]);

  // Listen for PiP changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isSupported) return;

    const handleEnter = (event: Event) => {
      const pipEvent = event as PictureInPictureEvent;
      setIsActive(true);
      setPipWindow(pipEvent.pictureInPictureWindow);
      options.onEnter?.();
    };

    const handleLeave = () => {
      setIsActive(false);
      setPipWindow(null);
      options.onLeave?.();
    };

    video.addEventListener('enterpictureinpicture', handleEnter);
    video.addEventListener('leavepictureinpicture', handleLeave);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnter);
      video.removeEventListener('leavepictureinpicture', handleLeave);
    };
  }, [videoRef, isSupported, options]);

  const requestPiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isSupported) {
      throw new Error('Picture-in-Picture not supported');
    }

    try {
      if (document.pictureInPictureElement === video) return;
      await video.requestPictureInPicture();
    } catch (error) {
      options.onError?.(error as Error);
      throw error;
    }
  }, [videoRef, isSupported, options]);

  const exitPiP = useCallback(async () => {
    if (!document.pictureInPictureElement) return;
    try {
      await document.exitPictureInPicture();
    } catch (error) {
      options.onError?.(error as Error);
    }
  }, [options]);

  const togglePiP = useCallback(async () => {
    if (isActive) {
      await exitPiP();
    } else {
      await requestPiP();
    }
  }, [isActive, requestPiP, exitPiP]);

  return { isSupported, isActive, pipWindow, requestPiP, exitPiP, togglePiP };
}

export default usePictureInPicture;
