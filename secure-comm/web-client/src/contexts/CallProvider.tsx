/**
 * Call Provider Context
 * Global state management for video calling
 * Handles call state, media streams, and UI modes
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { webrtcService, CallState, CallType } from '@/lib/webrtc';

interface CallContextType {
  callState: CallState | null;
  isInCall: boolean;
  callDuration: number;
  isFullscreen: boolean;
  isMinimized: boolean;
  isPictureInPicture: boolean;
  showLocalInPiP: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  startCall: (username: string, type: CallType) => Promise<boolean>;
  answerCall: () => Promise<boolean>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => Promise<boolean>;
  toggleFullscreen: () => void;
  toggleMinimize: () => void;
  togglePictureInPicture: () => void;
  swapVideos: () => void;
  restoreCall: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [callState, setCallState] = useState<CallState | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [showLocalInPiP, setShowLocalInPiP] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    webrtcService.setOnStateChange((state) => {
      setCallState(state);
      setIsMuted(state.isMuted);
      setIsVideoOff(state.isVideoOff);
      
      if (state.status === 'connected' && !durationIntervalRef.current) {
        durationIntervalRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      }
      
      if (state.status === 'ended' || state.status === 'failed' || state.status === 'rejected') {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        setCallDuration(0);
        setIsFullscreen(false);
        setIsMinimized(false);
        setIsPictureInPicture(false);
      }
    });

    webrtcService.setOnLocalStream((stream) => setLocalStream(stream));
    webrtcService.setOnRemoteStream((stream) => setRemoteStream(stream));

    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      // Nullify handlers on unmount to avoid stale closures / conflicts with useWebRTC
      webrtcService.setOnStateChange(null);
      webrtcService.setOnLocalStream(null);
      webrtcService.setOnRemoteStream(null);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const startCall = useCallback(async (username: string, type: CallType) => {
    return webrtcService.startCall(username, type);
  }, []);

  const answerCall = useCallback(async () => webrtcService.answerCall(), []);
  const rejectCall = useCallback(() => webrtcService.rejectCall(), []);

  const endCall = useCallback(() => {
    webrtcService.endCall();
    setIsScreenSharing(false);
    setIsFullscreen(false);
    setIsMinimized(false);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(webrtcService.toggleMute());
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoOff(webrtcService.toggleVideo());
  }, []);

  const toggleScreenShare = useCallback(async (): Promise<boolean> => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        try {
          const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = cameraStream.getVideoTracks()[0];
          if (videoTrack) await webrtcService.replaceVideoTrack(videoTrack);
        } catch (e) {}
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      return false;
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          await webrtcService.replaceVideoTrack(videoTrack);
          screenStreamRef.current = stream;
          videoTrack.onended = () => {
            setIsScreenSharing(false);
            screenStreamRef.current = null;
          };
          setIsScreenSharing(true);
          return true;
        }
      } catch (e) {}
      return false;
    }
  }, [isScreenSharing]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggleMinimize = useCallback(() => setIsMinimized(prev => !prev), []);
  const togglePictureInPicture = useCallback(() => setIsPictureInPicture(prev => !prev), []);
  const swapVideos = useCallback(() => setShowLocalInPiP(prev => !prev), []);
  const restoreCall = useCallback(() => {
    setIsMinimized(false);
    setIsPictureInPicture(false);
    window.focus();
  }, []);

  const isInCall = callState !== null && 
    ['calling', 'ringing', 'connecting', 'connected'].includes(callState.status);

  const contextValue = useMemo(() => ({
    callState, isInCall, callDuration, isFullscreen, isMinimized, isPictureInPicture, showLocalInPiP,
    localStream, remoteStream, isMuted, isVideoOff, isScreenSharing,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleVideo, toggleScreenShare,
    toggleFullscreen, toggleMinimize, togglePictureInPicture, swapVideos, restoreCall,
  }), [
    callState, isInCall, callDuration, isFullscreen, isMinimized, isPictureInPicture, showLocalInPiP,
    localStream, remoteStream, isMuted, isVideoOff, isScreenSharing,
    startCall, answerCall, rejectCall, endCall, toggleMute, toggleVideo, toggleScreenShare,
    toggleFullscreen, toggleMinimize, togglePictureInPicture, swapVideos, restoreCall,
  ]);

  return (
    <CallContext.Provider value={contextValue}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
}

export default CallProvider;
