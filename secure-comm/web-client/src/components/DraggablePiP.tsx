/**
 * Draggable Picture-in-Picture Component
 * Floating mini-window for local/remote video
 * Supports drag, resize, and swap
 */

'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDraggable } from '@/hooks/useDraggable';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';

interface DraggablePiPProps {
  children: React.ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  onSwap?: () => void;
  onExpand?: () => void;
  isExpanded?: boolean;
  className?: string;
}

export function DraggablePiP({
  children,
  initialPosition = { x: window.innerWidth - 220, y: window.innerHeight - 280 },
  initialSize = { width: 180, height: 240 },
  minSize = { width: 120, height: 160 },
  maxSize = { width: 320, height: 240 },
  onSwap,
  onExpand,
  isExpanded = false,
  className = '',
}: DraggablePiPProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Calculate bounds
  const bounds = {
    left: 0,
    right: window.innerWidth - size.width,
    top: 0,
    bottom: window.innerHeight - size.height - 100, // Leave space for nav
  };

  const { position, isDragging } = useDraggable(containerRef, {
    initialPosition,
    bounds,
    onDragStart: () => setShowControls(false),
  });

  // Handle resize
  const handleResize = useCallback((delta: number) => {
    setSize(prev => {
      const newWidth = Math.max(minSize.width, Math.min(maxSize.width, prev.width + delta));
      const aspectRatio = prev.height / prev.width;
      const newHeight = Math.round(newWidth * aspectRatio);
      return {
        width: newWidth,
        height: Math.max(minSize.height, Math.min(maxSize.height, newHeight)),
      };
    });
  }, [minSize, maxSize]);

  // Handle double click to swap
  const handleDoubleClick = useCallback(() => {
    onSwap?.();
  }, [onSwap]);

  return (
    <motion.div
      ref={containerRef}
      className={`fixed z-[9999] rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      whileHover={{ borderColor: 'rgba(255,255,255,0.4)' }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onDoubleClick={handleDoubleClick}
    >
      {/* Content */}
      <div className="w-full h-full relative">
        {children}

        {/* Overlay Controls */}
        <motion.div
          className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: showControls || isDragging ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Swap Button */}
          {onSwap && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSwap();
              }}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              title="Swap videos"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Expand/Collapse */}
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              title={isExpanded ? "Minimize" : "Expand"}
            >
              {isExpanded ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}
        </motion.div>

        {/* Drag Handle Indicator */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1">
          <div className="w-8 h-1 bg-white/30 rounded-full" />
        </div>

        {/* Resize Handle */}
        <div
          className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-end justify-end p-1"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);

            const startX = e.clientX;
            const startWidth = size.width;

            const handleResizeMove = (moveEvent: MouseEvent) => {
              const delta = moveEvent.clientX - startX;
              handleResize(delta);
            };

            const handleResizeEnd = () => {
              setIsResizing(false);
              window.removeEventListener('mousemove', handleResizeMove);
              window.removeEventListener('mouseup', handleResizeEnd);
            };

            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="text-white/50"
          >
            <path
              d="M8 8L12 12M4 8L8 12M0 8L4 12"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>

      {/* Size indicator when resizing */}
      {isResizing && (
        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {Math.round(size.width)}×{Math.round(size.height)}
        </div>
      )}
    </motion.div>
  );
}

export default DraggablePiP;
