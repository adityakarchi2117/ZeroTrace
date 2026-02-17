'use client';

/**
 * Zoom-Style Call View Component
 * - Remote video: Full screen
 * - Local video: Draggable floating window
 * - Click to swap
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { CallState } from '@/lib/webrtc';
import { useAppearance } from '@/lib/useAppearance';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Monitor, Maximize2, Minimize2, Volume2, VolumeX,
  SwitchCamera
} from 'lucide-react';

const ReflectiveCard = dynamic(() => import('./ReflectiveCard'), { ssr: false });

interface CallViewProps {
  callState: CallState;
  localUsername?: string;
  callDuration: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isFullscreen: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleFullscreen: () => void;
  onSwitchCamera?: () => void;
  onEndCall: () => void;
  onRejectCall?: () => void;
  onAnswerCall?: () => void;
}

// Draggable hook
function useDraggable(initialPosition: { x: number; y: number }) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const elementStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    dragStart.current = { x: clientX, y: clientY };
    elementStart.current = { ...position };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - dragStart.current.x;
    const deltaY = clientY - dragStart.current.y;
    
    // Keep within window bounds
    const newX = Math.max(16, Math.min(window.innerWidth - 176, elementStart.current.x + deltaX));
    const newY = Math.max(80, Math.min(window.innerHeight - 136, elementStart.current.y + deltaY));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return { position, isDragging, handleMouseDown };
}

export function CallView({
  callState,
  localUsername,
  callDuration,
  isMuted,
  isVideoOff,
  isScreenSharing,
  isFullscreen,
  localStream,
  remoteStream,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleFullscreen,
  onSwitchCamera,
  onEndCall,
  onRejectCall,
  onAnswerCall,
}: CallViewProps) {
  const { getAccentGradient } = useAppearance();
  const accentGradient = getAccentGradient();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  
  const [pipPosition, setPipPosition] = useState({ x: window.innerWidth - 200, y: 100 });
  const [showLocalInPip, setShowLocalInPip] = useState(true);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { position, isDragging, handleMouseDown } = useDraggable(pipPosition);

  // Update pipPosition when drag ends
  useEffect(() => {
    if (!isDragging) {
      setPipPosition(position);
    }
  }, [position, isDragging]);

  // Bind streams
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1;
        remoteAudioRef.current.play().catch(() => {});
      }
    }
  }, [remoteStream]);

  // Auto-hide controls
  useEffect(() => {
    const resetTimeout = () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      setShowControls(true);
      controlsTimeoutRef.current = setTimeout(() => {
        if (callState.status === 'connected') setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', resetTimeout);
    window.addEventListener('click', resetTimeout);
    resetTimeout();

    return () => {
      window.removeEventListener('mousemove', resetTimeout);
      window.removeEventListener('click', resetTimeout);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [callState.status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOff;
      setIsSpeakerOff(!isSpeakerOff);
    }
  };

  const swapVideos = () => {
    setShowLocalInPip(!showLocalInPip);
  };

  const isVideoCall = callState.type === 'video';
  const isRinging = callState.status === 'ringing';
  const isIncoming = callState.isIncoming;
  const hasRemoteVideo = remoteStream?.getVideoTracks().some(t => t.readyState === 'live');
  const showReflectiveCard = !isVideoCall || callState.status !== 'connected' || !hasRemoteVideo;

  // Determine which stream goes where
  const mainStream = showLocalInPip ? remoteStream : localStream;
  const pipStream = showLocalInPip ? localStream : remoteStream;
  const mainVideoRef = showLocalInPip ? remoteVideoRef : localVideoRef;
  const pipVideoRef = showLocalInPip ? localVideoRef : remoteVideoRef;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black z-[9999] overflow-hidden">
      {/* Audio element */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Main Video (Full Screen) */}
      <div className="absolute inset-0">
        {mainStream && !showReflectiveCard ? (
          <video
            ref={mainVideoRef as React.RefObject<HTMLVideoElement>}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            onClick={swapVideos}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
            <ReflectiveCard
              remoteUsername={callState.remoteUsername}
              localUsername={localUsername}
              callType={callState.type}
              status={callState.status as 'calling' | 'ringing' | 'connecting' | 'connected'}
              isIncoming={callState.isIncoming}
              stream={isVideoCall ? (remoteStream ?? localStream) : null}
              color="#ffffff"
              overlayColor="rgba(8, 8, 22, 0.35)"
            />
          </div>
        )}
      </div>

      {/* Draggable PiP Window (like Zoom) */}
      {isVideoCall && pipStream && (
        <motion.div
          className="absolute z-50 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black/50 backdrop-blur-sm cursor-move"
          style={{
            width: 160,
            height: 120,
            left: position.x,
            top: position.y,
          }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ borderColor: 'rgba(255,255,255,0.5)' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onClick={(e) => {
            if (!isDragging) swapVideos();
          }}
        >
          <video
            ref={pipVideoRef as React.RefObject<HTMLVideoElement>}
            autoPlay
            playsInline
            muted={showLocalInPip}
            className="w-full h-full object-cover"
          />
          
          {/* Swap hint */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/50 rounded-full text-white text-[10px] opacity-0 hover:opacity-100 transition-opacity">
            Click to swap
          </div>

          {/* Mute indicator */}
          {isMuted && showLocalInPip && (
            <div className="absolute bottom-2 right-2 p-1 bg-red-500 rounded-full">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          )}

          {/* Drag handle */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/30 rounded-full cursor-move" />
        </motion.div>
      )}

      {/* Top Bar */}
      <motion.div 
        className="absolute top-0 left-0 right-0 z-40 p-4 bg-gradient-to-b from-black/80 to-transparent"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : -20 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: accentGradient }}>
              <span className="text-white font-bold">{callState.remoteUsername.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h3 className="text-white font-medium">{callState.remoteUsername}</h3>
              <span className="text-green-400 text-sm flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {callState.status === 'connected' ? formatDuration(callDuration) : callState.status}
              </span>
            </div>
          </div>

          {callState.status === 'connected' && (
            <div className="flex items-center gap-2">
              <button onClick={toggleSpeaker} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                {isSpeakerOff ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <button onClick={onToggleFullscreen} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white">
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Bottom Controls */}
      <motion.div 
        className="absolute bottom-0 left-0 right-0 z-40 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : 20 }}
      >
        <div className="flex items-center justify-center gap-4">
          {isRinging && isIncoming ? (
            <>
              <motion.button 
                onClick={onRejectCall} 
                className="p-5 bg-red-500 rounded-full" 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </motion.button>
              
              <motion.button 
                onClick={onAnswerCall} 
                className="p-5 bg-green-500 rounded-full" 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
              >
                {isVideoCall ? <Video className="w-8 h-8 text-white" /> : <Phone className="w-8 h-8 text-white" />}
              </motion.button>
            </>
          ) : (
            <>
              {/* Mute */}
              <motion.button 
                onClick={onToggleMute} 
                className={`p-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-700'}`}
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
              >
                {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
              </motion.button>

              {/* Video Toggle */}
              {isVideoCall && (
                <motion.button 
                  onClick={onToggleVideo} 
                  className={`p-4 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'}`}
                  whileHover={{ scale: 1.1 }} 
                  whileTap={{ scale: 0.95 }}
                >
                  {isVideoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
                </motion.button>
              )}

              {/* Switch Camera (Front/Back) */}
              {isVideoCall && onSwitchCamera && (
                <motion.button 
                  onClick={onSwitchCamera} 
                  className="p-4 bg-gray-700 rounded-full"
                  whileHover={{ scale: 1.1 }} 
                  whileTap={{ scale: 0.95 }}
                  title="Switch camera"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </motion.button>
              )}

              {/* Screen Share */}
              {isVideoCall && callState.status === 'connected' && (
                <motion.button 
                  onClick={onToggleScreenShare} 
                  className={`p-4 rounded-full ${isScreenSharing ? 'bg-blue-500' : 'bg-gray-700'}`}
                  whileHover={{ scale: 1.1 }} 
                  whileTap={{ scale: 0.95 }}
                >
                  <Monitor className="w-6 h-6 text-white" />
                </motion.button>
              )}

              {/* Swap Videos */}
              <motion.button 
                onClick={swapVideos} 
                className="p-4 bg-gray-700 rounded-full"
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
              >
                <SwitchCamera className="w-6 h-6 text-white" />
              </motion.button>

              {/* End Call */}
              <motion.button 
                onClick={onEndCall} 
                className="p-4 bg-red-500 rounded-full px-8"
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </motion.button>
            </>
          )}
        </div>

        <p className="text-center text-gray-400 text-sm mt-4">
          {callState.status === 'connected' && (
            <span className="text-green-500 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" /> Connected
            </span>
          )}
        </p>
      </motion.div>
    </div>
  );
}

export default CallView;
