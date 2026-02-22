/**
 * Enhanced Call View Component
 * Full-featured video calling with PiP, draggable windows, and smart minimize
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useCall } from '@/contexts/CallProvider';
import { DraggablePiP } from './DraggablePiP';
import { SmartCallOverlay } from './SmartCallOverlay';
import { usePictureInPicture } from '@/hooks/usePictureInPicture';
import { useWindowFocus } from '@/hooks/useWindowFocus';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Monitor, Maximize2, Minimize2, PictureInPicture,
  RefreshCw
} from 'lucide-react';

const ElectricBorder = dynamic(() => import('./ElectricBorder'), { ssr: false });

export function EnhancedCallView() {
  const {
    callState,
    isInCall,
    callDuration,
    isFullscreen,
    isMinimized,
    showLocalInPiP,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleFullscreen,
    swapVideos,
    restoreCall,
  } = useCall();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Picture in Picture hooks
  const remotePiP = usePictureInPicture(remoteVideoRef, {
    onEnter: () => console.log('Remote PiP entered'),
    onLeave: () => console.log('Remote PiP left'),
  });

  // Window focus tracking
  const { isVisible } = useWindowFocus({
    onBlur: () => {
      // Auto-minimize when switching tabs (optional)
      // setIsMinimized(true);
    },
  });

  // Bind streams to video elements
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  // Auto-hide controls
  useEffect(() => {
    const resetControlsTimeout = () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      setShowControls(true);
      controlsTimeoutRef.current = setTimeout(() => {
        if (callState?.status === 'connected') {
          setShowControls(false);
        }
      }, 3000);
    };

    window.addEventListener('mousemove', resetControlsTimeout);
    window.addEventListener('click', resetControlsTimeout);
    resetControlsTimeout();

    return () => {
      window.removeEventListener('mousemove', resetControlsTimeout);
      window.removeEventListener('click', resetControlsTimeout);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [callState?.status]);

  if (!callState || !isInCall) return null;

  const isVideoCall = callState.type === 'video';
  const isRinging = callState.status === 'ringing';
  const isIncoming = callState.isIncoming;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Main fullscreen call view
  const MainCallView = () => (
    <motion.div
      className={`fixed inset-0 z-[9999] bg-black overflow-hidden ${isFullscreen ? 'cursor-none' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={() => setShowControls(true)}
    >
      {/* Remote Video / Main View */}
      <div className="absolute inset-0">
        {showLocalInPiP ? (
          // Remote is main, local is PiP
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }} // Mirror effect
          />
        ) : (
          // Local is main, remote is PiP
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Avatar placeholder when no video */}
        {(!remoteStream || remoteStream.getVideoTracks().length === 0) && showLocalInPiP && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900 to-black">
            <div className="text-center">
              {/* Electric border around avatar during calling/connecting */}
              <ElectricBorder
                color={isRinging ? (isIncoming ? '#22c55e' : '#facc15') : '#5227FF'}
                speed={isRinging ? 2 : 1.5}
                chaos={isRinging ? 0.18 : 0.12}
                borderRadius={9999}
                thickness={3}
                className="mx-auto mb-4"
              >
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-5xl text-white font-bold">
                    {callState.remoteUsername.charAt(0).toUpperCase()}
                  </span>
                </div>
              </ElectricBorder>
              <h2 className="text-white text-2xl font-bold">{callState.remoteUsername}</h2>
              <p className="text-gray-400 mt-2">
                {callState.status === 'connecting' ? 'Connecting...' : 
                 callState.status === 'calling' ? 'Calling...' : 
                 isRinging && isIncoming ? 'Incoming call...' :
                 formatDuration(callDuration)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Draggable Local Video PiP */}
      {isVideoCall && (
        <DraggablePiP
          initialPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 220 : 600, y: 100 }}
          onSwap={swapVideos}
          onExpand={() => swapVideos()}
        >
          {showLocalInPiP ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}
          
          {/* Muted indicator */}
          {isMuted && (
            <div className="absolute bottom-2 right-2 p-1.5 bg-red-500 rounded-full">
              <MicOff className="w-3 h-3 text-white" />
            </div>
          )}
        </DraggablePiP>
      )}

      {/* Top Bar - Caller Info */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute top-0 left-0 right-0 z-[10000] p-6 bg-gradient-to-b from-black/80 to-transparent"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                  {callState.remoteUsername.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg">{callState.remoteUsername}</h3>
                  <div className="flex items-center gap-2 text-sm">
                    {callState.status === 'connected' ? (
                      <>
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-green-400">{formatDuration(callDuration)}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">
                        {callState.status === 'connecting' ? 'Connecting...' : 'Calling...'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleFullscreen}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  title="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
                {remotePiP.isSupported && (
                  <button
                    onClick={remotePiP.togglePiP}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  >
                    <PictureInPicture className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 z-[10000] p-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="flex items-center justify-center gap-4">
              {/* Incoming Call Actions */}
              {isRinging && isIncoming ? (
                <>
                  {/* Reject with red electric border */}
                  <ElectricBorder
                    color="#ef4444"
                    speed={2}
                    chaos={0.15}
                    borderRadius={9999}
                    thickness={2}
                  >
                    <motion.button
                      onClick={rejectCall}
                      className="p-5 bg-red-500 hover:bg-red-600 rounded-full transition-all shadow-lg"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <PhoneOff className="w-8 h-8 text-white" />
                    </motion.button>
                  </ElectricBorder>
                  
                  {/* Answer with green electric border */}
                  <ElectricBorder
                    color="#22c55e"
                    speed={2}
                    chaos={0.15}
                    borderRadius={9999}
                    thickness={2}
                  >
                    <motion.button
                      onClick={answerCall}
                      className="p-5 bg-green-500 hover:bg-green-600 rounded-full transition-all shadow-lg"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isVideoCall ? (
                        <Video className="w-8 h-8 text-white" />
                      ) : (
                        <Phone className="w-8 h-8 text-white" />
                      )}
                    </motion.button>
                  </ElectricBorder>
                </>
              ) : (
                <>
                  {/* Mute */}
                  <ControlButton
                    onClick={toggleMute}
                    active={isMuted}
                    icon={isMuted ? MicOff : Mic}
                    label={isMuted ? 'Unmute' : 'Mute'}
                  />

                  {/* Video Toggle */}
                  {isVideoCall && (
                    <ControlButton
                      onClick={toggleVideo}
                      active={isVideoOff}
                      icon={isVideoOff ? VideoOff : Video}
                      label={isVideoOff ? 'Start Video' : 'Stop Video'}
                    />
                  )}

                  {/* Screen Share */}
                  {isVideoCall && (
                    <ControlButton
                      onClick={toggleScreenShare}
                      active={isScreenSharing}
                      icon={Monitor}
                      label={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
                      activeColor="bg-blue-500"
                    />
                  )}

                  {/* Swap Videos */}
                  {isVideoCall && (
                    <ControlButton
                      onClick={swapVideos}
                      active={false}
                      icon={RefreshCw}
                      label="Swap"
                    />
                  )}

                  {/* End Call */}
                  <motion.button
                    onClick={endCall}
                    className="p-5 bg-red-500 hover:bg-red-600 rounded-full transition-all shadow-lg px-8"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <>
      {/* Main Call View */}
      {!isMinimized && <MainCallView />}

      {/* Smart Minimize Overlay - Shows when tab switched/app minimized */}
      <SmartCallOverlay
        isInCall={isInCall}
        callDuration={callDuration}
        remoteUsername={callState.remoteUsername}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isVideoCall={isVideoCall}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onEndCall={endCall}
        onRestore={restoreCall}
      />
    </>
  );
}

// Control Button Component
interface ControlButtonProps {
  onClick: () => void;
  active: boolean;
  icon: React.ElementType;
  label: string;
  activeColor?: string;
}

function ControlButton({ onClick, active, icon: Icon, label, activeColor = 'bg-red-500' }: ControlButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`p-4 rounded-full transition-all shadow-lg flex flex-col items-center gap-1 ${
        active 
          ? `${activeColor} text-white` 
          : 'bg-gray-700/80 hover:bg-gray-600 text-white'
      }`}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      title={label}
    >
      <Icon className="w-6 h-6" />
      <span className="text-xs opacity-70">{label}</span>
    </motion.button>
  );
}

export default EnhancedCallView;
