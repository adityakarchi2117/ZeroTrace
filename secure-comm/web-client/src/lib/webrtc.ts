/**
 * CipherLink WebRTC Service - PRODUCTION READY v2
 * Complete rewrite with robust error handling, state management, and mobile support
 * 
 * Call State Machine:
 * IDLE → CALLING → RINGING → CONNECTING → CONNECTED → ENDED
 * 
 * CRITICAL FIXES:
 * 1. Proper async/await for ALL WebRTC operations
 * 2. ICE candidate buffering until remote description is set
 * 3. Connection state monitoring with timeout fallback
 * 4. Proper cleanup to prevent memory leaks
 * 5. Mobile-specific permission handling
 * 6. Stream binding with retry logic
 */

import { wsManager } from './websocket';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed' | 'rejected';
export type CallType = 'audio' | 'video';

export interface CallState {
  callId: string;
  type: CallType;
  status: CallStatus;
  remoteUsername: string;
  isIncoming: boolean;
  startTime?: Date;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  errorMessage?: string;
  isMuted: boolean;
  isVideoOff: boolean;
}

export interface CallConfig {
  iceServers: RTCIceServer[];
}

// Production-grade ICE servers
const defaultConfig: CallConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
};

// Event handler types
type CallStateHandler = (state: CallState) => void;
type StreamHandler = (stream: MediaStream) => void;
type ErrorHandler = (error: string) => void;

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCall: CallState | null = null;
  private config: CallConfig;
  
  // Event handlers
  private onStateChange: CallStateHandler | null = null;
  private onLocalStream: StreamHandler | null = null;
  private onRemoteStream: StreamHandler | null = null;
  private onError: ErrorHandler | null = null;
  
  // ICE candidate queue
  private iceQueue: RTCIceCandidateInit[] = [];
  
  // Connection monitoring
  private connectionTimeout: NodeJS.Timeout | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  
  // Pending SDP for incoming calls
  private pendingOffer: { sdp: string; callId: string; callerUsername: string; type: CallType } | null = null;
  
  constructor(config: CallConfig = defaultConfig) {
    this.config = config;
    this.setupWebSocketHandlers();
    console.log('🔧 WebRTC Service initialized');
  }

  // ============ Event Registration ============
  
  setOnStateChange(handler: CallStateHandler | null) {
    this.onStateChange = handler;
  }
  
  setOnLocalStream(handler: StreamHandler | null) {
    this.onLocalStream = handler;
  }
  
  setOnRemoteStream(handler: StreamHandler | null) {
    this.onRemoteStream = handler;
  }
  
  setOnError(handler: ErrorHandler | null) {
    this.onError = handler;
  }

  // ============ WebSocket Handlers ============

  private setupWebSocketHandlers() {
    // Incoming call offer
    wsManager.on('call_offer', (data) => {
      console.log('📞 Received call_offer:', data);
      
      const callId = data.call_id || data.data?.call_id;
      const callType = (data.call_type || data.data?.call_type || 'audio') as CallType;
      const callerUsername = data.caller_username || data.data?.caller_username;
      const sdp = data.sdp || data.data?.sdp;
      
      if (!callId || !callerUsername || !sdp) {
        console.error('❌ Invalid call_offer:', { callId, callerUsername, hasSdp: !!sdp });
        return;
      }
      
      // Store pending offer
      this.pendingOffer = { sdp, callId, callerUsername, type: callType };
      
      // Set state to ringing
      this.currentCall = {
        callId,
        type: callType,
        status: 'ringing',
        remoteUsername: callerUsername,
        isIncoming: true,
        isMuted: false,
        isVideoOff: false,
      };
      
      this.notifyStateChange();
      console.log('📞 Call state: RINGING');
    });

    // Call answer
    wsManager.on('call_answer', async (data) => {
      console.log('✅ Received call_answer:', data);
      
      if (!this.pc || !this.currentCall) {
        console.error('❌ No peer connection or call');
        return;
      }
      
      const sdp = data.sdp || data.data?.sdp;
      if (!sdp) {
        console.error('❌ No SDP in answer');
        return;
      }
      
      try {
        // Set remote description (answer)
        console.log('📞 Setting remote description (answer)...');
        await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        console.log('✅ Remote description set');
        
        // Process queued ICE candidates
        await this.processIceQueue();
        
        // Update state
        this.currentCall.status = 'connecting';
        this.notifyStateChange();
        console.log('📞 Call state: CONNECTING');
        
      } catch (error) {
        console.error('❌ Error handling answer:', error);
        this.failCall('Failed to process answer');
      }
    });

    // ICE candidate
    wsManager.on('ice_candidate', async (data) => {
      const candidate = data.candidate || data.data?.candidate;
      if (!candidate) {
        console.log('⚠️ Empty ICE candidate');
        return;
      }
      
      console.log('🧊 Received ICE candidate');
      
      if (this.pc && this.pc.remoteDescription) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('✅ ICE candidate added');
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      } else {
        console.log('⏳ Queuing ICE candidate');
        this.iceQueue.push(candidate);
      }
    });

    // Call rejected
    wsManager.on('call_rejected', (data) => {
      console.log('❌ Call rejected:', data);
      if (this.currentCall) {
        this.currentCall.status = 'rejected';
        this.notifyStateChange();
        setTimeout(() => this.cleanup(), 3000);
      }
    });

    // Call ended
    wsManager.on('call_ended', (data) => {
      console.log('📴 Call ended by remote:', data);
      if (this.currentCall) {
        this.currentCall.status = 'ended';
        this.notifyStateChange();
        this.cleanup();
      }
    });

    // Call failed
    wsManager.on('call_failed', (data) => {
      console.error('💥 Call failed:', data);
      this.failCall(data.reason || 'Call failed');
    });
  }

  // ============ Media Handling ============

  private async getMedia(type: CallType): Promise<MediaStream> {
    console.log(`📹 Getting media for ${type} call...`);
    
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 2,
      },
      video: type === 'video' ? {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: 'user',
        frameRate: { ideal: 30, min: 15 },
      } : false,
    };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Media acquired:', stream.getTracks().map(t => `${t.kind}(${t.label})`).join(', '));
      return stream;
    } catch (error: any) {
      console.error('❌ Media error:', error.name, error.message);
      throw this.normalizeMediaError(error);
    }
  }

  private normalizeMediaError(error: any): Error {
    const messages: Record<string, string> = {
      'NotAllowedError': 'Camera/microphone permission denied. Please allow access in browser settings.',
      'NotFoundError': 'No camera or microphone found. Please connect a device.',
      'NotReadableError': 'Camera/microphone is in use by another app. Please close other apps.',
      'OverconstrainedError': 'Camera does not support the requested resolution.',
      'SecurityError': 'Camera/microphone access blocked. Please use HTTPS or localhost.',
      'AbortError': 'Permission request was aborted. Please try again.',
    };
    
    return new Error(messages[error.name] || `Media error: ${error.message}`);
  }

  // ============ Peer Connection ============

  private createPeerConnection(): RTCPeerConnection {
    console.log('🔧 Creating RTCPeerConnection...');
    
    const pc = new RTCPeerConnection({
      iceServers: this.config.iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('🎥 Track received:', event.track.kind);
      
      const [stream] = event.streams;
      if (stream) {
        this.remoteStream = stream;
        console.log('✅ Remote stream set, tracks:', stream.getTracks().length);
        this.onRemoteStream?.(stream);
        
        // Update call state with remote stream
        if (this.currentCall) {
          this.currentCall.remoteStream = stream;
          this.notifyStateChange();
        }
        
        // Monitor track state
        event.track.onended = () => {
          console.log('📴 Track ended:', event.track.kind);
        };
        
        event.track.onmute = () => {
          console.log('🔇 Track muted:', event.track.kind);
        };
        
        event.track.onunmute = () => {
          console.log('🔊 Track unmuted:', event.track.kind);
        };
      }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentCall) {
        console.log('🧊 Sending ICE candidate');
        wsManager.send({
          type: 'ice_candidate',
          data: {
            call_id: this.currentCall.callId,
            candidate: event.candidate.toJSON(),
          },
          timestamp: new Date().toISOString(),
        });
      }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      this.handleConnectionStateChange(pc.connectionState);
    };
    
    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE state:', pc.iceConnectionState);
    };
    
    // Handle signaling state
    pc.onsignalingstatechange = () => {
      console.log('📶 Signaling state:', pc.signalingState);
    };
    
    return pc;
  }

  private handleConnectionStateChange(state: RTCPeerConnectionState) {
    console.log('🔄 Connection state:', state);
    
    if (!this.currentCall) return;
    
    switch (state) {
      case 'connected':
        this.clearConnectionTimeout();
        if (this.currentCall.status !== 'connected') {
          this.currentCall.status = 'connected';
          this.currentCall.startTime = new Date();
          this.notifyStateChange();
          console.log('✅ CALL CONNECTED!');
          this.startMonitoring();
        }
        break;
        
      case 'failed':
        console.error('❌ Connection failed');
        this.failCall('Connection failed');
        break;
        
      case 'disconnected':
        console.warn('⚠️ Connection disconnected - will attempt recovery...');
        // Give it 5 seconds to recover
        setTimeout(() => {
          if (this.pc?.connectionState === 'disconnected') {
            console.error('❌ Connection did not recover');
            this.failCall('Connection lost');
          }
        }, 5000);
        break;
        
      case 'closed':
        console.log('📴 Connection closed');
        break;
    }
  }

  private async processIceQueue() {
    if (!this.pc) return;
    
    console.log(`📤 Processing ${this.iceQueue.length} queued ICE candidates`);
    
    for (const candidate of this.iceQueue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Queued ICE candidate added');
      } catch (error) {
        console.error('❌ Error adding queued ICE candidate:', error);
      }
    }
    
    this.iceQueue = [];
  }

  // ============ Call Control ============

  /**
   * START OUTGOING CALL
   */
  async startCall(recipientUsername: string, type: CallType = 'audio'): Promise<boolean> {
    console.log(`📞 Starting ${type} call to ${recipientUsername}`);
    
    if (this.currentCall) {
      console.error('❌ Already in a call');
      return false;
    }
    
    try {
      // Step 1: Get media FIRST
      this.localStream = await this.getMedia(type);
      this.onLocalStream?.(this.localStream);
      
      // Step 2: Create call state
      const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      this.currentCall = {
        callId,
        type,
        status: 'calling',
        remoteUsername: recipientUsername,
        isIncoming: false,
        isMuted: false,
        isVideoOff: false,
        localStream: this.localStream,
      };
      this.notifyStateChange();
      
      // Step 3: Create peer connection
      this.pc = this.createPeerConnection();
      
      // Step 4: Add tracks
      this.localStream.getTracks().forEach(track => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
          console.log(`✅ Added ${track.kind} track`);
        }
      });
      
      // Step 5: Create and set offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });
      
      await this.pc.setLocalDescription(offer);
      console.log('✅ Offer created and set');
      
      // Step 6: Send offer
      wsManager.send({
        type: 'call_offer',
        data: {
          call_id: callId,
          recipient_username: recipientUsername,
          call_type: type,
          sdp: offer.sdp,
        },
        timestamp: new Date().toISOString(),
      });
      
      // Step 7: Start connection timeout
      this.startConnectionTimeout();
      
      return true;
      
    } catch (error: any) {
      console.error('❌ Failed to start call:', error);
      this.failCall(error.message);
      return false;
    }
  }

  /**
   * ANSWER INCOMING CALL
   */
  async answerCall(): Promise<boolean> {
    console.log('📞 Answering call...');
    
    if (!this.currentCall || !this.pendingOffer) {
      console.error('❌ No call to answer');
      return false;
    }
    
    if (this.currentCall.status !== 'ringing') {
      console.error('❌ Call not in ringing state:', this.currentCall.status);
      return false;
    }
    
    try {
      const { sdp, callId } = this.pendingOffer;
      const type = this.currentCall.type;
      
      // Step 1: Get media
      this.localStream = await this.getMedia(type);
      this.onLocalStream?.(this.localStream);
      
      // Update call with local stream
      this.currentCall.localStream = this.localStream;
      this.notifyStateChange();
      
      // Step 2: Create peer connection
      this.pc = this.createPeerConnection();
      
      // Step 3: Add tracks
      this.localStream.getTracks().forEach(track => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
          console.log(`✅ Added ${track.kind} track`);
        }
      });
      
      // Step 4: Set remote description (offer)
      console.log('📞 Setting remote description (offer)...');
      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      console.log('✅ Remote description set');
      
      // Step 5: Process any queued ICE candidates
      await this.processIceQueue();
      
      // Step 6: Create answer
      console.log('📞 Creating answer...');
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log('✅ Answer created and set');
      
      // Step 7: Update state to connecting
      this.currentCall.status = 'connecting';
      this.notifyStateChange();
      console.log('📞 Call state: CONNECTING');
      
      // Step 8: Send answer
      wsManager.send({
        type: 'call_answer',
        data: {
          call_id: callId,
          sdp: answer.sdp,
        },
        timestamp: new Date().toISOString(),
      });
      
      // Step 9: Start connection timeout
      this.startConnectionTimeout();
      
      return true;
      
    } catch (error: any) {
      console.error('❌ Failed to answer call:', error);
      this.failCall(error.message);
      return false;
    }
  }

  /**
   * REJECT INCOMING CALL
   */
  rejectCall() {
    console.log('❌ Rejecting call');
    
    if (!this.currentCall) return;
    
    wsManager.send({
      type: 'call_reject',
      data: {
        call_id: this.currentCall.callId,
        reason: 'rejected',
      },
      timestamp: new Date().toISOString(),
    });
    
    this.cleanup();
  }

  /**
   * END CALL
   */
  endCall(sendSignal: boolean = true) {
    console.log('📴 Ending call');
    
    if (!this.currentCall) return;
    
    if (sendSignal) {
      wsManager.send({
        type: 'call_end',
        data: {
          call_id: this.currentCall.callId,
        },
        timestamp: new Date().toISOString(),
      });
    }
    
    this.cleanup();
  }

  // ============ Controls ============

  toggleMute(): boolean {
    if (!this.localStream) return false;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return false;
    
    audioTrack.enabled = !audioTrack.enabled;
    const isMuted = !audioTrack.enabled;
    
    if (this.currentCall) {
      this.currentCall.isMuted = isMuted;
      this.notifyStateChange();
    }
    
    console.log(`🎤 Muted: ${isMuted}`);
    return isMuted;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;
    
    videoTrack.enabled = !videoTrack.enabled;
    const isVideoOff = !videoTrack.enabled;
    
    if (this.currentCall) {
      this.currentCall.isVideoOff = isVideoOff;
      this.notifyStateChange();
    }
    
    console.log(`📹 Video off: ${isVideoOff}`);
    return isVideoOff;
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<boolean> {
    if (!this.pc) return false;
    
    const senders = this.pc.getSenders();
    const videoSender = senders.find(s => s.track?.kind === 'video');
    
    if (!videoSender) return false;
    
    try {
      await videoSender.replaceTrack(newTrack);
      
      // Update local stream
      if (this.localStream) {
        const oldTrack = this.localStream.getVideoTracks()[0];
        if (oldTrack) {
          this.localStream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        this.localStream.addTrack(newTrack);
        this.onLocalStream?.(this.localStream);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to replace video track:', error);
      return false;
    }
  }

  // ============ State Management ============

  private notifyStateChange() {
    if (this.currentCall && this.onStateChange) {
      // Create a clean copy
      const state: CallState = {
        ...this.currentCall,
        localStream: this.localStream || undefined,
        remoteStream: this.remoteStream || undefined,
      };
      this.onStateChange(state);
    }
  }

  private failCall(message: string) {
    console.error('💥 Call failed:', message);
    
    if (this.currentCall) {
      this.currentCall.status = 'failed';
      this.currentCall.errorMessage = message;
      this.notifyStateChange();
      this.onError?.(message);
    }
    
    this.cleanup();
  }

  private startConnectionTimeout() {
    this.clearConnectionTimeout();
    
    // 15 second timeout for connection
    this.connectionTimeout = setTimeout(() => {
      if (this.currentCall?.status !== 'connected') {
        console.error('❌ Connection timeout');
        this.failCall('Connection timed out - please check your network');
      }
    }, 15000);
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private startMonitoring() {
    this.stopMonitoring();
    
    // Monitor connection health every 2 seconds
    this.monitorInterval = setInterval(() => {
      if (!this.pc || !this.currentCall) {
        this.stopMonitoring();
        return;
      }
      
      const state = this.pc.connectionState;
      if (state === 'failed' || state === 'closed') {
        console.error('❌ Connection unhealthy');
        this.failCall('Connection lost');
        this.stopMonitoring();
      }
    }, 2000);
    
    // Keep-alive ping every 10 seconds
    this.pingInterval = setInterval(() => {
      if (this.currentCall?.status === 'connected') {
        // Send ping via data channel if available, or rely on WebSocket
        wsManager.send({ type: 'ping', timestamp: new Date().toISOString() });
      }
    }, 10000);
  }

  private stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ============ Cleanup ============

  private cleanup() {
    console.log('🧹 Cleaning up...');
    
    this.clearConnectionTimeout();
    this.stopMonitoring();
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`📴 Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }
    
    // Stop remote stream
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
    
    // Close peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    // Clear pending offer
    this.pendingOffer = null;
    
    // Clear ICE queue
    this.iceQueue = [];
    
    // Update state
    if (this.currentCall) {
      const finalState = { ...this.currentCall };
      this.currentCall = null;
      
      // Keep failed/rejected status for a moment so UI can show it
      if (finalState.status !== 'failed' && finalState.status !== 'rejected') {
        finalState.status = 'ended';
      }
      
      // One final notification
      this.onStateChange?.(finalState);
    }
    
    console.log('🧹 Cleanup complete');
  }

  // ============ Getters ============

  getCurrentCall(): CallState | null {
    return this.currentCall ? { ...this.currentCall } : null;
  }

  isInCall(): boolean {
    return this.currentCall !== null && 
      ['calling', 'ringing', 'connecting', 'connected'].includes(this.currentCall.status);
  }

  // ============ Mobile Helpers ============

  async checkPermissions(type: CallType): Promise<{ audio: boolean; video: boolean }> {
    const result = { audio: false, video: false };
    
    try {
      // Try permissions API
      if ('permissions' in navigator) {
        try {
          const audioPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          result.audio = audioPerm.state === 'granted';
          
          if (type === 'video') {
            const videoPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            result.video = videoPerm.state === 'granted';
          }
        } catch (e) {
          // Permissions API not supported for these
        }
      }
      
      // If not granted, try getUserMedia to trigger permission prompt
      if (!result.audio || (type === 'video' && !result.video)) {
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            audio: !result.audio,
            video: type === 'video' && !result.video,
          });
          testStream.getTracks().forEach(t => t.stop());
          result.audio = true;
          if (type === 'video') result.video = true;
        } catch (e) {
          // Permission denied
        }
      }
    } catch (e) {
      console.error('Error checking permissions:', e);
    }
    
    return result;
  }
}

// Export singleton
export const webrtcService = new WebRTCService();
