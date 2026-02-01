'use client';

/**
 * Production-Ready Call View Component
 * Handles video/audio element binding with proper cleanup
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CallState } from '@/lib/webrtc';
import { useAppearance } from '@/lib/useAppearance';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Monitor, Maximize2, Minimize2, Volume2, VolumeX
} from 'lucide-react';

interface CallViewProps {
  callState: CallState;
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
  localStream,
  remoteStream,
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

  // Video element refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  
  // Track element binding state
  const [localVideoReady, setLocalVideoReady] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [remoteAudioReady, setRemoteAudioReady] = useState(false);
  
  // Speaker state
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);

  // Bind local stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log('📹 Binding local stream to video element');
      localVideoRef.current.srcObject = localStream;
      
      // Try to play
      localVideoRef.current.play().catch(err => {
        console.warn('⚠️ Local video play failed:', err);
      });
      
      setLocalVideoReady(true);
    }
  }, [localStream]);

  // Bind remote stream to video and audio elements
  useEffect(() => {
    if (remoteStream) {
      console.log('📹 Binding remote stream:', {
        tracks: remoteStream.getTracks().map(t => `${t.kind}(${t.readyState})`),
        active: remoteStream.active,
        id: remoteStream.id
      });
      
      // Check for audio tracks
      const audioTracks = remoteStream.getAudioTracks();
      console.log(`🎵 Remote audio tracks: ${audioTracks.length}`, audioTracks.map(t => t.readyState));
      
      // Check for video tracks  
      const videoTracks = remoteStream.getVideoTracks();
      console.log(`📹 Remote video tracks: ${videoTracks.length}`, videoTracks.map(t => t.readyState));
      
      // Bind to video element
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        const playPromise = remoteVideoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('⚠️ Remote video play failed:', err);
            // Auto-play was prevented, user interaction needed
          });
        }
        setRemoteVideoReady(true);
      }
      
      // Bind to audio element - CRITICAL for hearing remote audio
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.muted = false; // Ensure not muted
        remoteAudioRef.current.volume = 1.0; // Full volume
        
        const playPromise = remoteAudioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('✅ Remote audio playing');
          }).catch(err => {
            console.warn('⚠️ Remote audio play failed (autoplay policy):', err);
            // Try to play again after user interaction
            const playAudio = () => {
              remoteAudioRef.current?.play().catch(() => {});
              document.removeEventListener('click', playAudio);
            };
            document.addEventListener('click', playAudio);
          });
        }
        setRemoteAudioReady(true);
      }
    }
  }, [remoteStream]);

  // Handle visibility changes (mobile)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 Page hidden - keeping connection alive');
        // Don't stop anything - let WebRTC handle background
      } else {
        console.log('📱 Page visible - resuming video/audio');
        // Resume playback
        if (localVideoRef.current && localStream) {
          localVideoRef.current.play().catch(() => {});
        }
        if (remoteVideoRef.current && remoteStream) {
          remoteVideoRef.current.play().catch(() => {});
        }
        // CRITICAL: Resume audio playback
        if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.play().catch((err) => {
            console.warn('⚠️ Could not resume audio:', err);
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [localStream, remoteStream]);

  // Try to play audio when call connects (workaround for autoplay policy)
  useEffect(() => {
    if (callState.status === 'connected' && remoteStream && remoteAudioRef.current) {
      console.log('📞 Call connected - attempting to play audio');
      const playAudio = () => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.play().then(() => {
            console.log('✅ Audio playing after connection');
          }).catch((err) => {
            console.warn('⚠️ Audio autoplay blocked, will retry on user interaction:', err);
          });
        }
      };
      
      // Try immediately
      playAudio();
      
      // Also try after a short delay (sometimes helps)
      const timeout = setTimeout(playAudio, 500);
      return () => clearTimeout(timeout);
    }
  }, [callState.status, remoteStream]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      const newMutedState = !isSpeakerOff;
      remoteAudioRef.current.muted = newMutedState;
      console.log(`🔊 Speaker ${newMutedState ? 'muted' : 'unmuted'}`);
      setIsSpeakerOff(newMutedState);
    }
  };

  const isVideoCall = callState.type === 'video';
  const hasRemoteVideo = remoteStream?.getVideoTracks().some(t => t.readyState === 'live') ?? false;
  const hasLocalVideo = localStream?.getVideoTracks().some(t => t.readyState === 'live') ?? false;
  
  const showRemoteVideo = isVideoCall && hasRemoteVideo && callState.status === 'connected';
  const showLocalVideo = isVideoCall && hasLocalVideo && callState.status !== 'ringing';

  // Handle click to enable audio (browser autoplay policy workaround)
  const handleContainerClick = useCallback(() => {
    // Try to play audio if it's not already playing
    if (remoteAudioRef.current && remoteAudioRef.current.paused && remoteStream) {
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  return (
    <div 
      className="fixed inset-0 w-screen h-screen bg-black z-[9999] overflow-hidden flex flex-col"
      onClick={handleContainerClick}
    >
      {/* Hidden audio element for reliable audio playback */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        preload="auto"
        className="hidden"
      />

      {/* Remote Video - Fullscreen Background */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        muted // Mute video element (audio plays through separate element)
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          showRemoteVideo ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Avatar/Status Background - When video not shown */}
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
            
            {/* Debug info in development */}
            {process.env.NODE_ENV === 'development' && (
              <p className="text-gray-600 text-xs mt-4">
                Local: {localStream ? '✓' : '✗'} | 
                Remote: {remoteStream ? '✓' : '✗'} | 
                State: {callState.status}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
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
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSpeaker}
              className="p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              title={isSpeakerOff ? "Turn on speaker" : "Turn off speaker"}
            >
              {isSpeakerOff ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onToggleFullscreen}
              className="p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        )}
      </div>

      {/* Local Video - Picture in Picture */}
      {showLocalVideo && (
        <motion.div
          className="absolute z-40 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bottom-28 right-4 w-28 h-36 md:bottom-32 md:right-6 md:w-48 md:h-36"
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

          {/* Mute indicator */}
          {isMuted && (
            <div className="absolute bottom-2 right-2 p-1.5 bg-red-500 rounded-full">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          )}
          
          {/* Stream status indicator */}
          {!localVideoReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              {/* Mute */}
              <motion.button
                onClick={onToggleMute}
                className={`p-4 md:p-5 rounded-full transition-all shadow-lg ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {isMuted ? (
                  <MicOff className="w-6 h-6 md:w-7 md:h-7 text-white" />
                ) : (
                  <Mic className="w-6 h-6 md:w-7 md:h-7 text-white" />
                )}
              </motion.button>

              {/* Video Toggle */}
              {isVideoCall && (
                <motion.button
                  onClick={onToggleVideo}
                  className={`p-4 md:p-5 rounded-full transition-all shadow-lg ${
                    isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
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

              {/* Screen Share */}
              {isVideoCall && callState.status === 'connected' && (
                <motion.button
                  onClick={onToggleScreenShare}
                  className={`p-4 md:p-5 rounded-full transition-all shadow-lg ${
                    isScreenSharing ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
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
          {callState.status === 'connected' && (
            <span className="text-green-500 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Connected
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export default CallView;
