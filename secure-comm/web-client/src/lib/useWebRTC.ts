/**
 * React Hook for WebRTC Integration
 * Handles state synchronization and UI updates
 */

import { useState, useEffect, useCallback } from 'react';
import { webrtcService, CallState, CallType } from './webrtc';

interface UseWebRTCReturn {
  // State
  callState: CallState | null;
  isInCall: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  
  // Streams (for direct video element binding)
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  
  // Actions
  startCall: (recipient: string, type: CallType) => Promise<boolean>;
  answerCall: () => Promise<boolean>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => boolean;
  toggleVideo: () => boolean;
  
  // Error
  error: string | null;
  clearError: () => void;
}

export function useWebRTC(): UseWebRTCReturn {
  // Call state from service
  const [callState, setCallState] = useState<CallState | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Streams for video element binding
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  // Derived state
  const isInCall = callState !== null && 
    ['calling', 'ringing', 'connecting', 'connected'].includes(callState.status);
  
  const isMuted = callState?.isMuted ?? false;
  const isVideoOff = callState?.isVideoOff ?? false;
  
  // Calculate call duration
  const [callDuration, setCallDuration] = useState(0);
  
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (callState?.status === 'connected' && callState.startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const start = new Date(callState.startTime!);
        setCallDuration(Math.floor((now.getTime() - start.getTime()) / 1000));
      }, 1000);
    } else {
      setCallDuration(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState?.status, callState?.startTime]);
  
  // Subscribe to service events
  useEffect(() => {
    console.log('🔧 Setting up WebRTC hooks');
    
    // State change handler
    webrtcService.setOnStateChange((state) => {
      console.log('📞 Call state update:', state.status);
      setCallState({ ...state });
      
      // Clear error on successful state
      if (state.status === 'connected') {
        setError(null);
      }
    });
    
    // Local stream handler
    webrtcService.setOnLocalStream((stream) => {
      console.log('📹 Local stream received:', stream.id);
      setLocalStream(stream);
    });
    
    // Remote stream handler
    webrtcService.setOnRemoteStream((stream) => {
      console.log('📹 Remote stream received:', stream.id);
      setRemoteStream(stream);
    });
    
    // Error handler
    webrtcService.setOnError((err) => {
      console.error('💥 WebRTC error:', err);
      setError(err);
    });
    
    return () => {
      console.log('🔧 Cleaning up WebRTC hooks');
      webrtcService.setOnStateChange(null);
      webrtcService.setOnLocalStream(null);
      webrtcService.setOnRemoteStream(null);
      webrtcService.setOnError(null);
    };
  }, []);
  
  // Actions
  const startCall = useCallback(async (recipient: string, type: CallType): Promise<boolean> => {
    setError(null);
    return webrtcService.startCall(recipient, type);
  }, []);
  
  const answerCall = useCallback(async (): Promise<boolean> => {
    setError(null);
    return webrtcService.answerCall();
  }, []);
  
  const rejectCall = useCallback(() => {
    webrtcService.rejectCall();
  }, []);
  
  const endCall = useCallback(() => {
    webrtcService.endCall();
  }, []);
  
  const toggleMute = useCallback((): boolean => {
    return webrtcService.toggleMute();
  }, []);
  
  const toggleVideo = useCallback((): boolean => {
    return webrtcService.toggleVideo();
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return {
    callState,
    isInCall,
    isMuted,
    isVideoOff,
    callDuration,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    error,
    clearError,
  };
}
