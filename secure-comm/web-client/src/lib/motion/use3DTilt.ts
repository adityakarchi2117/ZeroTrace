/**
 * 3D Tilt effect hook
 * Creates parallax tilt on mouse move with light reflection
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface TiltState {
  rotateX: number;
  rotateY: number;
  scale: number;
  glareX: number;
  glareY: number;
  glareOpacity: number;
}

interface Use3DTiltOptions {
  maxTilt?: number;
  scale?: number;
  speed?: number;
  glare?: boolean;
  maxGlare?: number;
  perspective?: number;
}

export function use3DTilt(options: Use3DTiltOptions = {}) {
  const {
    maxTilt = 15,
    scale = 1.02,
    speed = 400,
    glare = true,
    maxGlare = 0.3,
    perspective = 1000,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<TiltState>({
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    glareX: 50,
    glareY: 50,
    glareOpacity: 0,
  });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      // Calculate rotation (inverted for natural feel)
      const rotateY = (mouseX / (rect.width / 2)) * maxTilt;
      const rotateX = -(mouseY / (rect.height / 2)) * maxTilt;

      // Calculate glare position
      const glareX = ((e.clientX - rect.left) / rect.width) * 100;
      const glareY = ((e.clientY - rect.top) / rect.height) * 100;

      setTilt({
        rotateX,
        rotateY,
        scale,
        glareX,
        glareY,
        glareOpacity: maxGlare,
      });
    },
    [maxTilt, scale, maxGlare]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setTilt({
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      glareX: 50,
      glareY: 50,
      glareOpacity: 0,
    });
  }, []);

  const style = {
    transform: `
      perspective(${perspective}px)
      rotateX(${tilt.rotateX}deg)
      rotateY(${tilt.rotateY}deg)
      scale3d(${tilt.scale}, ${tilt.scale}, ${tilt.scale})
    `,
    transition: `transform ${speed}ms cubic-bezier(0.03, 0.98, 0.52, 0.99)`,
    transformStyle: 'preserve-3d' as const,
  };

  const glareStyle = glare
    ? {
        background: `radial-gradient(
          circle at ${tilt.glareX}% ${tilt.glareY}%,
          rgba(255, 255, 255, ${tilt.glareOpacity}),
          transparent 50%
        )`,
        opacity: isHovering ? 1 : 0,
        transition: `opacity ${speed}ms ease`,
      }
    : {};

  return {
    ref,
    tilt,
    style,
    glareStyle,
    isHovering,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
  };
}

export default use3DTilt;
