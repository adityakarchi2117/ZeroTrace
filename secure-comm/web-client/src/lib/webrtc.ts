/**
 * CipherLink WebRTC Service - Production Ready
 * Handles peer-to-peer audio/video calls with E2E encryption
 * 
 * Call State Machine:
 * IDLE → CALLING → RINGING → CONNECTING → CONNECTED → ENDED
 * 
 * Critical Fixes:
 * 1. Proper state machine with strict transitions
 * 2. Media acquisition BEFORE offer/answer
 * 3. Correct track attachment
 * 4. Remote stream handling via ontrack
 * 5. Connection state monitoring
 * 6. Proper mute/video controls
 * 7. Error handling and permissions
 */

import { wsManager } from './websocket';

export interface CallState {
    callId: string;
    type: 'audio' | 'video';
    status: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed' | 'rejected';
    remoteUsername: string;
    isIncoming: boolean;
    startTime?: Date;
    localStream?: MediaStream;
    remoteStream?: MediaStream;
    errorMessage?: string;
    isMuted?: boolean;
    isVideoOff?: boolean;
}

export interface CallConfig {
    iceServers: RTCIceServer[];
}

const defaultConfig: CallConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ]
};

type CallEventHandler = (state: CallState) => void;
type StreamEventHandler = (stream: MediaStream) => void;

class WebRTCService {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private currentCall: CallState | null = null;
    private config: CallConfig;

    // Event handlers
    private onCallStateChange: CallEventHandler | null = null;
    private onRemoteStream: StreamEventHandler | null = null;
    private onLocalStream: StreamEventHandler | null = null;

    // Pending ICE candidates
    private pendingIceCandidates: RTCIceCandidateInit[] = [];
    private pendingSdp: string | null = null;

    // Connection monitoring
    private connectionMonitorInterval: NodeJS.Timeout | null = null;

    constructor(config: CallConfig = defaultConfig) {
        this.config = config;
        this.setupWebSocketHandlers();
    }

    private setupWebSocketHandlers() {
        // Handle incoming call offer
        wsManager.on('call_offer', async (message) => {
            console.log('📞 Incoming call offer received:', message);

            const callId = message.call_id;
            const callType = message.call_type || 'audio';
            const callerUsername = message.caller_username;
            const sdp = message.sdp;

            if (!callId || !callerUsername) {
                console.error('Invalid call_offer message:', message);
                return;
            }

            // Store the SDP for when we answer
            this.pendingSdp = sdp;

            this.currentCall = {
                callId,
                type: callType,
                status: 'ringing',
                remoteUsername: callerUsername,
                isIncoming: true,
                isMuted: false,
                isVideoOff: false,
            };

            console.log('📞 Call state set to RINGING:', this.currentCall);
            this.notifyStateChange();
        });

        // Handle call answer
        wsManager.on('call_answer', async (data) => {
            console.log('✅ Call answer received:', data);

            if (!this.currentCall || !this.peerConnection) {
                console.error('No active call or peer connection');
                return;
            }

            try {
                // Set remote description (answer)
                await this.peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
                );
                console.log('✅ Remote description (answer) set');

                // Process pending ICE candidates
                await this.processPendingIceCandidates();

                // State transition: CALLING → CONNECTING
                this.currentCall.status = 'connecting';
                this.notifyStateChange();
                console.log('📞 State: CALLING → CONNECTING');

            } catch (error) {
                console.error('❌ Error handling call answer:', error);
                this.handleError('Failed to establish connection');
            }
        });

        // Handle call rejection
        wsManager.on('call_rejected', (data) => {
            console.log('❌ Call rejected:', data);
            this.handleError('Call was rejected');
        });

        // Handle call ended
        wsManager.on('call_ended', (data) => {
            console.log('📴 Call ended by remote:', data);
            this.endCall(false);
        });

