/**
 * ZeroTrace Network State Handler
 * Monitors network connectivity and triggers reconnection/sync
 *
 * Features:
 * - Auto-reconnect WebSocket when network recovers
 * - Queue operations while offline
 * - Sync pending data on reconnection
 * - Expose current network state to UI
 */

import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

import { wsManager } from './websocket';
import { useChatStore } from '../store/chatStore';

// ─── Types ─────────────────────────────────────────

export interface NetworkStatus {
    isConnected: boolean;
    isInternetReachable: boolean | null;
    type: string;
    isWifi: boolean;
    isCellular: boolean;
}

// ─── Network Monitor (Singleton) ───────────────────

class NetworkMonitor {
    private static instance: NetworkMonitor;
    private subscription: NetInfoSubscription | null = null;
    private appStateSubscription: any = null;
    private currentState: NetworkStatus = {
        isConnected: true,
        isInternetReachable: true,
        type: 'unknown',
        isWifi: false,
        isCellular: false,
    };
    private wasOffline = false;
    private listeners: Set<(status: NetworkStatus) => void> = new Set();

    static getInstance(): NetworkMonitor {
        if (!NetworkMonitor.instance) {
            NetworkMonitor.instance = new NetworkMonitor();
        }
        return NetworkMonitor.instance;
    }

    start(): void {
        if (this.subscription) return;

        // Monitor network changes
        this.subscription = NetInfo.addEventListener((state: NetInfoState) => {
            const newStatus: NetworkStatus = {
                isConnected: state.isConnected ?? false,
                isInternetReachable: state.isInternetReachable,
                type: state.type,
                isWifi: state.type === 'wifi',
                isCellular: state.type === 'cellular',
            };

            const wasDisconnected = !this.currentState.isConnected;
            this.currentState = newStatus;

            // Notify listeners
            this.listeners.forEach((listener) => listener(newStatus));

            // Reconnect if we just came back online
            if (wasDisconnected && newStatus.isConnected) {
                console.log('[Network] Connection restored, reconnecting...');
                this.handleReconnection();
            }

            if (!newStatus.isConnected) {
                this.wasOffline = true;
                console.log('[Network] Connection lost');
            }
        });

        // Monitor app state for foreground transitions
        this.appStateSubscription = AppState.addEventListener(
            'change',
            this.handleAppStateChange
        );
    }

    private handleAppStateChange = (nextState: AppStateStatus) => {
        if (nextState === 'active') {
            // Check network when app comes to foreground
            NetInfo.fetch().then((state) => {
                if (state.isConnected && !wsManager.isConnected()) {
                    console.log('[Network] App foregrounded with connection, reconnecting...');
                    this.handleReconnection();
                }
            });
        }
    };

    private handleReconnection(): void {
        // Reconnect WebSocket
        const store = useChatStore.getState();
        if (store.user && store.token && !wsManager.isConnected()) {
            wsManager.connect(String(store.user.id), store.token);
        }

        // Re-sync data if we were offline
        if (this.wasOffline) {
            this.wasOffline = false;
            setTimeout(() => {
                const state = useChatStore.getState();
                if (state.isAuthenticated) {
                    state.loadConversations();
                    state.loadContacts();
                    if (state.currentConversation) {
                        state.loadMessages(state.currentConversation);
                    }
                }
            }, 1000);
        }
    }

    stop(): void {
        if (this.subscription) {
            this.subscription();
            this.subscription = null;
        }
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }

    getStatus(): NetworkStatus {
        return this.currentState;
    }

    isOnline(): boolean {
        return this.currentState.isConnected;
    }

    addListener(listener: (status: NetworkStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const networkMonitor = NetworkMonitor.getInstance();

// ─── React Hook ────────────────────────────────────

export function useNetworkStatus(): NetworkStatus {
    const [status, setStatus] = useState<NetworkStatus>(networkMonitor.getStatus());

    useEffect(() => {
        const unsubscribe = networkMonitor.addListener(setStatus);
        return unsubscribe;
    }, []);

    return status;
}

export default networkMonitor;
