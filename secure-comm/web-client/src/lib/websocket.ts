/**
 * ZeroTrace WebSocket Manager
 * Handles real-time messaging, presence, and call signaling
 */

export interface WebSocketMessage {
  type: 'message' | 'presence' | 'typing' | 'delivery_receipt' | 'read_receipt' |
  'ping' | 'pong' | 'connected' | 'message_sent' | 'error' |
  'call_offer' | 'call_answer' | 'call_reject' | 'call_rejected' |
  'call_end' | 'call_ended' | 'call_failed' | 'ice_candidate' |
  'presence_subscribe' | 'get_online_status' | 'online_status' |
  'delete_message' | 'delete_message_received' | 'delete_conversation' | 'delete_conversation_received' |
  'contacts_sync' | 'notification' | 'friend_request' | 'friend_request_accepted' | 'friend_request_rejected' |
  'contact_removed_self' | 'read_sync' | 'read_state_sync';
  data?: any;
  timestamp: string;
  [key: string]: any;
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

/**
 * AUDIT FIXES:
 * - Added MAX_QUEUE_SIZE to prevent unbounded message queue growth
 * - Added removeAllHandlers() for proper cleanup on logout
 * - Fixed reconnection to not trigger on intentional disconnect
 */
const MAX_QUEUE_SIZE = 100;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null; // AUDIT FIX: Track reconnect timer
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private userId: string | null = null;
  private token: string | null = null;
  private isConnecting = false;
  private messageQueue: WebSocketMessage[] = [];
  private intentionalDisconnect = false;

  constructor() {
    // Don't auto-connect in constructor
  }

  connect(userId: string, token: string) {
    this.userId = userId;
    this.token = token;
    this.intentionalDisconnect = false; // AUDIT FIX: Reset on new connect
    this.connectWebSocket();
  }

  private connectWebSocket() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';

    if (!this.token) {
      console.warn('No auth token available for WebSocket connection');
      this.isConnecting = false;
      return;
    }

