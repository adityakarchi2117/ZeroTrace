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
  'contacts_sync' | 'notification' | 'friend_request' | 'friend_request_accepted' | 'friend_request_rejected';
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

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private userId: string | null = null;
  private token: string | null = null;
  private isConnecting = false;
  private messageQueue: WebSocketMessage[] = [];

  constructor() {
    // Don't auto-connect in constructor
  }

  connect(userId: string, token: string) {
    this.userId = userId;
    this.token = token;
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
        this.attemptReconnect();
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
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
      // Queue message for later
      this.messageQueue.push(message);
      console.warn(`⏳ WebSocket not connected (state: ${this.ws?.readyState}), queuing ${message.type} message`);

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
    this.stopHeartbeat();
    this.updatePresence(false);

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
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
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    wsManager.updatePresence(false);
    wsManager.disconnect();
  });

  // Update presence on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wsManager.updatePresence(false);
    } else {
      wsManager.updatePresence(true);
    }
  });
}