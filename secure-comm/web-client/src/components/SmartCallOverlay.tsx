/**
 * Smart Call Overlay
 * Floating call window that stays visible when app is minimized/tab switched
 * Tracks window focus and repositions automatically
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWindowFocus } from '@/hooks/useWindowFocus';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

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
  minimizeOnBlur?: boolean;
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
  minimizeOnBlur = true,
}: SmartCallOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Window focus tracking
  const { isFocused, isVisible } = useWindowFocus({
    onBlur: () => {
      if (minimizeOnBlur && isInCall) {
        setIsMinimized(true);
        setShowIndicator(true);
      }
    },
    onFocus: () => {
      if (!minimizeOnBlur) {
        setIsMinimized(false);
      }
    },
  });

  // Keep call alive in background
  useEffect(() => {
    if (!isInCall) {
      setIsMinimized(false);
      setShowIndicator(false);
      return;
    }

    // Show minimized view when not focused
    if (!isFocused && minimizeOnBlur) {
      setIsMinimized(true);
    }
  }, [isInCall, isFocused, minimizeOnBlur]);

  // Request notification permission
  useEffect(() => {
    if (isInCall && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isInCall]);

  // Send notification when minimized
  useEffect(() => {
    if (isMinimized && isInCall && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Call in progress', {
        body: `On call with ${remoteUsername} - ${formatDuration(callDuration)}`,
        icon: '/favicon.ico',
        requireInteraction: true,
      });
    }
  }, [isMinimized, isInCall, remoteUsername, callDuration]);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
    setShowIndicator(false);
    onRestore();
    
    // Focus the window
    window.focus();
  }, [onRestore]);

  if (!isInCall) return null;

  return (
    <AnimatePresence>
      {isMinimized ? (
        // Minimized Floating View
        <motion.div
          key="minimized"
          className="fixed z-[99999] flex flex-col gap-2"
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.8 }}
          style={{
            bottom: '20px',
            right: '20px',
          }}
        >
          {/* Main minimized card */}
          <motion.div
            className="bg-gray-900/95 backdrop-blur-lg rounded-2xl p-4 shadow-2xl border border-white/10 cursor-pointer hover:border-white/30 transition-colors"
            onClick={handleRestore}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
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

          {/* Background indicator */}
          <motion.div
            className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </motion.div>
      ) : showIndicator && !isFocused ? (
        // Small indicator when not focused but not minimized
        <motion.button
          key="indicator"
          className="fixed bottom-4 right-4 z-[99999] p-3 bg-green-500 rounded-full shadow-lg hover:bg-green-600 transition-colors"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          onClick={handleRestore}
        >
          <Phone className="w-5 h-5 text-white" />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-green-600 text-xs font-bold rounded-full flex items-center justify-center">
            {Math.floor(callDuration / 60)}
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

export default SmartCallOverlay;
