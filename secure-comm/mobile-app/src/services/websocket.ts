/**
 * ZeroTrace Mobile WebSocket Manager
 * Handles real-time messaging, presence, typing, receipts, and call signaling
 *
 * Mirrors web client's WebSocketManager with mobile-specific optimizations:
 * - AppState awareness (background/foreground)
 * - Network reconnection
 * - Battery-efficient heartbeat
 */

import { AppState, AppStateStatus } from 'react-native';
import { WS_BASE_URL } from './api';

export interface WebSocketMessage {
    type:
    | 'message'
    | 'presence'
    | 'typing'
    | 'delivery_receipt'
    | 'read_receipt'
    | 'ping'
    | 'pong'
    | 'connected'
    | 'message_sent'
    | 'error'
    | 'call_offer'
    | 'call_answer'
    | 'call_reject'
    | 'call_rejected'
    | 'call_end'
    | 'call_ended'
    | 'ice_candidate'
    | 'delete_message'
    | 'message_deleted'
    | 'delete_conversation'
    | 'conversation_deleted'
    | 'contacts_sync'
    | 'notification'
    | 'friend_request'
    | 'friend_request_accepted'
    | 'friend_request_rejected'
    | 'contact_removed_self'
    | 'read_sync'
    | 'read_state_sync'
    | 'message_reaction'
    | 'reaction_update';
    data?: any;
    timestamp: string;
}

export interface PresenceUpdate {
    username: string;
    is_online: boolean;
    last_seen?: string;
}

export interface TypingIndicator {
    username: string;
    is_typing: boolean;
}

type MessageHandler = (data: any) => void;

class WebSocketManager {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private reconnectDelay = 1000;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private userId: string = '';
    private token: string = '';
    private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
    private messageQueue: WebSocketMessage[] = [];
    private isConnecting = false;
    private appStateSubscription: any = null;
    private lastAppState: AppStateStatus = 'active';

    constructor() {
        // Listen for app state changes
        this.appStateSubscription = AppState.addEventListener(
            'change',
            this.handleAppStateChange
        );
    }

