/**
 * ZeroTrace Mobile Chat Store
 * Zustand store for managing chat state, contacts, messaging, and real-time events
 *
 * Mirrors the web client's store.ts with mobile-specific optimizations
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Keychain from 'react-native-keychain';
import { showMessage } from 'react-native-flash-message';

import { apiClient, messagesAPI, contactsAPI, keysAPI } from '../services/api';
import { friendAPI, TrustedContact, PendingRequests, BlockedUser } from '../services/friendApi';
import { profileAPI, Profile, PrivacySettings } from '../services/profileApi';
import { wsManager } from '../services/websocket';
import {
    encryptMessage,
    decryptMessage,
    generateKeyPair,
    generateSigningKeyPair,
    generateKeyBundle,
    generateFingerprint,
    KeyPair,
    EncryptedMessage,
} from '../utils/crypto';

// ─── Types ─────────────────────────────────────────

export interface User {
    id: number;
    username: string;
    email: string;
    public_key?: string;
    identity_key?: string;
    is_verified: boolean;
    last_seen?: string;
    created_at: string;
    settings?: any;
    display_name?: string;
    avatar_url?: string;
}

export interface Contact {
    id: number;
    user_id: number;
    contact_id: number;
    contact_username: string;
    contact_email: string;
    public_key?: string;
    identity_key?: string;
    nickname?: string;
    is_blocked: boolean;
    is_verified: boolean;
    added_at: string;
}

export interface Conversation {
    user_id: number;
    username: string;
    display_name?: string;
    avatar_url?: string;
    public_key?: string;
    identity_key?: string;
    last_message_time?: string;
    last_message_preview?: string;
    unread_count: number;
    is_online: boolean;
}

export interface Message {
    id: number;
    sender_id: number;
    sender_username: string;
    recipient_id: number;
    recipient_username: string;
    encrypted_content: string;
    encrypted_key?: string;
    message_type: string;
    status: string;
    expiry_type: string;
    expires_at?: string;
    file_metadata?: any;
    reactions?: Record<string, string[]>;
    is_deleted?: boolean;
    deleted_for_everyone?: boolean;
    created_at: string;
    delivered_at?: string;
    read_at?: string;
    // Local decrypted content (never sent to server)
    _decryptedContent?: string;
    _decryptionFailed?: boolean;
}

export interface CallLog {
    id: number;
    caller_id: number;
    caller_username: string;
    receiver_id: number;
    receiver_username: string;
    call_type: 'audio' | 'video';
    status: 'completed' | 'missed' | 'rejected' | 'failed';
    start_time: string;
    end_time?: string;
    duration_seconds: number;
}

// ─── Store Interface ───────────────────────────────

interface ChatStore {
    // Auth state
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Crypto state
    privateKey: string | null;
    publicKey: string | null;
    identityKey: string | null;
    identityPrivateKey: string | null;

    // Chat state
    contacts: Contact[];
    conversations: Conversation[];
    currentConversation: string | null;
    messages: Map<string, Message[]>;
    onlineUsers: Set<number>;
    typingUsers: Map<string, boolean>;
    callHistory: CallLog[];

    // Profile state
    profile: Profile | null;
    privacy: PrivacySettings | null;

    // Pending requests
    pendingRequests: PendingRequests | null;

    // Actions
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    initializeAuth: () => Promise<void>;

    // Key management
    generateAndUploadKeys: () => Promise<void>;
    loadStoredKeys: () => Promise<void>;

    // Contacts & conversations
    loadContacts: () => Promise<void>;
    loadConversations: () => Promise<void>;
    loadMessages: (username: string) => Promise<void>;
    setCurrentConversation: (username: string | null) => void;

    // Messaging
    sendMessage: (recipientUsername: string, content: string, messageType?: string, fileData?: any) => Promise<void>;
    addIncomingMessage: (message: Message) => void;
    deleteMessageForMe: (messageId: number | string, conversationUsername: string) => void;
    deleteMessageForEveryone: (messageId: number | string, conversationUsername: string) => void;
    clearChat: (username: string) => void;

    // Real-time
    initializeWebSocket: () => void;
    setUserOnline: (userId: number, isOnline: boolean) => void;
    setUserTyping: (username: string, isTyping: boolean) => void;
    sendTypingIndicator: (recipientUsername: string, isTyping: boolean) => void;

    // Profile
    loadProfile: (userId?: number) => Promise<void>;
    updateProfile: (data: Partial<Profile>) => Promise<void>;
    loadPrivacy: () => Promise<void>;
    updatePrivacy: (data: Partial<PrivacySettings>) => Promise<void>;

    // Friend system
    loadPendingRequests: () => Promise<void>;
    blockUser: (username: string) => Promise<void>;
    unblockUser: (username: string) => Promise<void>;

    // Call history
    loadCallHistory: () => Promise<void>;

    // Utility
    clearError: () => void;
}

// ─── Storage Keys ──────────────────────────────────

const STORAGE_KEYS = {
    USER: '@zerotrace/user',
    TOKEN: '@zerotrace/token',
    FIRST_LAUNCH: '@zerotrace/first_launch',
    PRIVATE_KEY: 'zerotrace_private_key',
    PUBLIC_KEY: '@zerotrace/public_key',
    IDENTITY_PRIVATE_KEY: 'zerotrace_identity_private_key',
    IDENTITY_KEY: '@zerotrace/identity_key',
};

// ─── Store Implementation ──────────────────────────

export const useChatStore = create<ChatStore>((set, get) => ({
    // Initial state
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    privateKey: null,
    publicKey: null,
    identityKey: null,
    identityPrivateKey: null,
    contacts: [],
    conversations: [],
    currentConversation: null,
    messages: new Map(),
    onlineUsers: new Set(),
    typingUsers: new Map(),
    callHistory: [],
    profile: null,
    privacy: null,
    pendingRequests: null,

    // ─── Authentication ────────────────────────

    login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const response = await apiClient.post('/auth/login', { username, password });
            const { access_token, user } = response.data;

            // Store securely
            await Keychain.setInternetCredentials('zerotrace_token', username, access_token);
            await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, access_token);

            apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

            set({
                user,
                token: access_token,
                isAuthenticated: true,
                isLoading: false,
            });

            // Load stored keys
            await get().loadStoredKeys();

            // Check if we need to generate keys
            if (!get().privateKey) {
                await get().generateAndUploadKeys();
            }

            // Initialize WebSocket
            get().initializeWebSocket();

            // Load data
            await Promise.all([
                get().loadContacts(),
                get().loadConversations(),
                get().loadProfile(),
                get().loadPrivacy(),
            ]);

            showMessage({
                message: 'Welcome back!',
                description: 'Successfully signed in to ZeroTrace',
                type: 'success',
            });
        } catch (error: any) {
            const message = error.response?.data?.detail || 'Login failed';
            set({ isLoading: false, error: message });
            showMessage({
                message: 'Login Failed',
                description: message,
                type: 'danger',
            });
            throw error;
        }
    },

    register: async (username: string, email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const keyPair = generateKeyPair();
            const signingKeyPair = generateSigningKeyPair();

            const response = await apiClient.post('/auth/register', {
                username,
                email,
                password,
                public_key: keyPair.publicKey,
                identity_key: signingKeyPair.publicKey,
            });

            const { access_token, user } = response.data;

            // Store keys securely in Keychain
            await Keychain.setInternetCredentials(
                STORAGE_KEYS.PRIVATE_KEY,
                username,
                keyPair.privateKey
            );
            await Keychain.setInternetCredentials(
                STORAGE_KEYS.IDENTITY_PRIVATE_KEY,
                username,
                signingKeyPair.privateKey
            );

            // Store public keys in AsyncStorage
            await AsyncStorage.setItem(STORAGE_KEYS.PUBLIC_KEY, keyPair.publicKey);
            await AsyncStorage.setItem(STORAGE_KEYS.IDENTITY_KEY, signingKeyPair.publicKey);

            // Store token and user
            await Keychain.setInternetCredentials('zerotrace_token', username, access_token);
            await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, access_token);

            apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

            set({
                user,
                token: access_token,
                isAuthenticated: true,
                isLoading: false,
                privateKey: keyPair.privateKey,
                publicKey: keyPair.publicKey,
                identityKey: signingKeyPair.publicKey,
                identityPrivateKey: signingKeyPair.privateKey,
            });

            // Generate and upload full key bundle
            await get().generateAndUploadKeys();

            // Initialize WebSocket
            get().initializeWebSocket();

            showMessage({
                message: 'Account Created!',
                description: 'Welcome to ZeroTrace',
                type: 'success',
            });
        } catch (error: any) {
            const message = error.response?.data?.detail || 'Registration failed';
            set({ isLoading: false, error: message });
            showMessage({
                message: 'Registration Failed',
                description: message,
                type: 'danger',
            });
            throw error;
        }
    },

    logout: async () => {
        try {
            // Disconnect WebSocket
            wsManager.disconnect();

            // Clear secure storage
            await Keychain.resetInternetCredentials('zerotrace_token');

            // Clear AsyncStorage
            await AsyncStorage.multiRemove([STORAGE_KEYS.USER, STORAGE_KEYS.TOKEN]);

            delete apiClient.defaults.headers.common['Authorization'];

            set({
                user: null,
                token: null,
                isAuthenticated: false,
                privateKey: null,
                publicKey: null,
                identityKey: null,
                identityPrivateKey: null,
                contacts: [],
                conversations: [],
                currentConversation: null,
                messages: new Map(),
                onlineUsers: new Set(),
                typingUsers: new Map(),
                callHistory: [],
                profile: null,
                privacy: null,
                pendingRequests: null,
                error: null,
            });

            showMessage({
                message: 'Signed Out',
                description: 'You have been securely signed out',
                type: 'info',
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    },

    initializeAuth: async () => {
        try {
            const credentials = await Keychain.getInternetCredentials('zerotrace_token');
            if (!credentials || !credentials.password) return;

            const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
            if (!userJson) return;

            const user = JSON.parse(userJson);
            const token = credentials.password;

            apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            // Verify token is still valid
            try {
                const meResponse = await apiClient.get('/auth/me');
                const freshUser = meResponse.data;

                set({
                    user: freshUser,
                    token,
                    isAuthenticated: true,
                });

                // Load keys and initialize
                await get().loadStoredKeys();
                get().initializeWebSocket();

                await Promise.all([
                    get().loadContacts(),
                    get().loadConversations(),
                    get().loadProfile(),
                    get().loadPrivacy(),
                ]);
            } catch (authError: any) {
                if (authError.response?.status === 401) {
                    // Token expired, force re-login
                    await get().logout();
                } else {
                    // Network error – use cached data
                    set({
                        user,
                        token,
                        isAuthenticated: true,
                    });
                    await get().loadStoredKeys();
                }
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
        }
    },

    // ─── Key Management ────────────────────────

    generateAndUploadKeys: async () => {
        try {
            const state = get();
            let pubKey = state.publicKey;
            let privKey = state.privateKey;
            let idKey = state.identityKey;
            let idPrivKey = state.identityPrivateKey;

            // Generate if missing
            if (!pubKey || !privKey) {
                const kp = generateKeyPair();
                pubKey = kp.publicKey;
                privKey = kp.privateKey;
            }

            if (!idKey || !idPrivKey) {
                const skp = generateSigningKeyPair();
                idKey = skp.publicKey;
                idPrivKey = skp.privateKey;
            }

            // Generate full key bundle
            const bundle = generateKeyBundle();

            // Upload to server
            await keysAPI.uploadKeys({
                public_key: pubKey,
                identity_key: idKey,
                signed_prekey: bundle.bundle.signedPrekey,
                signed_prekey_signature: bundle.bundle.signedPrekeySignature,
                one_time_prekeys: bundle.bundle.oneTimePrekeys,
            });

            // Store private keys securely
            const username = state.user?.username || 'unknown';
            await Keychain.setInternetCredentials(STORAGE_KEYS.PRIVATE_KEY, username, privKey);
            await Keychain.setInternetCredentials(STORAGE_KEYS.IDENTITY_PRIVATE_KEY, username, idPrivKey);

            await AsyncStorage.setItem(STORAGE_KEYS.PUBLIC_KEY, pubKey);
            await AsyncStorage.setItem(STORAGE_KEYS.IDENTITY_KEY, idKey);

            set({
                privateKey: privKey,
                publicKey: pubKey,
                identityKey: idKey,
                identityPrivateKey: idPrivKey,
            });

            console.log('[Keys] Keys generated and uploaded successfully');
        } catch (error) {
            console.error('[Keys] Failed to generate/upload keys:', error);
        }
    },

    loadStoredKeys: async () => {
        try {
            const privCred = await Keychain.getInternetCredentials(STORAGE_KEYS.PRIVATE_KEY);
            const idPrivCred = await Keychain.getInternetCredentials(STORAGE_KEYS.IDENTITY_PRIVATE_KEY);
            const pubKey = await AsyncStorage.getItem(STORAGE_KEYS.PUBLIC_KEY);
            const idKey = await AsyncStorage.getItem(STORAGE_KEYS.IDENTITY_KEY);

            set({
                privateKey: privCred ? (privCred as any).password : null,
                publicKey: pubKey,
                identityKey: idKey,
                identityPrivateKey: idPrivCred ? (idPrivCred as any).password : null,
            });
        } catch (error) {
            console.error('[Keys] Failed to load stored keys:', error);
        }
    },

    // ─── Contacts & Conversations ──────────────

    loadContacts: async () => {
        try {
            const response = await contactsAPI.getContacts();
            const data = response.data;
            const contactsList = Array.isArray(data) ? data : data.contacts || [];
            set({ contacts: contactsList });

            // Subscribe to presence for all contacts
            const userIds = contactsList.map((c: Contact) => c.contact_id || c.user_id);
            if (userIds.length > 0) {
                wsManager.subscribeToPresence(userIds);
            }
        } catch (error) {
            console.error('[Contacts] Failed to load:', error);
        }
    },

    loadConversations: async () => {
        try {
            const response = await contactsAPI.getConversations();
            const data = response.data;
            set({ conversations: Array.isArray(data) ? data : [] });
        } catch (error) {
            console.error('[Conversations] Failed to load:', error);
        }
    },

    loadMessages: async (username: string) => {
        try {
            const response = await messagesAPI.getConversation(username);
            const data = response.data;
            const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

            // Decrypt messages
            const state = get();
            const privKey = state.privateKey;
            const contact = state.contacts.find(
                (c) => c.contact_username === username
            );
            const senderPubKey = contact?.public_key;

            const decryptedMessages = items.map((msg: Message) => {
                if (msg.message_type === 'system' || msg.is_deleted) {
                    return { ...msg, _decryptedContent: msg.encrypted_content };
                }

                if (!privKey) {
                    return { ...msg, _decryptedContent: '[Keys not loaded]', _decryptionFailed: true };
                }

                try {
                    // Determine if we sent or received this message
                    const isSentByMe = msg.sender_username === state.user?.username;
                    let decrypted: string | null = null;

                    if (isSentByMe) {
                        // We sent it – we need the recipient's public key to decrypt
                        // (our own messages are encrypted with recipient's pub key + our priv key)
                        if (senderPubKey) {
                            const encMsg: EncryptedMessage = JSON.parse(msg.encrypted_content);
                            decrypted = decryptMessage(encMsg, senderPubKey, privKey);
                        }
                    } else {
                        // We received it – use sender's public key
                        const encMsg: EncryptedMessage = JSON.parse(msg.encrypted_content);
                        const fallbackKey = senderPubKey || encMsg.senderPublicKey || '';
                        decrypted = decryptMessage(encMsg, fallbackKey, privKey);
                    }

                    return {
                        ...msg,
                        _decryptedContent: decrypted || '[Decryption failed]',
                        _decryptionFailed: !decrypted,
                    };
                } catch {
                    return {
                        ...msg,
                        _decryptedContent: msg.encrypted_content,
                        _decryptionFailed: true,
                    };
                }
            });

            const msgs = new Map(get().messages);
            msgs.set(username, decryptedMessages);
            set({ messages: msgs });
        } catch (error) {
            console.error('[Messages] Failed to load:', error);
        }
    },

    setCurrentConversation: (username: string | null) => {
        set({ currentConversation: username });
        if (username) {
            get().loadMessages(username);
        }
    },

    // ─── Send Message ──────────────────────────

    sendMessage: async (
        recipientUsername: string,
        content: string,
        messageType: string = 'text',
        fileData?: any
    ) => {
        const state = get();
        if (!state.token || !state.user) return;

        try {
            // Get recipient's public key
            let recipientPubKey: string | undefined;

            // Try contacts first
            const contact = state.contacts.find(
                (c) => c.contact_username === recipientUsername
            );
            recipientPubKey = contact?.public_key;

            // Fetch from server if not cached
            if (!recipientPubKey) {
                try {
                    const keyResponse = await keysAPI.getPublicKey(recipientUsername);
                    recipientPubKey = keyResponse.data.public_key;
                } catch {
                    showMessage({
                        message: 'Cannot Send',
                        description: "Couldn't retrieve recipient's encryption key",
                        type: 'danger',
                    });
                    return;
                }
            }

            if (!recipientPubKey || !state.privateKey || !state.publicKey) {
                showMessage({
                    message: 'Encryption Error',
                    description: 'Keys not available',
                    type: 'danger',
                });
                return;
            }

            // Encrypt message (v2 with senderPublicKey)
            const encrypted = encryptMessage(
                content,
                recipientPubKey,
                state.privateKey,
                state.publicKey
            );

            const encryptedContent = JSON.stringify(encrypted);

            // Send via WebSocket for real-time delivery
            if (wsManager.isConnected()) {
                wsManager.sendEncryptedMessage(
                    recipientUsername,
                    encryptedContent,
                    messageType,
                    fileData
                );
            } else {
                // Fallback to HTTP
                await messagesAPI.send({
                    recipient_username: recipientUsername,
                    encrypted_content: encryptedContent,
                    message_type: messageType,
                    file_metadata: fileData,
                });
            }

            // Optimistic update: add message to local state
            const optimisticMsg: Message = {
                id: Date.now(),
                sender_id: state.user.id,
                sender_username: state.user.username,
                recipient_id: 0,
                recipient_username: recipientUsername,
                encrypted_content: encryptedContent,
                message_type: messageType,
                status: 'sent',
                expiry_type: 'never',
                created_at: new Date().toISOString(),
                _decryptedContent: content,
            };

            const msgs = new Map(get().messages);
            const existing = msgs.get(recipientUsername) || [];
            msgs.set(recipientUsername, [...existing, optimisticMsg]);
            set({ messages: msgs });
        } catch (error) {
            console.error('[Message] Send failed:', error);
            showMessage({
                message: 'Send Failed',
                description: 'Could not send message',
                type: 'danger',
            });
        }
    },

    addIncomingMessage: (message: Message) => {
        const state = get();
        const senderUsername = message.sender_username;

        // Decrypt the message
        let decryptedContent = message.encrypted_content;
        let decryptionFailed = false;

        if (state.privateKey && message.message_type !== 'system') {
            try {
                const encMsg: EncryptedMessage = JSON.parse(message.encrypted_content);
                const contact = state.contacts.find(
                    (c) => c.contact_username === senderUsername
                );
                const senderPubKey = contact?.public_key || encMsg.senderPublicKey || '';

                const plaintext = decryptMessage(encMsg, senderPubKey, state.privateKey);
                if (plaintext) {
                    decryptedContent = plaintext;
                } else {
                    decryptionFailed = true;
                    decryptedContent = '[Decryption failed]';
                }
            } catch {
                decryptionFailed = true;
            }
        }

        const enrichedMessage: Message = {
            ...message,
            _decryptedContent: decryptedContent,
            _decryptionFailed: decryptionFailed,
        };

        const msgs = new Map(get().messages);
        const existing = msgs.get(senderUsername) || [];

        // Avoid duplicates
        if (!existing.find((m) => m.id === message.id)) {
            msgs.set(senderUsername, [...existing, enrichedMessage]);
            set({ messages: msgs });
        }

        // Send delivery receipt
        if (message.sender_id && message.id) {
            wsManager.sendDeliveryReceipt(message.id, message.sender_id);
        }

        // Update conversation list
        get().loadConversations();
    },

    deleteMessageForMe: (messageId: number | string, conversationUsername: string) => {
        const msgs = new Map(get().messages);
        const existing = msgs.get(conversationUsername) || [];
        msgs.set(
            conversationUsername,
            existing.filter((m) => m.id !== messageId)
        );
        set({ messages: msgs });
    },

    deleteMessageForEveryone: (messageId: number | string, conversationUsername: string) => {
        const state = get();
        // Send via WebSocket
        if (typeof messageId === 'number') {
            wsManager.sendDeleteMessage(messageId, conversationUsername);
        }

        // Remove locally
        const msgs = new Map(state.messages);
        const existing = msgs.get(conversationUsername) || [];
        msgs.set(
            conversationUsername,
            existing.map((m) =>
                m.id === messageId
                    ? { ...m, is_deleted: true, deleted_for_everyone: true, _decryptedContent: 'This message was deleted' }
                    : m
            )
        );
        set({ messages: msgs });
    },

    clearChat: (username: string) => {
        const msgs = new Map(get().messages);
        msgs.set(username, []);
        set({ messages: msgs });
    },

    // ─── WebSocket Initialization ──────────────

    initializeWebSocket: () => {
        const state = get();
        if (!state.user || !state.token) return;

        wsManager.connect(String(state.user.id), state.token);

        // Handle incoming messages
        wsManager.on('message', (data: any) => {
            if (data.sender_username && data.encrypted_content) {
                get().addIncomingMessage(data as Message);
            }
        });

        // Handle message sent confirmation
        wsManager.on('message_sent', (data: any) => {
            const currentConv = get().currentConversation;
            if (currentConv && data.id) {
                // Update the optimistic message with the server-assigned ID
                const msgs = new Map(get().messages);
                const existing = msgs.get(currentConv) || [];
                const lastMsg = existing[existing.length - 1];
                if (lastMsg && lastMsg.id >= Date.now() - 10000) {
                    // Replace optimistic ID with server ID
                    const updated = [...existing];
                    updated[updated.length - 1] = { ...lastMsg, id: data.id, status: 'sent' };
                    msgs.set(currentConv, updated);
                    set({ messages: msgs });
                }
            }
        });

        // Handle presence updates
        wsManager.on('presence', (data: any) => {
            if (data.user_id !== undefined) {
                get().setUserOnline(data.user_id, data.is_online);
            }
        });

        // Handle typing indicators
        wsManager.on('typing', (data: any) => {
            if (data.username) {
                get().setUserTyping(data.username, data.is_typing);
            }
        });

        // Handle delivery receipts
        wsManager.on('delivery_receipt', (data: any) => {
            if (data.message_id) {
                const msgs = new Map(get().messages);
                msgs.forEach((msgList, key) => {
                    const updated = msgList.map((m) =>
                        m.id === data.message_id
                            ? { ...m, status: 'delivered', delivered_at: new Date().toISOString() }
                            : m
                    );
                    msgs.set(key, updated);
                });
                set({ messages: msgs });
            }
        });

        // Handle read receipts
        wsManager.on('read_receipt', (data: any) => {
            if (data.message_id) {
                const msgs = new Map(get().messages);
                msgs.forEach((msgList, key) => {
                    const updated = msgList.map((m) =>
                        m.id === data.message_id
                            ? { ...m, status: 'read', read_at: new Date().toISOString() }
                            : m
                    );
                    msgs.set(key, updated);
                });
                set({ messages: msgs });
            }
        });

        // Handle message deletion
        wsManager.on('message_deleted', (data: any) => {
            if (data.message_id && data.sender_username) {
                const msgs = new Map(get().messages);
                const existing = msgs.get(data.sender_username) || [];
                msgs.set(
                    data.sender_username,
                    existing.map((m) =>
                        m.id === data.message_id
                            ? { ...m, is_deleted: true, _decryptedContent: 'This message was deleted' }
                            : m
                    )
                );
                set({ messages: msgs });
            }
        });

        // Handle friend requests
        wsManager.on('friend_request', (_data: any) => {
            get().loadPendingRequests();
            showMessage({
                message: 'Friend Request',
                description: 'You have a new friend request',
                type: 'info',
            });
        });

        wsManager.on('friend_request_accepted', (_data: any) => {
            get().loadContacts();
            get().loadPendingRequests();
            showMessage({
                message: 'Request Accepted',
                description: 'Your friend request was accepted',
                type: 'success',
            });
        });

        // Handle reaction updates
        wsManager.on('reaction_update', (data: any) => {
            if (data.message_id && data.sender_username) {
                const msgs = new Map(get().messages);
                const conv = data.conversation_username || data.sender_username;
                const existing = msgs.get(conv) || [];
                msgs.set(
                    conv,
                    existing.map((m) =>
                        m.id === data.message_id
                            ? { ...m, reactions: data.reactions }
                            : m
                    )
                );
                set({ messages: msgs });
            }
        });

        // Handle contacts sync
        wsManager.on('contacts_sync', () => {
            get().loadContacts();
        });
    },

    setUserOnline: (userId: number, isOnline: boolean) => {
        const online = new Set(get().onlineUsers);
        if (isOnline) {
            online.add(userId);
        } else {
            online.delete(userId);
        }
        set({ onlineUsers: online });
    },

    setUserTyping: (username: string, isTyping: boolean) => {
        const typing = new Map(get().typingUsers);
        if (isTyping) {
            typing.set(username, true);
            // Auto-clear after 5s
            setTimeout(() => {
                const t = new Map(get().typingUsers);
                t.delete(username);
                set({ typingUsers: t });
            }, 5000);
        } else {
            typing.delete(username);
        }
        set({ typingUsers: typing });
    },

    sendTypingIndicator: (recipientUsername: string, isTyping: boolean) => {
        wsManager.sendTypingIndicator(recipientUsername, isTyping);
    },

    // ─── Profile ───────────────────────────────

    loadProfile: async (userId?: number) => {
        try {
            const state = get();
            const id = userId || state.user?.id;
            if (!id) return;

            const profile = await profileAPI.getProfile(id);
            set({ profile });
        } catch (error) {
            console.error('[Profile] Failed to load:', error);
        }
    },

    updateProfile: async (data: Partial<Profile>) => {
        try {
            const updated = await profileAPI.updateProfile(data as any);
            set({ profile: updated });
            showMessage({ message: 'Profile Updated', type: 'success' });
        } catch (error) {
            console.error('[Profile] Update failed:', error);
            showMessage({ message: 'Update Failed', type: 'danger' });
        }
    },

    loadPrivacy: async () => {
        try {
            const privacy = await profileAPI.getPrivacySettings();
            set({ privacy });
        } catch (error) {
            console.error('[Privacy] Failed to load:', error);
        }
    },

    updatePrivacy: async (data: Partial<PrivacySettings>) => {
        try {
            const updated = await profileAPI.updatePrivacySettings(data as any);
            set({ privacy: updated });
            showMessage({ message: 'Privacy Updated', type: 'success' });
        } catch (error) {
            console.error('[Privacy] Update failed:', error);
        }
    },

    // ─── Friends ───────────────────────────────

    loadPendingRequests: async () => {
        try {
            const response = await friendAPI.getPendingRequests();
            set({ pendingRequests: response.data as unknown as PendingRequests });
        } catch (error) {
            console.error('[Friends] Failed to load pending requests:', error);
        }
    },

    blockUser: async (username: string) => {
        try {
            await profileAPI.blockUser(username);
            get().loadContacts();
            showMessage({ message: 'User Blocked', type: 'info' });
        } catch (error) {
            console.error('[Block] Failed:', error);
        }
    },

    unblockUser: async (username: string) => {
        try {
            await profileAPI.unblockUser(username);
            get().loadContacts();
            showMessage({ message: 'User Unblocked', type: 'success' });
        } catch (error) {
            console.error('[Unblock] Failed:', error);
        }
    },

    // ─── Call History ──────────────────────────

    loadCallHistory: async () => {
        try {
            const response = await apiClient.get('/calls/history');
            set({ callHistory: response.data || [] });
        } catch (error) {
            console.error('[Calls] Failed to load history:', error);
            set({ callHistory: [] });
        }
    },

    // ─── Utility ───────────────────────────────

    clearError: () => set({ error: null }),
}));

export default useChatStore;
