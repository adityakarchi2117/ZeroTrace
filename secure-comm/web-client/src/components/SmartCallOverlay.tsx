/**
 * Smart Call Overlay
 * Floating call window that stays visible when app is minimized/tab switched
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

const ElectricBorder = dynamic(() => import('./ElectricBorder'), { ssr: false });

interface SmartCallOverlayProps {
  isInCall: boolean;
  callDuration: number;
  remoteUsername: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isVideoCall: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  onRestore: () => void;
}

export function SmartCallOverlay({
  isInCall,
  callDuration,
  remoteUsername,
  isMuted,
  isVideoOff,
  isVideoCall,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  onRestore,
}: SmartCallOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Track visibility change (tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      console.log('👁️ Visibility changed:', hidden ? 'hidden' : 'visible');
      
      if (hidden && isInCall) {
        setIsMinimized(true);
        setIsVisible(false);
      } else {
        setIsVisible(true);
        // Don't immediately unminimize - let user click restore
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isInCall]);

  // Track window blur/focus
  useEffect(() => {
    const handleBlur = () => {
      console.log('👁️ Window blurred');
      if (isInCall) {
        setIsMinimized(true);
      }
    };

    const handleFocus = () => {
      console.log('👁️ Window focused');
      setIsVisible(true);
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isInCall]);

  // Reset when call ends
  useEffect(() => {
    if (!isInCall) {
      setIsMinimized(false);
      setIsVisible(true);
    }
  }, [isInCall]);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
    onRestore();
    window.focus();
  }, [onRestore]);

  if (!isInCall) return null;

  // Show minimized overlay when tab is hidden or window blurred
  const shouldShowMinimized = isMinimized || !isVisible;

  return (
    <AnimatePresence>
      {shouldShowMinimized && (
        <motion.div
          key="minimized"
          className="fixed z-[99999]"
          initial={{ opacity: 0, scale: 0.8, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 50 }}
          style={{
            bottom: '20px',
            right: '20px',
          }}
        >
          {/* Main minimized card with electric border */}
          <ElectricBorder
            color="#22c55e"
            speed={1.2}
            chaos={0.08}
            borderRadius={16}
            thickness={2}
          >
            <motion.div
              className="bg-gray-900/95 backdrop-blur-lg rounded-2xl p-4 shadow-2xl cursor-pointer transition-colors"
              onClick={handleRestore}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                {/* Avatar with subtle glow */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg ring-2 ring-green-500/50">
                  {remoteUsername.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-[120px]">
                  <p className="text-white font-medium truncate">{remoteUsername}</p>
                  <p className="text-green-400 text-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    {formatDuration(callDuration)}
                  </p>
                </div>

                {/* Quick End */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEndCall();
                  }}
                  className="p-2.5 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                >
                  <PhoneOff className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Quick Controls */}
              <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-white/10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute();
                  }}
                  className={`p-2 rounded-full transition-colors ${
                    isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {isVideoCall && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVideo();
                    }}
                    className={`p-2 rounded-full transition-colors ${
                      isVideoOff ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestore();
                  }}
                  className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm hover:bg-blue-500/30 transition-colors"
                >
                  Restore
                </button>
              </div>
            </motion.div>
          </ElectricBorder>

          {/* Pulsing indicator */}
          <motion.div
            className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SmartCallOverlay;