        // Handle ICE candidates
        wsManager.on('ice_candidate', async (data) => {
            console.log('🧊 ICE candidate received');

            const candidate = data.candidate;
            if (!candidate) {
                console.log('⚠️ Empty ICE candidate received (end of candidates)');
                return;
            }

            if (this.peerConnection && this.peerConnection.remoteDescription) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('✅ ICE candidate added');
                } catch (error) {
                    console.error('❌ Error adding ICE candidate:', error);
                }
            } else {
                // Queue for later
                console.log('⏳ Queued ICE candidate');
                this.pendingIceCandidates.push(candidate);
            }
        });

        // Handle call failed
        wsManager.on('call_failed', (data) => {
            console.warn('💥 Call failed:', data);
            this.handleError(data.reason || 'Call failed');
        });
    }

    private async processPendingIceCandidates() {
        if (!this.peerConnection || !this.peerConnection.remoteDescription) return;

        for (const candidate of this.pendingIceCandidates) {
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding pending ICE candidate:', error);
            }
        }
        this.pendingIceCandidates = [];
    }

    private notifyStateChange() {
        if (this.onCallStateChange && this.currentCall) {
            // Create a deep copy to ensure React detects changes
            const stateCopy: CallState = {
                ...this.currentCall,
                localStream: this.currentCall.localStream,
                remoteStream: this.currentCall.remoteStream,
            };
            this.onCallStateChange(stateCopy);
        }
    }

    setOnCallStateChange(handler: CallEventHandler | null) {
        this.onCallStateChange = handler;
    }

    setOnRemoteStream(handler: StreamEventHandler | null) {
        this.onRemoteStream = handler;
    }

    setOnLocalStream(handler: StreamEventHandler | null) {
        this.onLocalStream = handler;
    }

    /**
     * START CALL - Caller side
     * State: IDLE → CALLING
     */
    async startCall(recipientUsername: string, type: 'audio' | 'video' = 'audio'): Promise<boolean> {
        try {
            console.log(`📞 START CALL: ${type} to ${recipientUsername}`);

            // Check if already in a call
            if (this.isInCall()) {
                console.error('Already in a call');
                return false;
            }

            const callId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Step 1: Get user media FIRST (before any WebRTC operations)
            console.log('📞 Step 1: Getting user media...');
            const constraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                } : false,
            };

            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err: any) {
                throw this.handleMediaError(err);
            }

            console.log('✅ Got user media:', this.localStream.getTracks().map(t => t.kind));

            // Notify UI about local stream
            this.onLocalStream?.(this.localStream);

            // Step 2: Set call state to CALLING
            this.currentCall = {
                callId,
                type,
                status: 'calling',
                remoteUsername: recipientUsername,
                isIncoming: false,
                localStream: this.localStream,
                isMuted: false,
                isVideoOff: false,
            };
            this.notifyStateChange();
            console.log('📞 State: IDLE → CALLING');

            // Step 3: Create peer connection
            console.log('📞 Step 3: Creating peer connection...');
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.config.iceServers,
                iceCandidatePoolSize: 10,
            });
            this.setupPeerConnectionHandlers();

            // Step 4: Add local tracks to peer connection
            console.log('📞 Step 4: Adding local tracks...');
            this.localStream.getTracks().forEach(track => {
                if (this.peerConnection && this.localStream) {
                    this.peerConnection.addTrack(track, this.localStream);
                    console.log(`✅ Added ${track.kind} track`);
                }
            });

            // Step 5: Create offer
            console.log('📞 Step 5: Creating offer...');
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video',
            });
            await this.peerConnection.setLocalDescription(offer);
            console.log('✅ Offer created and set as local description');

            // Step 6: Send offer via WebSocket
            console.log('📞 Step 6: Sending offer...');
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

            console.log('✅ Call started successfully');
            return true;

        } catch (error: any) {
            console.error('❌ Error starting call:', error);
            this.handleError(error.message || 'Failed to start call');
            return false;
        }
    }

    /**
     * ANSWER CALL - Receiver side
     * State: RINGING → CONNECTING
     */
    async answerCall(): Promise<boolean> {
        console.log('📞 ANSWER CALL called');

        if (!this.currentCall) {
            console.error('❌ No current call to answer');
            return false;
        }

        if (this.currentCall.status !== 'ringing') {
            console.error('❌ Call is not in ringing state:', this.currentCall.status);
            return false;
        }

        try {
            const type = this.currentCall.type;

            // Step 1: Get user media FIRST
            console.log('📞 Step 1: Getting user media...');
            const constraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                } : false,
            };

            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err: any) {
                throw this.handleMediaError(err);
            }

            console.log('✅ Got user media:', this.localStream.getTracks().map(t => t.kind));

            // Notify UI about local stream
            this.onLocalStream?.(this.localStream);

            // Step 2: Create peer connection
            console.log('📞 Step 2: Creating peer connection...');
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.config.iceServers,
                iceCandidatePoolSize: 10,
            });
            this.setupPeerConnectionHandlers();

            // Step 3: Add local tracks
            console.log('📞 Step 3: Adding local tracks...');
            this.localStream.getTracks().forEach(track => {
                if (this.peerConnection && this.localStream) {
                    this.peerConnection.addTrack(track, this.localStream);
                    console.log(`✅ Added ${track.kind} track`);
                }
            });

            // Step 4: Set remote description (offer)
            const incomingSdp = this.pendingSdp;
            if (!incomingSdp) {
                throw new Error('No SDP available to answer call');
            }

            console.log('📞 Step 4: Setting remote description...');
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription({ type: 'offer', sdp: incomingSdp })
            );
            console.log('✅ Remote description set');

            // Process any pending ICE candidates
            await this.processPendingIceCandidates();

            // Step 5: Create answer
            console.log('📞 Step 5: Creating answer...');
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log('✅ Answer created and set as local description');

            // Step 6: Update state to CONNECTING
            this.currentCall.status = 'connecting';
            this.currentCall.localStream = this.localStream;
            this.notifyStateChange();
            console.log('📞 State: RINGING → CONNECTING');

            // Step 7: Send answer
            console.log('📞 Step 6: Sending answer...');
            wsManager.send({
                type: 'call_answer',
                data: {
                    call_id: this.currentCall.callId,
                    sdp: answer.sdp,
                },
                timestamp: new Date().toISOString(),
            });

            console.log('✅ Call answered successfully');
            return true;

        } catch (error: any) {
            console.error('❌ Error answering call:', error);
            this.handleError(error.message || 'Failed to answer call');
            return false;
        }
    }

    /**
     * REJECT CALL
     * State: RINGING → ENDED
     */
    rejectCall() {
        if (!this.currentCall) return;

        console.log('❌ REJECTING CALL');

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
     * State: ANY → ENDED
     */
    endCall(sendSignal: boolean = true) {
        if (!this.currentCall) return;

        console.log('📴 ENDING CALL');

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

    /**
     * Setup Peer Connection Event Handlers
     */
    private setupPeerConnectionHandlers() {
        if (!this.peerConnection) return;

        // Handle incoming tracks (remote stream)
        this.peerConnection.ontrack = (event) => {
            console.log('🎥 Remote track received:', event.track.kind);

            // Get the stream from the event
            const [stream] = event.streams;

            if (stream) {
                this.remoteStream = stream;
                console.log('✅ Remote stream set');

                // Notify UI
                this.onRemoteStream?.(this.remoteStream);

                // Note: We don't set state to CONNECTED here
                // We wait for connectionState to become 'connected'
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
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

        // Handle connection state changes - CRITICAL for detecting connected state
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection?.connectionState;
            console.log('🔄 Connection state changed:', state);

            if (!this.currentCall) return;

            switch (state) {
                case 'connected':
                    // State: CONNECTING → CONNECTED
                    if (this.currentCall.status === 'connecting') {
                        this.currentCall.status = 'connected';
                        this.currentCall.startTime = new Date();
                        this.notifyStateChange();
                        console.log('📞 State: CONNECTING → CONNECTED ✅');
                        this.startConnectionMonitor();
                    }
                    break;

                case 'failed':
                    console.error('❌ Connection failed');
                    this.handleError('Connection failed');
                    break;

                case 'disconnected':
                    console.warn('⚠️ Connection disconnected');
                    // Give it a chance to reconnect
                    setTimeout(() => {
                        if (this.peerConnection?.connectionState === 'disconnected') {
                            this.handleError('Connection lost');
                        }
                    }, 5000);
                    break;

                case 'closed':
                    console.log('📴 Connection closed');
                    break;
            }
        };

        // Handle ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection?.iceConnectionState;
            console.log('🧊 ICE connection state:', state);
        };

        // Handle signaling state
        this.peerConnection.onsignalingstatechange = () => {
            console.log('📶 Signaling state:', this.peerConnection?.signalingState);
        };
    }

    /**
     * Monitor connection health
     */
    private startConnectionMonitor() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
        }

        this.connectionMonitorInterval = setInterval(() => {
            if (!this.peerConnection || !this.currentCall) {
                this.stopConnectionMonitor();
                return;
            }

            const state = this.peerConnection.connectionState;
            if (state === 'failed' || state === 'closed') {
                console.error('Connection unhealthy, ending call');
                this.handleError('Connection lost');
                this.stopConnectionMonitor();
            }
        }, 2000);
    }

    private stopConnectionMonitor() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
    }

    /**
     * Handle media errors with user-friendly messages
     */
    private handleMediaError(error: any): Error {
        let message = 'Failed to access camera/microphone';

        switch (error.name) {
            case 'NotAllowedError':
                message = 'Camera/microphone permission denied. Please allow access in your browser settings.';
                break;
            case 'NotFoundError':
                message = 'No camera or microphone found. Please connect a device.';
                break;
            case 'NotReadableError':
                message = 'Camera/microphone is in use by another application. Please close other apps.';
                break;
            case 'OverconstrainedError':
                message = 'Camera does not support the requested resolution.';
                break;
            case 'SecurityError':
                message = 'Camera/microphone access is blocked. Please use HTTPS or localhost.';
                break;
        }

        return new Error(message);
    }

    /**
     * Handle errors and update state
     */
    private handleError(message: string) {
        console.error('Call error:', message);

        if (this.currentCall) {
            this.currentCall.status = 'failed';
            this.currentCall.errorMessage = message;
            this.notifyStateChange();
        }

        this.cleanup();
    }

    /**
     * Cleanup resources
     */
    private cleanup() {
        console.log('🧹 Cleaning up...');

        this.stopConnectionMonitor();

        // Stop local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                console.log(`Stopped ${track.kind} track`);
            });
            this.localStream = null;
        }

        // Stop remote stream tracks
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Reset call state
        if (this.currentCall) {
            const wasFailed = this.currentCall.status === 'failed';
            if (!wasFailed) {
                this.currentCall.status = 'ended';
            }
            this.notifyStateChange();
        }

        this.currentCall = null;
        this.pendingIceCandidates = [];
        this.pendingSdp = null;

        console.log('🧹 Cleanup complete');
    }

    /**
     * TOGGLE MUTE
     * Returns: true if now muted, false if unmuted
     */
    toggleMute(): boolean {
        if (!this.localStream) return false;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const isMuted = !audioTrack.enabled;

            if (this.currentCall) {
                this.currentCall.isMuted = isMuted;
                this.notifyStateChange();
            }

            console.log(`🎤 Audio ${isMuted ? 'muted' : 'unmuted'}`);
            return isMuted;
        }
        return false;
    }

    /**
     * TOGGLE VIDEO
     * Returns: true if now video off, false if video on
     */
    toggleVideo(): boolean {
        if (!this.localStream) return false;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const isVideoOff = !videoTrack.enabled;

            if (this.currentCall) {
                this.currentCall.isVideoOff = isVideoOff;
                this.notifyStateChange();
            }

            console.log(`📹 Video ${isVideoOff ? 'off' : 'on'}`);
            return isVideoOff;
        }
        return false;
    }

    /**
     * Get current call state
     */
    getCurrentCall(): CallState | null {
        return this.currentCall ? { ...this.currentCall } : null;
    }

    /**
     * Check if currently in an active call
     */
    isInCall(): boolean {
        return this.currentCall !== null &&
            ['calling', 'ringing', 'connecting', 'connected'].includes(this.currentCall.status);
    }

    /**
     * Replace video track (for screen sharing)
     */
    async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<boolean> {
        if (!this.peerConnection) return false;

        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');

        if (videoSender) {
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

                    // Notify about updated local stream
                    if (this.currentCall) {
                        this.currentCall.localStream = this.localStream;
                        this.notifyStateChange();
                    }
                    this.onLocalStream?.(this.localStream);
                }

                return true;
            } catch (error) {
                console.error('Error replacing video track:', error);
                return false;
            }
        }
        return false;
    }

    /**
     * Check and request permissions explicitly
     */
    async checkPermissions(type: 'audio' | 'video'): Promise<{ audio: boolean; video: boolean }> {
        const result = { audio: false, video: false };

        try {
            // Check microphone permission
            const audioPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            result.audio = audioPermission.state === 'granted';

            // Check camera permission if video call
            if (type === 'video') {
                const videoPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
                result.video = videoPermission.state === 'granted';
            }
        } catch (e) {
            // Permissions API not supported, we'll try getUserMedia
            console.log('Permissions API not supported');
        }

        return result;
    }
}

// Export singleton instance
export const webrtcService = new WebRTCService();
