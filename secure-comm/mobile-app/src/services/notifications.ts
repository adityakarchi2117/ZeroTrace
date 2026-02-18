/**
 * ZeroTrace Push Notification Service
 * Firebase Cloud Messaging (FCM) integration for Android push notifications
 *
 * Features:
 * - FCM token registration with backend
 * - Local notification display for foreground messages
 * - Notification channels for Android (messages, calls, system)
 * - Deep linking from notification taps
 * - Badge count management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState } from 'react-native';
import { apiClient } from './api';

// ─── Types ─────────────────────────────────────────

export interface NotificationPayload {
    type: 'message' | 'call' | 'friend_request' | 'system';
    title: string;
    body: string;
    data?: {
        sender_username?: string;
        sender_id?: string;
        message_id?: string;
        call_id?: string;
        call_type?: string;
        conversation_id?: string;
    };
}

export interface NotificationConfig {
    enabled: boolean;
    showPreviews: boolean;
    sound: boolean;
    vibration: boolean;
    messageNotifications: boolean;
    callNotifications: boolean;
    friendRequestNotifications: boolean;
}

// ─── Storage Keys ──────────────────────────────────

const KEYS = {
    FCM_TOKEN: '@zt/fcm_token',
    NOTIFICATION_CONFIG: '@zt/notification_config',
    BADGE_COUNT: '@zt/badge_count',
};

// ─── Default Config ────────────────────────────────

const DEFAULT_CONFIG: NotificationConfig = {
    enabled: true,
    showPreviews: true,
    sound: true,
    vibration: true,
    messageNotifications: true,
    callNotifications: true,
    friendRequestNotifications: true,
};

// ─── Notification Channels (Android) ───────────────

export const CHANNELS = {
    MESSAGES: {
        id: 'zerotrace_messages',
        name: 'Messages',
        description: 'New message notifications',
        importance: 4, // HIGH
        sound: 'default',
        vibration: true,
    },
    CALLS: {
        id: 'zerotrace_calls',
        name: 'Calls',
        description: 'Incoming call notifications',
        importance: 5, // MAX
        sound: 'ringtone',
        vibration: true,
    },
    SYSTEM: {
        id: 'zerotrace_system',
        name: 'System',
        description: 'System notifications and alerts',
        importance: 3, // DEFAULT
        sound: 'default',
        vibration: false,
    },
};

// ─── Notification Service ──────────────────────────

class NotificationService {
    private static instance: NotificationService;
    private config: NotificationConfig = DEFAULT_CONFIG;
    private fcmToken: string | null = null;
    private listeners: Map<string, Set<(payload: NotificationPayload) => void>> = new Map();
    private isInitialized = false;

    static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    // ─── Initialization ─────────────────────

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Load config
            await this.loadConfig();

            // Request permissions
            await this.requestPermissions();

            // Get FCM token
            await this.getFCMToken();

            // Setup notification channels (Android)
            if (Platform.OS === 'android') {
                await this.createNotificationChannels();
            }

            this.isInitialized = true;
            console.log('[Notifications] Initialized successfully');
        } catch (error) {
            console.error('[Notifications] Initialization failed:', error);
        }
    }

    // ─── Permissions ────────────────────────

    private async requestPermissions(): Promise<boolean> {
        try {
            // Note: In a real implementation, you would use:
            // import messaging from '@react-native-firebase/messaging';
            // const authStatus = await messaging().requestPermission();
            // For now, we'll use a placeholder that can be filled in when
            // @react-native-firebase/messaging is installed
            console.log('[Notifications] Permission request placeholder');
            return true;
        } catch (error) {
            console.error('[Notifications] Permission request failed:', error);
            return false;
        }
    }

    // ─── FCM Token ──────────────────────────

    private async getFCMToken(): Promise<string | null> {
        try {
            // Note: In a real implementation:
            // import messaging from '@react-native-firebase/messaging';
            // const token = await messaging().getToken();
            // For now, use stored token or generate placeholder
            const storedToken = await AsyncStorage.getItem(KEYS.FCM_TOKEN);
            if (storedToken) {
                this.fcmToken = storedToken;
                return storedToken;
            }

            console.log('[Notifications] FCM token: awaiting Firebase setup');
            return null;
        } catch (error) {
            console.error('[Notifications] Token retrieval failed:', error);
            return null;
        }
    }

    /**
     * Register the FCM token with the backend
     */
    async registerTokenWithBackend(token?: string): Promise<void> {
        const tokenToRegister = token || this.fcmToken;
        if (!tokenToRegister) return;

        try {
            await apiClient.post('/auth/register-device', {
                device_token: tokenToRegister,
                device_type: Platform.OS,
                device_name: `${Platform.OS} ${Platform.Version}`,
            });

            await AsyncStorage.setItem(KEYS.FCM_TOKEN, tokenToRegister);
            this.fcmToken = tokenToRegister;
            console.log('[Notifications] Token registered with backend');
        } catch (error) {
            console.error('[Notifications] Token registration failed:', error);
        }
    }

    /**
     * Unregister device token (on logout)
     */
    async unregisterToken(): Promise<void> {
        try {
            if (this.fcmToken) {
                await apiClient.post('/auth/unregister-device', {
                    device_token: this.fcmToken,
                });
            }
            await AsyncStorage.removeItem(KEYS.FCM_TOKEN);
            this.fcmToken = null;
            console.log('[Notifications] Token unregistered');
        } catch (error) {
            console.error('[Notifications] Token unregister failed:', error);
        }
    }

    // ─── Notification Channels ──────────────

    private async createNotificationChannels(): Promise<void> {
        // Note: In a real implementation, use:
        // import notifee from '@notifee/react-native';
        // await notifee.createChannel({ ... });
        console.log('[Notifications] Android channels created (placeholder)');
    }

    // ─── Display Notifications ──────────────

    /**
     * Show a local notification (for foreground messages)
     */
    async showLocalNotification(payload: NotificationPayload): Promise<void> {
        // Don't show if the app is in foreground and config says no previews
        if (AppState.currentState === 'active' && !this.config.showPreviews) {
            return;
        }

        // Check if notifications are enabled for this type
        if (!this.config.enabled) return;
        if (payload.type === 'message' && !this.config.messageNotifications) return;
        if (payload.type === 'call' && !this.config.callNotifications) return;
        if (payload.type === 'friend_request' && !this.config.friendRequestNotifications) return;

        try {
            // Note: In a real implementation, use:
            // import notifee from '@notifee/react-native';
            // await notifee.displayNotification({
            //   title: payload.title,
            //   body: payload.body,
            //   android: {
            //     channelId: payload.type === 'call' ? CHANNELS.CALLS.id : CHANNELS.MESSAGES.id,
            //     sound: this.config.sound ? 'default' : undefined,
            //   },
            // });
            console.log(`[Notifications] Display: ${payload.title} - ${payload.body}`);
        } catch (error) {
            console.error('[Notifications] Display failed:', error);
        }
    }

    /**
     * Show notification for a new message
     */
    async notifyNewMessage(senderUsername: string, messagePreview: string, senderId?: number): Promise<void> {
        await this.showLocalNotification({
            type: 'message',
            title: senderUsername,
            body: this.config.showPreviews ? messagePreview : 'New message',
            data: {
                sender_username: senderUsername,
                sender_id: senderId?.toString(),
            },
        });
        await this.incrementBadge();
    }

    /**
     * Show notification for an incoming call
     */
    async notifyIncomingCall(callerUsername: string, callType: 'audio' | 'video', callId?: string): Promise<void> {
        await this.showLocalNotification({
            type: 'call',
            title: `Incoming ${callType} call`,
            body: callerUsername,
            data: {
                sender_username: callerUsername,
                call_type: callType,
                call_id: callId,
            },
        });
    }

    /**
     * Show notification for a friend request
     */
    async notifyFriendRequest(username: string): Promise<void> {
        await this.showLocalNotification({
            type: 'friend_request',
            title: 'New Friend Request',
            body: `${username} wants to connect with you`,
            data: {
                sender_username: username,
            },
        });
    }

    // ─── Badge Management ───────────────────

    async getBadgeCount(): Promise<number> {
        try {
            const count = await AsyncStorage.getItem(KEYS.BADGE_COUNT);
            return count ? parseInt(count, 10) : 0;
        } catch {
            return 0;
        }
    }

    async setBadgeCount(count: number): Promise<void> {
        try {
            await AsyncStorage.setItem(KEYS.BADGE_COUNT, String(count));
            // Note: Use notifee.setBadgeCount(count) for actual badge
        } catch (error) {
            console.error('[Notifications] Badge update failed:', error);
        }
    }

    async incrementBadge(): Promise<void> {
        const current = await this.getBadgeCount();
        await this.setBadgeCount(current + 1);
    }

    async clearBadge(): Promise<void> {
        await this.setBadgeCount(0);
    }

    // ─── Event Listeners ────────────────────

    on(event: string, listener: (payload: NotificationPayload) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
    }

    off(event: string, listener: (payload: NotificationPayload) => void): void {
        this.listeners.get(event)?.delete(listener);
    }

    emit(event: string, payload: NotificationPayload): void {
        this.listeners.get(event)?.forEach((listener) => listener(payload));
    }

    // ─── Configuration ──────────────────────

    async getConfig(): Promise<NotificationConfig> {
        return this.config;
    }

    async updateConfig(updates: Partial<NotificationConfig>): Promise<void> {
        this.config = { ...this.config, ...updates };
        await AsyncStorage.setItem(KEYS.NOTIFICATION_CONFIG, JSON.stringify(this.config));
    }

    private async loadConfig(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(KEYS.NOTIFICATION_CONFIG);
            if (raw) {
                this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
            }
        } catch (error) {
            console.error('[Notifications] Config load error:', error);
        }
    }

    // ─── Cleanup ────────────────────────────

    async reset(): Promise<void> {
        await this.unregisterToken();
        await AsyncStorage.removeItem(KEYS.NOTIFICATION_CONFIG);
        await AsyncStorage.removeItem(KEYS.BADGE_COUNT);
        this.config = DEFAULT_CONFIG;
        this.isInitialized = false;
    }
}

export const notificationService = NotificationService.getInstance();
export default notificationService;
