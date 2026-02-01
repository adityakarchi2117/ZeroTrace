/**
 * Draggable Hook
 * Makes any element draggable with bounds checking
 * Supports touch and mouse events
 */

import { useState, useEffect, useCallback, useRef, RefObject } from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  initialPosition?: Position;
  bounds?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  onDragStart?: () => void;
  onDragEnd?: (position: Position) => void;
  onDrag?: (position: Position) => void;
}

export function useDraggable(
  elementRef: RefObject<HTMLElement>,
  options: UseDraggableOptions = {}
) {
  const { 
    initialPosition = { x: 0, y: 0 },
    bounds,
    onDragStart,
    onDragEnd,
    onDrag,
  } = options;

  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  
  const dragStartRef = useRef<Position>({ x: 0, y: 0 });
  const elementStartRef = useRef<Position>({ x: 0, y: 0 });

  const clamp = useCallback((value: number, min?: number, max?: number): number => {
    let clamped = value;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    return clamped;
  }, []);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartRef.current = { x: clientX, y: clientY };
    elementStartRef.current = { ...position };
    onDragStart?.();
  }, [position, onDragStart]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;

    let newX = elementStartRef.current.x + deltaX;
    let newY = elementStartRef.current.y + deltaY;

    // Apply bounds
    if (bounds) {
      newX = clamp(newX, bounds.left, bounds.right);
      newY = clamp(newY, bounds.top, bounds.bottom);
    }

    const newPosition = { x: newX, y: newY };
    setPosition(newPosition);
    onDrag?.(newPosition);
  }, [isDragging, bounds, clamp, onDrag]);

  const handleEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onDragEnd?.(position);
    }
  }, [isDragging, position, onDragEnd]);

  // Mouse events
  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const handleMouseUp = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Touch events
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  }, [handleStart]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, [handleMove]);

  const handleTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('touchstart', handleTouchStart, { passive: false });

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [elementRef, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    position,
    isDragging,
    setPosition,
  };
}

export default useDraggable;
