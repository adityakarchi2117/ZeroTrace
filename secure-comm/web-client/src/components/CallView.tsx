'use client';

/**
 * Fullscreen Call View Component
 * Production-ready video call UI with responsive layout
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CallState } from '@/lib/webrtc';
import { useAppearance } from '@/lib/useAppearance';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Monitor, Maximize2, Minimize2
} from 'lucide-react';

interface CallViewProps {
  callState: CallState;
  callDuration: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isFullscreen: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleFullscreen: () => void;
  onEndCall: () => void;
  onRejectCall?: () => void;
  onAnswerCall?: () => void;
}

export function CallView({
  callState,
  callDuration,
  isMuted,
  isVideoOff,
  isScreenSharing,
  isFullscreen,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleFullscreen,
  onEndCall,
  onRejectCall,
  onAnswerCall,
}: CallViewProps) {
  const { getAccentGradient } = useAppearance();
  const accentGradient = getAccentGradient();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Handle window resize for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Sync streams to video/audio elements
  useEffect(() => {
    if (callState.localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = callState.localStream;
    }
    if (callState.remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = callState.remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = callState.remoteStream;
      }
    }
  }, [callState.localStream, callState.remoteStream]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isVideoCall = callState.type === 'video';
  const hasRemoteVideo = callState.remoteStream && callState.remoteStream.getVideoTracks().length > 0;
  const isMobile = windowSize.width < 768;

  // Determine layout based on call state
  const showRemoteVideo = isVideoCall && hasRemoteVideo && callState.status === 'connected';
  const showLocalVideo = isVideoCall && callState.status !== 'ringing';

  return (
    <div
      className="fixed inset-0 w-screen h-screen bg-black z-[9999] overflow-hidden flex flex-col"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Remote Video - Fullscreen Background */}
      {/* Remote Audio - Always rendered for reliable audio playback */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
      />

      {/* Remote Video - Fullscreen Background */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        muted // Mute the video element since we have a separate audio element
        className={`absolute inset-0 w-full h-full object-cover ${showRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Avatar Background - Overlay when video is not shown */}
      {!showRemoteVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 to-black z-10">
          <div className="text-center">
            <motion.div
              className="w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: accentGradient }}
              animate={callState.status === 'calling' || callState.status === 'ringing' ? {
                scale: [1, 1.05, 1],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-5xl md:text-7xl text-white font-bold">
                {callState.remoteUsername.charAt(0).toUpperCase()}
              </span>
            </motion.div>

            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              {callState.remoteUsername}
            </h2>

            <p className="text-gray-400 text-lg">
              {callState.status === 'calling' && 'Calling...'}
              {callState.status === 'ringing' && (callState.isIncoming ? 'Incoming call...' : 'Ringing...')}
              {callState.status === 'connecting' && 'Connecting...'}
              {callState.status === 'connected' && (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  {formatDuration(callDuration)}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Top Bar - Caller Info */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 md:p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center"
            style={{ background: accentGradient }}
          >
            <span className="text-white font-bold text-lg">
              {callState.remoteUsername.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-white font-medium text-lg">{callState.remoteUsername}</h3>
            {callState.status === 'connected' && (
              <span className="text-green-400 text-sm">{formatDuration(callDuration)}</span>
            )}
            {isScreenSharing && (
              <span className="text-blue-400 text-sm flex items-center gap-1 ml-2">
                <Monitor className="w-3 h-3" /> Presenting
              </span>
            )}
          </div>
        </div>

        {callState.status === 'connected' && (
          <button
            onClick={onToggleFullscreen}
            className="p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Local Video - Picture in Picture */}
      {showLocalVideo && (
        <motion.div
          className={`
            absolute z-40 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20
            ${isMobile
              ? 'bottom-28 right-4 w-28 h-36'
              : 'bottom-32 right-6 w-48 h-36 md:w-64 md:h-48'
            }
          `}
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {isVideoOff ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: accentGradient }}
              >
                <span className="text-2xl text-white font-bold">You</span>
              </div>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}

          {/* Mute indicator on local video */}
          {isMuted && (
            <div className="absolute bottom-2 right-2 p-1.5 bg-red-500 rounded-full">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          )}
        </motion.div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-50 p-4 md:p-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <div className="flex items-center justify-center gap-3 md:gap-4">
          {/* Incoming Call Buttons */}
          {callState.status === 'ringing' && callState.isIncoming && (
            <>
              <motion.button
                onClick={onRejectCall}
                className="p-4 md:p-5 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-lg"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <PhoneOff className="w-7 h-7 md:w-8 md:h-8 text-white" />
              </motion.button>
              <motion.button
                onClick={onAnswerCall}
                className="p-4 md:p-5 bg-green-500 rounded-full hover:bg-green-600 transition-all shadow-lg"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {isVideoCall ? (
                  <Video className="w-7 h-7 md:w-8 md:h-8 text-white" />
                ) : (
                  <Phone className="w-7 h-7 md:w-8 md:h-8 text-white" />
                )}
              </motion.button>
            </>
          )}

          {/* Active Call Controls */}
          {(callState.status === 'calling' || callState.status === 'connecting' || callState.status === 'connected') && (
            <>
              {/* Mute Button */}
              <motion.button
                onClick={onToggleMute}
                className={`
                  p-4 md:p-5 rounded-full transition-all shadow-lg
                  ${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}
                `}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {isMuted ? (
                  <MicOff className="w-6 h-6 md:w-7 md:h-7 text-white" />
                ) : (
                  <Mic className="w-6 h-6 md:w-7 md:h-7 text-white" />
                )}
              </motion.button>

              {/* Video Toggle (Video calls only) */}
              {isVideoCall && (
                <motion.button
                  onClick={onToggleVideo}
                  className={`
                    p-4 md:p-5 rounded-full transition-all shadow-lg
                    ${isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}
                  `}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isVideoOff ? (
                    <VideoOff className="w-6 h-6 md:w-7 md:h-7 text-white" />
                  ) : (
                    <Video className="w-6 h-6 md:w-7 md:h-7 text-white" />
                  )}
                </motion.button>
              )}

              {/* Screen Share (Connected video calls only) */}
              {isVideoCall && callState.status === 'connected' && (
                <motion.button
                  onClick={onToggleScreenShare}
                  className={`
                    p-4 md:p-5 rounded-full transition-all shadow-lg
                    ${isScreenSharing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}
                  `}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Monitor className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </motion.button>
              )}

              {/* End Call */}
              <motion.button
                onClick={onEndCall}
                className="p-4 md:p-5 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-lg px-6 md:px-8"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <PhoneOff className="w-6 h-6 md:w-7 md:h-7 text-white" />
              </motion.button>
            </>
          )}
        </div>

        {/* Status Text */}
        <p className="text-center text-gray-400 text-sm mt-4">
          {callState.status === 'connecting' && 'Establishing secure connection...'}
          {callState.status === 'calling' && 'Waiting for answer...'}
        </p>
      </div>
    </div>
  );
}

export default CallView;