    private handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (
            this.lastAppState.match(/inactive|background/) &&
            nextAppState === 'active'
        ) {
            // App came to foreground - reconnect if needed
            if (!this.isConnected()) {
                console.log('[WS] App foregrounded, reconnecting...');
                this.connectWebSocket();
            }
        } else if (nextAppState === 'background') {
            // Optionally reduce heartbeat frequency in background
            console.log('[WS] App backgrounded');
        }
        this.lastAppState = nextAppState;
    };

    connect(userId: string, token: string) {
        this.userId = userId;
        this.token = token;
        this.reconnectAttempts = 0;
        this.connectWebSocket();
    }

    private connectWebSocket() {
        if (this.isConnecting || this.isConnected()) return;
        this.isConnecting = true;

        try {
            const wsUrl = `${WS_BASE_URL}/${this.userId}?token=${this.token}`;
            console.log('[WS] Connecting to:', wsUrl.replace(this.token, '***'));

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('[WS] Connected successfully');
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.startHeartbeat();
                this.flushMessageQueue();

                // Notify handlers
                this.emit('connected', { userId: this.userId });
            };

            this.ws.onmessage = (event: WebSocketMessageEvent) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (e) {
                    console.error('[WS] Failed to parse message:', e);
                }
            };

            this.ws.onclose = (event: WebSocketCloseEvent) => {
                console.log('[WS] Connection closed:', event.code, event.reason);
                this.isConnecting = false;
                this.stopHeartbeat();
                this.attemptReconnect();
            };

            this.ws.onerror = (error: Event) => {
                console.error('[WS] Error:', error);
                this.isConnecting = false;
            };
        } catch (error) {
            console.error('[WS] Connection error:', error);
            this.isConnecting = false;
            this.attemptReconnect();
        }
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[WS] Max reconnection attempts reached');
            this.emit('error', { message: 'Connection lost. Please restart the app.' });
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        this.reconnectTimeout = setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send({ type: 'ping', timestamp: new Date().toISOString() });
            }
        }, 30000); // 30s heartbeat
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private handleMessage(message: any) {
        const type = message.type;

        // Handle pong silently
        if (type === 'pong') return;

        // Emit to type-specific handlers
        this.emit(type, message.data || message);
    }

    private flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            if (msg) this.send(msg);
        }
    }

    // ---- Public Methods ----

    send(message: WebSocketMessage) {
        if (this.isConnected()) {
            try {
                this.ws!.send(JSON.stringify(message));
            } catch (error) {
                console.error('[WS] Send error:', error);
                this.messageQueue.push(message);
            }
        } else {
            this.messageQueue.push(message);
        }
    }

    on(type: string, handler: MessageHandler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type)!.add(handler);
    }

    off(type: string, handler?: MessageHandler) {
        if (handler) {
            this.messageHandlers.get(type)?.delete(handler);
        } else {
            this.messageHandlers.delete(type);
        }
    }

    private emit(type: string, data: any) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`[WS] Handler error for ${type}:`, e);
                }
            });
        }
    }

    // ---- Messaging Helpers ----

    sendEncryptedMessage(
        recipientUsername: string,
        encryptedContent: string,
        messageType: string = 'text',
        fileMetadata?: any
    ) {
        this.send({
            type: 'message',
            data: {
                recipient_username: recipientUsername,
                encrypted_content: encryptedContent,
                message_type: messageType,
                ...(fileMetadata && { file_metadata: fileMetadata }),
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendTypingIndicator(recipientUsername: string, isTyping: boolean) {
        this.send({
            type: 'typing',
            data: {
                recipient_username: recipientUsername,
                is_typing: isTyping,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendDeliveryReceipt(messageId: number, senderId: number) {
        this.send({
            type: 'delivery_receipt',
            data: {
                message_id: messageId,
                sender_id: senderId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendReadReceipt(messageId: number, senderId: number) {
        this.send({
            type: 'read_receipt',
            data: {
                message_id: messageId,
                sender_id: senderId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    updatePresence(isOnline: boolean) {
        this.send({
            type: 'presence',
            data: { is_online: isOnline },
            timestamp: new Date().toISOString(),
        });
    }

    subscribeToPresence(userIds: number[]) {
        this.send({
            type: 'presence',
            data: {
                action: 'subscribe',
                user_ids: userIds,
            },
            timestamp: new Date().toISOString(),
        });
    }

    getOnlineStatus(userIds: number[]) {
        this.send({
            type: 'presence',
            data: {
                action: 'get_status',
                user_ids: userIds,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendDeleteMessage(messageId: number, recipientUsername: string) {
        this.send({
            type: 'delete_message',
            data: {
                message_id: messageId,
                recipient_username: recipientUsername,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendDeleteConversation(recipientUsername: string) {
        this.send({
            type: 'delete_conversation',
            data: {
                recipient_username: recipientUsername,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendMessageReaction(messageId: number, recipientUsername: string, emoji: string) {
        this.send({
            type: 'message_reaction',
            data: {
                message_id: messageId,
                recipient_username: recipientUsername,
                emoji,
            },
            timestamp: new Date().toISOString(),
        });
    }

    // ---- Call Signaling ----

    sendCallOffer(recipientUsername: string, offer: any, callType: string, callId: string) {
        this.send({
            type: 'call_offer',
            data: {
                recipient_username: recipientUsername,
                offer,
                call_type: callType,
                call_id: callId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendCallAnswer(recipientUsername: string, answer: any, callId: string) {
        this.send({
            type: 'call_answer',
            data: {
                recipient_username: recipientUsername,
                answer,
                call_id: callId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendCallReject(recipientUsername: string, callId: string) {
        this.send({
            type: 'call_reject',
            data: {
                recipient_username: recipientUsername,
                call_id: callId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendCallEnd(recipientUsername: string, callId: string) {
        this.send({
            type: 'call_end',
            data: {
                recipient_username: recipientUsername,
                call_id: callId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    sendIceCandidate(recipientUsername: string, candidate: any, callId: string) {
        this.send({
            type: 'ice_candidate',
            data: {
                recipient_username: recipientUsername,
                candidate,
                call_id: callId,
            },
            timestamp: new Date().toISOString(),
        });
    }

    // ---- Connection State ----

    disconnect() {
        console.log('[WS] Disconnecting...');
        this.stopHeartbeat();

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.ws) {
            this.ws.onclose = null; // Prevent reconnect
            this.ws.close();
            this.ws = null;
        }

        this.messageHandlers.clear();
        this.messageQueue = [];
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    getConnectionState(): number | null {
        return this.ws?.readyState ?? null;
    }

    destroy() {
        this.disconnect();
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }
}

// Singleton instance
export const wsManager = new WebSocketManager();
export default wsManager;
