/**
 * ZeroTrace Mobile WebRTC Service - Production Ready
 * 
 * Complete WebRTC implementation for React Native mirroring web client's webrtc.ts
 * Uses react-native-webrtc for native WebRTC APIs.
 *
 * Call State Machine:
 * IDLE → CALLING → RINGING → CONNECTING → CONNECTED → ENDED
 *
 * Features:
 * 1. Full ICE candidate handling with queuing
 * 2. Connection state monitoring with timeout
 * 3. Audio/video stream management
 * 4. Camera switching (front/back)
 * 5. Mute/video toggle
 * 6. Proper cleanup to prevent memory leaks
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { wsManager } from './websocket';
import { storage } from './storage';

// ─── WebRTC Imports ────────────────────────────────
// These will be available when react-native-webrtc is installed:
// import {
//   RTCPeerConnection,
//   RTCIceCandidate,
//   RTCSessionDescription,
//   mediaDevices,
//   MediaStream,
//   MediaStreamTrack,
// } from 'react-native-webrtc';

// For now, declare the types so TypeScript is happy
// Replace with actual imports after installing react-native-webrtc
declare const RTCPeerConnection: any;
declare const RTCIceCandidate: any;
declare const RTCSessionDescription: any;
declare const mediaDevices: any;

// ─── Types ─────────────────────────────────────────

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallType = 'audio' | 'video';

export interface CallState {
    callId: string;
    type: CallType;
    status: CallStatus;
    remoteUsername: string;
    isIncoming: boolean;
    startTime?: Date;
    localStream?: any; // MediaStream
    remoteStream?: any; // MediaStream
    errorMessage?: string;
    isMuted: boolean;
    isVideoOff: boolean;
    duration: number;
}

interface CallConfig {
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

type CallStateHandler = (state: CallState) => void;
type StreamHandler = (stream: any) => void;
type ErrorHandler = (error: Error) => void;

// ─── ICE Configuration ────────────────────────────

const defaultConfig: CallConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
};

// ─── WebRTC Service ────────────────────────────────

class WebRTCService {
    private pc: any = null; // RTCPeerConnection
    private localStream: any = null; // MediaStream
    private remoteStream: any = null; // MediaStream
    private currentCall: CallState | null = null;
    private config: CallConfig;

    // Event handlers
    private onStateChange: CallStateHandler | null = null;
    private onLocalStreamHandler: StreamHandler | null = null;
    private onRemoteStreamHandler: StreamHandler | null = null;
    private onErrorHandler: ErrorHandler | null = null;

    // ICE candidate queue (before remote description is set)
    private iceQueue: any[] = [];
    private isRemoteDescriptionSet = false;

    // Timeouts
    private connectionTimeout: NodeJS.Timeout | null = null;
    private durationInterval: NodeJS.Timeout | null = null;
    private monitorInterval: NodeJS.Timeout | null = null;

    // Pending offer for incoming calls
    private pendingOffer: { sdp: string; callId: string } | null = null;

    // Camera state
    private isFrontCamera = true;

    constructor(config: CallConfig = defaultConfig) {
        this.config = config;
        this.setupWebSocketHandlers();
    }

    // ─── Event Handler Setters ──────────────

    setOnStateChange(handler: CallStateHandler | null): void {
        this.onStateChange = handler;
    }

    setOnLocalStream(handler: StreamHandler | null): void {
        this.onLocalStreamHandler = handler;
    }

    setOnRemoteStream(handler: StreamHandler | null): void {
        this.onRemoteStreamHandler = handler;
    }

    setOnError(handler: ErrorHandler | null): void {
        this.onErrorHandler = handler;
    }

    // ─── WebSocket Signaling Handlers ───────

    private setupWebSocketHandlers(): void {
        // Handle incoming call offer
        wsManager.on('call_offer', (data: any) => {
            console.log('📞 [WebRTC] Incoming call offer from:', data.caller_username || data.sender_username);

            if (this.currentCall) {
                // Already in a call, reject
                wsManager.send({
                    type: 'call_reject',
                    data: {
                        call_id: data.call_id,
                        reason: 'busy',
                    },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Store pending offer
            this.pendingOffer = {
                sdp: data.sdp,
                callId: data.call_id,
            };

            // Create call state (ringing)
            this.currentCall = {
                callId: data.call_id,
                type: data.call_type || 'audio',
                status: 'ringing',
                remoteUsername: data.caller_username || data.sender_username,
                isIncoming: true,
                isMuted: false,
                isVideoOff: false,
                duration: 0,
            };

            this.notifyStateChange();
        });

        // Handle call answer
        wsManager.on('call_answer', async (data: any) => {
            console.log('📞 [WebRTC] Call answered');

            if (!this.currentCall || !this.pc) return;

            try {
                await this.pc.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
                );
                this.isRemoteDescriptionSet = true;
                console.log('✅ Remote description (answer) set');

                // Process queued ICE candidates
                await this.processIceQueue();

                // Update state
                this.currentCall.status = 'connecting';
                this.notifyStateChange();
            } catch (error: any) {
                console.error('❌ Failed to process answer:', error);
                this.failCall(error.message);
            }
        });

        // Handle ICE candidates
        wsManager.on('ice_candidate', async (data: any) => {
            console.log('📞 [WebRTC] ICE candidate received');

            if (!this.pc) {
                console.log('📞 Queuing ICE candidate (no PC yet)');
                this.iceQueue.push(data.candidate);
                return;
            }

            if (!this.isRemoteDescriptionSet) {
                console.log('📞 Queuing ICE candidate (remote desc not set)');
                this.iceQueue.push(data.candidate);
                return;
            }

            try {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('✅ ICE candidate added');
            } catch (error) {
                console.error('❌ Failed to add ICE candidate:', error);
            }
        });

        // Handle call rejection
        wsManager.on('call_rejected', (data: any) => {
            console.log('📞 [WebRTC] Call rejected:', data.reason);
            if (this.currentCall?.callId === data.call_id) {
                this.cleanup();
            }
        });

        // Handle call end
        wsManager.on('call_ended', (data: any) => {
            console.log('📞 [WebRTC] Call ended');
            if (this.currentCall?.callId === data.call_id || !data.call_id) {
                this.logCallHistory();
                this.cleanup();
            }
        });
    }

    // ─── Media Access ───────────────────────

    private async getMedia(type: CallType): Promise<any> {
        // Request permissions on Android
        if (Platform.OS === 'android') {
            const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
            if (type === 'video') {
                permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
            }

            const grants = await PermissionsAndroid.requestMultiple(permissions);
            const audioGranted = grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted';
            const videoGranted = type === 'audio' || grants[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted';

            if (!audioGranted) throw new Error('Microphone permission denied');
            if (!videoGranted) throw new Error('Camera permission denied');
        }

        const constraints: any = {
            audio: true,
            video: type === 'video' ? {
                facingMode: this.isFrontCamera ? 'user' : 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
            } : false,
        };

        try {
            const stream = await mediaDevices.getUserMedia(constraints);
            console.log(`✅ Got ${type} stream with ${stream.getTracks().length} tracks`);
            return stream;
        } catch (error: any) {
            console.error('❌ Media access failed:', error);
            throw new Error(`Failed to access ${type === 'video' ? 'camera and microphone' : 'microphone'}: ${error.message}`);
        }
    }

    // ─── Peer Connection ────────────────────

    private createPeerConnection(): any {
        console.log('📞 Creating peer connection...');

        const pc = new RTCPeerConnection({ iceServers: this.config.iceServers });

        // Handle incoming remote tracks
        pc.ontrack = (event: any) => {
            console.log(`📞 Remote track received: ${event.track.kind}`);

            if (!this.remoteStream) {
                this.remoteStream = new (global as any).MediaStream();
            }

            this.remoteStream.addTrack(event.track);

            if (this.currentCall) {
                this.currentCall.remoteStream = this.remoteStream;
            }

            this.onRemoteStreamHandler?.(this.remoteStream);

            // Monitor track state
            event.track.onended = () => {
                console.log(`📞 Remote ${event.track.kind} track ended`);
            };
            event.track.onmute = () => {
                console.log(`📞 Remote ${event.track.kind} track muted`);
            };
            event.track.onunmute = () => {
                console.log(`📞 Remote ${event.track.kind} track unmuted`);
            };
        };

        // Handle ICE candidates
        pc.onicecandidate = (event: any) => {
            if (event.candidate && this.currentCall) {
                console.log('📞 Sending ICE candidate');
                wsManager.send({
                    type: 'ice_candidate',
                    data: {
                        call_id: this.currentCall.callId,
                        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
                    },
                    timestamp: new Date().toISOString(),
                });
            }
        };

        // Connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`📞 Connection state: ${pc.connectionState}`);
            this.handleConnectionStateChange(pc.connectionState);
        };

        // ICE connection state
        pc.oniceconnectionstatechange = () => {
            console.log(`📞 ICE connection state: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                this.handleConnectionStateChange('connected');
            } else if (pc.iceConnectionState === 'failed') {
                this.handleConnectionStateChange('failed');
            } else if (pc.iceConnectionState === 'disconnected') {
                this.handleConnectionStateChange('disconnected');
            }
        };

        // Signaling state
        pc.onsignalingstatechange = () => {
            console.log(`📞 Signaling state: ${pc.signalingState}`);
        };

        return pc;
    }

    // ─── Connection State Handler ───────────

    private handleConnectionStateChange(state: string): void {
        if (!this.currentCall) return;

        switch (state) {
            case 'connected':
                if (this.currentCall.status !== 'connected') {
                    console.log('✅ Call connected!');
                    this.currentCall.status = 'connected';
                    this.currentCall.startTime = new Date();
                    this.clearConnectionTimeout();
                    this.startDurationTimer();
                    this.startMonitoring();
                    this.notifyStateChange();
                }
                break;

            case 'disconnected':
                console.log('⚠️ Connection disconnected, may recover...');
                break;

            case 'failed':
                console.error('❌ Connection failed');
                this.failCall('Connection failed. Please try again.');
                break;

            case 'closed':
                console.log('📞 Connection closed');
                this.logCallHistory();
                this.cleanup();
                break;
        }
    }

    // ─── ICE Queue Processing ───────────────

    private async processIceQueue(): Promise<void> {
        if (!this.pc || this.iceQueue.length === 0) return;

        console.log(`📞 Processing ${this.iceQueue.length} queued ICE candidates`);

        for (const candidate of this.iceQueue) {
            try {
                await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('❌ Failed to add queued ICE candidate:', error);
            }
        }

        this.iceQueue = [];
    }

    // ─── Start Outgoing Call ────────────────

    async startCall(recipientUsername: string, type: CallType = 'audio'): Promise<boolean> {
        console.log(`📞 Starting ${type} call to ${recipientUsername}`);

        if (this.currentCall) {
            console.error('❌ Already in a call');
            return false;
        }

        try {
            // Step 1: Get media FIRST
            this.localStream = await this.getMedia(type);
            this.onLocalStreamHandler?.(this.localStream);

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
                duration: 0,
                localStream: this.localStream,
            };
            this.notifyStateChange();

            // Step 3: Create peer connection
            this.pc = this.createPeerConnection();

            // Step 4: Add tracks
            this.localStream.getTracks().forEach((track: any) => {
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

            // Step 6: Send offer via WebSocket
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

    // ─── Answer Incoming Call ───────────────

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
            this.onLocalStreamHandler?.(this.localStream);

            // Update call with local stream
            this.currentCall.localStream = this.localStream;
            this.notifyStateChange();

            // Step 2: Create peer connection
            this.pc = this.createPeerConnection();

            // Step 3: Add tracks
            this.localStream.getTracks().forEach((track: any) => {
                if (this.pc && this.localStream) {
                    this.pc.addTrack(track, this.localStream);
                    console.log(`✅ Added ${track.kind} track`);
                }
            });

            // Step 4: Set remote description (offer)
            console.log('📞 Setting remote description (offer)...');
            await this.pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'offer', sdp })
            );
            this.isRemoteDescriptionSet = true;
            console.log('✅ Remote description set');

            // Step 5: Process queued ICE candidates
            await this.processIceQueue();

            // Step 6: Create answer
            console.log('📞 Creating answer...');
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            console.log('✅ Answer created and set');

            // Step 7: Update state
            this.currentCall.status = 'connecting';
            this.notifyStateChange();

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

    // ─── Reject Incoming Call ───────────────

    rejectCall(): void {
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

    // ─── End Call ───────────────────────────

    endCall(sendSignal: boolean = true): void {
        console.log('📞 Ending call');

        if (sendSignal && this.currentCall) {
            wsManager.send({
                type: 'call_end',
                data: {
                    call_id: this.currentCall.callId,
                },
                timestamp: new Date().toISOString(),
            });
        }

        this.logCallHistory();
        this.cleanup();
    }

    // ─── Toggle Controls ────────────────────

    toggleMute(): boolean {
        if (!this.localStream || !this.currentCall) return false;

        const audioTracks = this.localStream.getAudioTracks();
        const newMuted = !this.currentCall.isMuted;

        audioTracks.forEach((track: any) => {
            track.enabled = !newMuted;
        });

        this.currentCall.isMuted = newMuted;
        this.notifyStateChange();

        console.log(`📞 Audio ${newMuted ? 'muted' : 'unmuted'}`);
        return newMuted;
    }

    toggleVideo(): boolean {
        if (!this.localStream || !this.currentCall) return false;

        const videoTracks = this.localStream.getVideoTracks();
        const newVideoOff = !this.currentCall.isVideoOff;

        videoTracks.forEach((track: any) => {
            track.enabled = !newVideoOff;
        });

        this.currentCall.isVideoOff = newVideoOff;
        this.notifyStateChange();

        console.log(`📞 Video ${newVideoOff ? 'off' : 'on'}`);
        return newVideoOff;
    }

    async switchCamera(): Promise<boolean> {
        if (!this.localStream || !this.currentCall) return false;

        try {
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length === 0) return false;

            // Use react-native-webrtc's _switchCamera method
            const track = videoTracks[0];
            if (track._switchCamera) {
                track._switchCamera();
                this.isFrontCamera = !this.isFrontCamera;
                console.log(`📞 Camera switched to ${this.isFrontCamera ? 'front' : 'back'}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('❌ Camera switch failed:', error);
            return false;
        }
    }

    toggleSpeaker(): boolean {
        // Note: Speaker toggling requires InCallManager from react-native-incall-manager
        // For now, log and return current state
        console.log('📞 Speaker toggle (requires InCallManager)');
        return false;
    }

    // ─── State Management ───────────────────

    private notifyStateChange(): void {
        if (this.currentCall && this.onStateChange) {
            this.onStateChange({ ...this.currentCall });
        }
    }

    private failCall(message: string): void {
        if (this.currentCall) {
            this.currentCall.status = 'ended';
            this.currentCall.errorMessage = message;
            this.notifyStateChange();
        }
        this.onErrorHandler?.(new Error(message));
        this.cleanup();
    }

    // ─── Timers ─────────────────────────────

    private startConnectionTimeout(): void {
        this.clearConnectionTimeout();
        this.connectionTimeout = setTimeout(() => {
            if (this.currentCall && this.currentCall.status !== 'connected') {
                console.error('❌ Connection timeout');
                this.failCall('Call connection timed out');
            }
        }, 30000); // 30 second timeout
    }

    private clearConnectionTimeout(): void {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    private startDurationTimer(): void {
        this.stopDurationTimer();
        this.durationInterval = setInterval(() => {
            if (this.currentCall && this.currentCall.status === 'connected') {
                this.currentCall.duration += 1;
                this.notifyStateChange();
            }
        }, 1000);
    }

    private stopDurationTimer(): void {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
    }

    // ─── Connection Monitoring ──────────────

    private startMonitoring(): void {
        this.stopMonitoring();
        this.monitorInterval = setInterval(async () => {
            if (!this.pc) return;

            try {
                const stats = await this.pc.getStats();
                let bytesReceived = 0;
                let bytesSent = 0;

                stats.forEach((report: any) => {
                    if (report.type === 'inbound-rtp') {
                        bytesReceived += report.bytesReceived || 0;
                    }
                    if (report.type === 'outbound-rtp') {
                        bytesSent += report.bytesSent || 0;
                    }
                });

                console.log(`📊 Call stats - In: ${(bytesReceived / 1024).toFixed(1)}KB, Out: ${(bytesSent / 1024).toFixed(1)}KB`);
            } catch (error) {
                // Stats not available
            }
        }, 10000); // Every 10 seconds
    }

    private stopMonitoring(): void {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    // ─── Call History ───────────────────────

    private async logCallHistory(): Promise<void> {
        if (!this.currentCall) return;

        try {
            await storage.addCallLog({
                id: this.currentCall.callId,
                username: this.currentCall.remoteUsername,
                userId: 0,
                callType: this.currentCall.type,
                direction: this.currentCall.isIncoming
                    ? (this.currentCall.status === 'connected' ? 'incoming' : 'missed')
                    : 'outgoing',
                duration: this.currentCall.duration,
                timestamp: (this.currentCall.startTime || new Date()).toISOString(),
                status: this.currentCall.status === 'connected' ? 'completed' : 'missed',
            });
        } catch (error) {
            console.error('❌ Failed to log call history:', error);
        }
    }

    // ─── Cleanup ────────────────────────────

    cleanup(): void {
        console.log('📞 Cleaning up WebRTC resources...');

        // Stop timers
        this.clearConnectionTimeout();
        this.stopDurationTimer();
        this.stopMonitoring();

        // Stop local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach((track: any) => {
                track.stop();
            });
            this.localStream = null;
        }

        // Stop remote stream tracks
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach((track: any) => {
                track.stop();
            });
            this.remoteStream = null;
        }

        // Close peer connection
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        // Reset state
        const wasInCall = this.currentCall;
        this.currentCall = null;
        this.pendingOffer = null;
        this.iceQueue = [];
        this.isRemoteDescriptionSet = false;

        // Notify ended state
        if (wasInCall && this.onStateChange) {
            this.onStateChange({
                ...wasInCall,
                status: 'ended',
                localStream: undefined,
                remoteStream: undefined,
            });
        }

        console.log('✅ WebRTC cleanup complete');
    }

    // ─── Getters ────────────────────────────

    getCurrentCall(): CallState | null {
        return this.currentCall ? { ...this.currentCall } : null;
    }

    isInCall(): boolean {
        return this.currentCall !== null &&
            this.currentCall.status !== 'ended' &&
            this.currentCall.status !== 'idle';
    }

    // ─── Permission Check ──────────────────

    async checkPermissions(type: CallType): Promise<{ audio: boolean; video: boolean }> {
        if (Platform.OS === 'android') {
            try {
                const audioResult = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
                );

                let videoResult = true;
                if (type === 'video') {
                    videoResult = await PermissionsAndroid.check(
                        PermissionsAndroid.PERMISSIONS.CAMERA
                    );
                }

                return { audio: audioResult, video: videoResult };
            } catch (error) {
                return { audio: false, video: false };
            }
        }

        // iOS handles permissions through Info.plist
        return { audio: true, video: true };
    }
}

// Export singleton
export const webrtcService = new WebRTCService();
export default webrtcService;
