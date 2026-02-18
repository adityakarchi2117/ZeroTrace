/**
 * ZeroTrace Mobile Local Storage Manager
 * Persistent encrypted message cache using AsyncStorage
 *
 * Mirrors web client's storage.ts (IndexedDB) with mobile equivalents.
 * Messages are stored encrypted and only decrypted in memory.
 *
 * Storage schema:
 *   @zt/conversations  → Conversation[]
 *   @zt/msgs/{username} → StoredMessage[]
 *   @zt/contacts       → Contact[]
 *   @zt/call_history   → CallLog[]
 *   @zt/settings       → AppSettings
 *   @zt/sync_token     → string
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ─────────────────────────────────────────

export interface StoredMessage {
    id: number;
    sender_id: number;
    sender_username: string;
    recipient_id: number;
    recipient_username: string;
    encrypted_content: string;
    message_type: string;
    status: string;
    expiry_type: string;
    file_metadata?: any;
    reactions?: Record<string, string[]>;
    is_deleted?: boolean;
    deleted_for_everyone?: boolean;
    created_at: string;
    delivered_at?: string;
    read_at?: string;
    _decryptedContent?: string;
    _decryptionFailed?: boolean;
}

export interface StoredConversation {
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

export interface StoredContact {
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

export interface AppSettings {
    theme: 'dark' | 'light' | 'system';
    notifications_enabled: boolean;
    sound_enabled: boolean;
    vibration_enabled: boolean;
    biometric_enabled: boolean;
    auto_download_media: boolean;
    read_receipts_enabled: boolean;
    typing_indicators_enabled: boolean;
    last_sync: string;
}

// ─── Storage Keys ──────────────────────────────────

const KEYS = {
    CONVERSATIONS: '@zt/conversations',
    CONTACTS: '@zt/contacts',
    CALL_HISTORY: '@zt/call_history',
    SETTINGS: '@zt/settings',
    SYNC_TOKEN: '@zt/sync_token',
    DRAFT_PREFIX: '@zt/draft/',
    MESSAGES_PREFIX: '@zt/msgs/',
};

// ─── Default Settings ──────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    notifications_enabled: true,
    sound_enabled: true,
    vibration_enabled: true,
    biometric_enabled: false,
    auto_download_media: true,
    read_receipts_enabled: true,
    typing_indicators_enabled: true,
    last_sync: '',
};

// ─── Storage Manager ───────────────────────────────

class StorageManager {
    private static instance: StorageManager;
    private memoryCache: Map<string, any> = new Map();

    static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    // ─── Generic Helpers ─────────────────────

    private async getJSON<T>(key: string, fallback: T): Promise<T> {
        // Check memory cache first
        if (this.memoryCache.has(key)) {
            return this.memoryCache.get(key) as T;
        }

        try {
            const raw = await AsyncStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw) as T;
                this.memoryCache.set(key, parsed);
                return parsed;
            }
        } catch (error) {
            console.error(`[Storage] Read error for ${key}:`, error);
        }
        return fallback;
    }

    private async setJSON<T>(key: string, value: T): Promise<void> {
        try {
            this.memoryCache.set(key, value);
            await AsyncStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error(`[Storage] Write error for ${key}:`, error);
        }
    }

    // ─── Conversations ──────────────────────

    async getConversations(): Promise<StoredConversation[]> {
        return this.getJSON(KEYS.CONVERSATIONS, []);
    }

    async saveConversations(conversations: StoredConversation[]): Promise<void> {
        await this.setJSON(KEYS.CONVERSATIONS, conversations);
    }

    async updateConversation(username: string, update: Partial<StoredConversation>): Promise<void> {
        const convs = await this.getConversations();
        const idx = convs.findIndex((c) => c.username === username);
        if (idx !== -1) {
            convs[idx] = { ...convs[idx], ...update };
        } else {
            convs.push(update as StoredConversation);
        }
        // Sort by last message time
        convs.sort((a, b) => {
            const ta = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const tb = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return tb - ta;
        });
        await this.saveConversations(convs);
    }

    // ─── Messages ────────────────────────────

    async getMessages(username: string, limit: number = 100): Promise<StoredMessage[]> {
        const key = `${KEYS.MESSAGES_PREFIX}${username}`;
        const all = await this.getJSON<StoredMessage[]>(key, []);
        return all.slice(-limit);
    }

    async saveMessages(username: string, messages: StoredMessage[]): Promise<void> {
        const key = `${KEYS.MESSAGES_PREFIX}${username}`;
        // Keep only last 500 messages in storage per conversation
        const trimmed = messages.slice(-500);
        await this.setJSON(key, trimmed);
    }

    async appendMessage(username: string, message: StoredMessage): Promise<void> {
        const existing = await this.getMessages(username, 500);
        // Avoid duplicates
        if (!existing.find((m) => m.id === message.id)) {
            existing.push(message);
            await this.saveMessages(username, existing);
        }
    }

    async updateMessageStatus(
        username: string,
        messageId: number,
        updates: Partial<StoredMessage>
    ): Promise<void> {
        const existing = await this.getMessages(username, 500);
        const idx = existing.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
            existing[idx] = { ...existing[idx], ...updates };
            await this.saveMessages(username, existing);
        }
    }

    async deleteMessage(username: string, messageId: number): Promise<void> {
        const existing = await this.getMessages(username, 500);
        const filtered = existing.filter((m) => m.id !== messageId);
        await this.saveMessages(username, filtered);
    }

    async clearConversationMessages(username: string): Promise<void> {
        const key = `${KEYS.MESSAGES_PREFIX}${username}`;
        this.memoryCache.delete(key);
        await AsyncStorage.removeItem(key);
    }

    // ─── Contacts ────────────────────────────

    async getContacts(): Promise<StoredContact[]> {
        return this.getJSON(KEYS.CONTACTS, []);
    }

    async saveContacts(contacts: StoredContact[]): Promise<void> {
        await this.setJSON(KEYS.CONTACTS, contacts);
    }

    // ─── Call History ────────────────────────

    async getCallHistory(): Promise<any[]> {
        return this.getJSON(KEYS.CALL_HISTORY, []);
    }

    async saveCallHistory(history: any[]): Promise<void> {
        // Keep last 100 calls
        const trimmed = history.slice(-100);
        await this.setJSON(KEYS.CALL_HISTORY, trimmed);
    }

    async addCallLog(callLog: any): Promise<void> {
        const existing = await this.getCallHistory();
        existing.push(callLog);
        await this.saveCallHistory(existing);
    }

    // ─── Settings ────────────────────────────

    async getSettings(): Promise<AppSettings> {
        return this.getJSON(KEYS.SETTINGS, DEFAULT_SETTINGS);
    }

    async saveSettings(settings: Partial<AppSettings>): Promise<void> {
        const current = await this.getSettings();
        const updated = { ...current, ...settings };
        await this.setJSON(KEYS.SETTINGS, updated);
    }

    // ─── Message Drafts ──────────────────────

    async getDraft(username: string): Promise<string> {
        const key = `${KEYS.DRAFT_PREFIX}${username}`;
        try {
            return (await AsyncStorage.getItem(key)) || '';
        } catch {
            return '';
        }
    }

    async saveDraft(username: string, text: string): Promise<void> {
        const key = `${KEYS.DRAFT_PREFIX}${username}`;
        if (text.trim()) {
            await AsyncStorage.setItem(key, text);
        } else {
            await AsyncStorage.removeItem(key);
        }
    }

    // ─── Sync Token ──────────────────────────

    async getSyncToken(): Promise<string | null> {
        try {
            return await AsyncStorage.getItem(KEYS.SYNC_TOKEN);
        } catch {
            return null;
        }
    }

    async saveSyncToken(token: string): Promise<void> {
        await AsyncStorage.setItem(KEYS.SYNC_TOKEN, token);
    }

    // ─── Cache Management ────────────────────

    async clearAllData(): Promise<void> {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const ztKeys = allKeys.filter((k) => k.startsWith('@zt/'));
            if (ztKeys.length > 0) {
                await AsyncStorage.multiRemove(ztKeys);
            }
            this.memoryCache.clear();
            console.log(`[Storage] Cleared ${ztKeys.length} cache entries`);
        } catch (error) {
            console.error('[Storage] Clear error:', error);
        }
    }

    async getCacheSize(): Promise<{ entries: number; estimatedBytes: number }> {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const ztKeys = allKeys.filter((k) => k.startsWith('@zt/'));
            let totalBytes = 0;
            for (const key of ztKeys) {
                const val = await AsyncStorage.getItem(key);
                if (val) totalBytes += val.length * 2; // rough estimate (2 bytes per char)
            }
            return { entries: ztKeys.length, estimatedBytes: totalBytes };
        } catch {
            return { entries: 0, estimatedBytes: 0 };
        }
    }

    invalidateMemoryCache(): void {
        this.memoryCache.clear();
    }
}

export const storage = StorageManager.getInstance();
export default storage;