    try {
      this.ws = new WebSocket(`${wsUrl}/chat?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('🔗 WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();

        // BUGFIX: Notify handlers of reconnection so they can re-sync state
        // (e.g., re-fetch pending messages that may have arrived while disconnected)
        const reconnectHandlers = this.messageHandlers.get('reconnected');
        if (reconnectHandlers) {
          reconnectHandlers.forEach(h => { try { h({ type: 'reconnected' }); } catch {} });
        }

        // Send any queued messages
        this.flushMessageQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        this.isConnecting = false;
        this.stopHeartbeat();
        // AUDIT FIX: Don't reconnect if disconnect was intentional (logout)
        if (!this.intentionalDisconnect) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.intentionalDisconnect) return; // AUDIT FIX: Respect intentional disconnect
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      // AUDIT FIX: Notify handlers that connection is permanently lost
      const handlers = this.messageHandlers.get('connection_lost');
      if (handlers) {
        handlers.forEach(h => { try { h({ type: 'connection_lost' }); } catch {} });
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    // AUDIT FIX: Store timer reference so we can cancel on intentional disconnect
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.connectWebSocket();
      }
    }, delay);
  }

  private lastPongReceived: number = Date.now();
  private pongTimeoutMs: number = 45000; // 45s — must be > ping interval (30s)

  private startHeartbeat() {
    this.lastPongReceived = Date.now();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Check if we received a pong since last ping
        const elapsed = Date.now() - this.lastPongReceived;
        if (elapsed > this.pongTimeoutMs) {
          console.warn(`⚠️ No pong received for ${elapsed}ms — connection is dead, forcing reconnect`);
          try { this.ws?.close(4000, 'Pong timeout'); } catch (_) {}
          this.attemptReconnect();
          return;
        }
        this.send({
          type: 'ping',
          data: {},
          timestamp: new Date().toISOString()
        });
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleMessage(message: any) {
    const type = message.type;

    // Track pong responses for dead-connection detection
    if (type === 'pong') {
      this.lastPongReceived = Date.now();
    }

    const handlers = this.messageHandlers.get(type);

    if (handlers && handlers.size > 0) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`Error in handler for ${type}:`, error);
        }
      });
    } else if (type !== 'pong') {
      console.log('Unhandled WebSocket message type:', type, message);
    }
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  // Public methods
  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log(`📤 Sending ${message.type} message:`, message);
      this.ws.send(JSON.stringify(message));
    } else {
      // AUDIT FIX: Enforce max queue size to prevent unbounded memory growth
      if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
        console.warn(`⚠️ Message queue full (${MAX_QUEUE_SIZE}), dropping oldest message`);
        this.messageQueue.shift();
      }
      this.messageQueue.push(message);
      console.warn(`⏳ WebSocket not connected (state: ${this.ws?.readyState}), queuing ${message.type} message (${this.messageQueue.length}/${MAX_QUEUE_SIZE})`);

      // Try to reconnect if not connecting
      if (!this.isConnecting && this.userId && this.token) {
        console.log('🔄 Triggering reconnection from send failure');
        this.connect(this.userId, this.token);
      }
    }
  }

  on(type: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  off(type: string, handler?: (data: any) => void) {
    if (handler) {
      this.messageHandlers.get(type)?.delete(handler);
    } else {
      this.messageHandlers.delete(type);
    }
  }

  onMessage(type: string, handler: (data: any) => void) {
    this.on(type, handler);
  }

  offMessage(type: string) {
    this.messageHandlers.delete(type);
  }

  // Send encrypted message
  sendEncryptedMessage(recipientUsername: string, encryptedContent: string, messageType: string = 'text', fileMetadata?: any) {
    this.send({
      type: 'message',
      data: {
        recipient_username: recipientUsername,
        encrypted_content: encryptedContent,
        message_type: messageType,
        file_metadata: fileMetadata,
      },
      timestamp: new Date().toISOString()
    });
  }

  sendTypingIndicator(recipientUsername: string, isTyping: boolean) {
    this.send({
      type: 'typing',
      data: {
        recipient_username: recipientUsername,
        is_typing: isTyping
      },
      timestamp: new Date().toISOString()
    });
  }

  sendDeliveryReceipt(messageId: number, senderId: number) {
    this.send({
      type: 'delivery_receipt',
      data: {
        message_id: messageId,
        sender_id: senderId
      },
      timestamp: new Date().toISOString()
    });
  }

  sendReadReceipt(messageId: number, senderId: number) {
    this.send({
      type: 'read_receipt',
      data: {
        message_id: messageId,
        sender_id: senderId
      },
      timestamp: new Date().toISOString()
    });
  }

  updatePresence(isOnline: boolean) {
    // Only send presence if socket is actually connected
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.log(`⏳ Skipping presence update (socket state: ${this.ws?.readyState ?? 'undefined'})`);
      return;
    }
    this.send({
      type: 'presence',
      data: {
        is_online: isOnline
      },
      timestamp: new Date().toISOString()
    });
  }

  subscribeToPresence(userIds: number[]) {
    this.send({
      type: 'presence_subscribe',
      data: {
        user_ids: userIds
      },
      timestamp: new Date().toISOString()
    });
  }

  getOnlineStatus(userIds: number[]) {
    this.send({
      type: 'get_online_status',
      data: {
        user_ids: userIds
      },
      timestamp: new Date().toISOString()
    });
  }

  // Send delete message event (delete for everyone)
  sendDeleteMessage(messageId: number, recipientUsername: string) {
    this.send({
      type: 'delete_message',
      data: {
        message_id: messageId,
        recipient_username: recipientUsername,
      },
      timestamp: new Date().toISOString()
    });
  }

  // Send delete conversation event (delete for everyone)
  sendDeleteConversation(recipientUsername: string) {
    this.send({
      type: 'delete_conversation',
      data: {
        recipient_username: recipientUsername,
      },
      timestamp: new Date().toISOString()
    });
  }

  disconnect() {
    this.intentionalDisconnect = true; // AUDIT FIX: Prevent auto-reconnect
    this.stopHeartbeat();
    
    // AUDIT FIX: Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.updatePresence(false);

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
    this.reconnectAttempts = 0;
    // AUDIT FIX: Clear token reference on disconnect to prevent stale token retention
    this.token = null;
    this.userId = null;
  }

  /**
   * AUDIT FIX: Remove all registered handlers.
   * Must be called on logout to prevent duplicate handlers on re-login.
   */
  removeAllHandlers() {
    this.messageHandlers.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): number | null {
    return this.ws?.readyState ?? null;
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();

// Auto-disconnect on page unload
// AUDIT FIX: Set intentionalDisconnect flag via disconnect() to prevent
// reconnect timers from firing during unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    wsManager.updatePresence(false);
    wsManager.disconnect();
  });

  // AUDIT FIX: Resume AudioContext on first user interaction for browsers
  // that require a user gesture (Chrome's autoplay policy)
  const resumeAudioOnGesture = () => {
    try {
      const { initAudioContext } = require('./sound');
      initAudioContext();
    } catch (_) {}
    window.removeEventListener('click', resumeAudioOnGesture);
    window.removeEventListener('keydown', resumeAudioOnGesture);
  };
  window.addEventListener('click', resumeAudioOnGesture, { once: true });
  window.addEventListener('keydown', resumeAudioOnGesture, { once: true });

  // Update presence on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wsManager.updatePresence(false);
    } else {
      wsManager.updatePresence(true);
    }
  });
}