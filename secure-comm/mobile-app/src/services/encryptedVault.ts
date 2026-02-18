/**
 * ZeroTrace Encrypted Vault Service (Mobile)
 * 
 * Session key vault, encrypted backup, and legacy migration.
 * Bridges per-message crypto with the 3-layer hierarchy and multi-device sync.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    KeyHierarchyManager,
    DEKBundle,
    encryptWithDEK,
    decryptWithDEK,
    hashContent,
} from './keyManager';
import {
    deviceLinkService,
    deviceLinkApi,
    SessionKeyEntry,
} from './deviceLinkService';

// ==================== Types ====================

export interface VaultedSessionKey {
    conversationId: string;
    keyVersion: number;
    sessionKey: Uint8Array;
    firstMessageId: string | null;
    lastMessageId: string | null;
}

export interface BackupPayload {
    encryptedData: string;
    nonce: string;
    wrappedDek: string;
    dekWrapNonce: string;
    contentHash: string;
    createdAt: string;
}

export interface MigrationReport {
    conversationsFound: number;
    sessionKeysMigrated: number;
    sessionKeysFailed: number;
    legacyKeysWiped: boolean;
    durationMs: number;
}

// ==================== Encrypted Vault Service ====================

export class EncryptedVaultService {
    async vaultSessionKey(
        username: string,
        conversationId: string,
        sessionKeyBytes: Uint8Array,
        keyVersion: number = 1,
        firstMessageId?: string,
    ): Promise<SessionKeyEntry | null> {
        try {
            return await deviceLinkService.wrapAndStoreSessionKey(
                username,
                conversationId,
                sessionKeyBytes,
                keyVersion,
                firstMessageId,
            );
        } catch (err) {
            console.error(`❌ Failed to vault session key for ${conversationId}:`, err);
            return null;
        }
    }

    async getSessionKeys(
        username: string,
        conversationId: string,
    ): Promise<VaultedSessionKey[]> {
        try {
            const entries = await deviceLinkService.getAndUnwrapSessionKeys(username, conversationId);
            return entries.map(e => ({
                conversationId,
                keyVersion: e.keyVersion,
                sessionKey: e.sessionKey,
                firstMessageId: e.firstMsgId,
                lastMessageId: e.lastMsgId,
            }));
        } catch (err) {
            console.error(`❌ Failed to retrieve session keys for ${conversationId}:`, err);
            return [];
        }
    }

    async createBackup(username: string): Promise<BackupPayload | null> {
        const dekBundle = KeyHierarchyManager.getDEK(username);
        if (!dekBundle) return null;

        try {
            const allSessionKeys = await deviceLinkApi.getAllSessionKeys();

            const backupData = {
                version: 1,
                created_at: new Date().toISOString(),
                username,
                device_id: deviceLinkService.getDeviceId(),
                dek: {
                    wrapped_dek: dekBundle.wrappedDEK,
                    wrap_nonce: dekBundle.wrapNonce,
                    version: dekBundle.version,
                    algorithm: dekBundle.algorithm,
                },
                session_keys: allSessionKeys.map(sk => ({
                    id: sk.id,
                    conversation_id: sk.conversation_id,
                    wrapped_session_key: sk.wrapped_session_key,
                    session_key_nonce: sk.session_key_nonce,
                    dek_version: sk.dek_version,
                    key_version: sk.key_version,
                    first_message_id: sk.first_message_id,
                    last_message_id: sk.last_message_id,
                })),
                total_session_keys: allSessionKeys.length,
            };

            const plaintext = JSON.stringify(backupData);
            const contentHash = await hashContent(plaintext);
            const dekBytes = decodeBase64(dekBundle.plaintextDEK);
            const { ciphertext, nonce } = encryptWithDEK(plaintext, dekBytes);

            return {
                encryptedData: ciphertext,
                nonce,
                wrappedDek: dekBundle.wrappedDEK,
                dekWrapNonce: dekBundle.wrapNonce,
                contentHash,
                createdAt: new Date().toISOString(),
            };
        } catch (err) {
            console.error('❌ Backup creation failed:', err);
            return null;
        }
    }

    async restoreFromBackup(
        username: string,
        backup: BackupPayload,
        publicKey: string,
        privateKey: string,
    ): Promise<boolean> {
        try {
            const { unwrapDEK } = require('./keyManager');
            const dekBytes = unwrapDEK(
                backup.wrappedDek,
                backup.dekWrapNonce,
                decodeBase64(publicKey),
                decodeBase64(privateKey),
            );

            if (!dekBytes) return false;

            const plaintext = decryptWithDEK(backup.encryptedData, backup.nonce, dekBytes);
            if (!plaintext) return false;

            const hash = await hashContent(plaintext);
            if (hash !== backup.contentHash) return false;

            const backupData = JSON.parse(plaintext);
            const bundle: DEKBundle = {
                plaintextDEK: encodeBase64(dekBytes),
                wrappedDEK: backupData.dek.wrapped_dek,
                wrapNonce: backupData.dek.wrap_nonce,
                version: backupData.dek.version,
                algorithm: backupData.dek.algorithm,
            };
            KeyHierarchyManager.saveDEKLocally(username, bundle);

            for (const sk of backupData.session_keys) {
                try {
                    await deviceLinkApi.storeSessionKey({
                        conversation_id: sk.conversation_id,
                        wrapped_session_key: sk.wrapped_session_key,
                        session_key_nonce: sk.session_key_nonce,
                        dek_version: sk.dek_version,
                        key_version: sk.key_version,
                        first_message_id: sk.first_message_id,
                    });
                } catch { /* duplicate OK */ }
            }

            console.log(`🔑 Backup restored: ${backupData.total_session_keys} session keys`);
            return true;
        } catch (err) {
            console.error('❌ Backup restore failed:', err);
            return false;
        }
    }
}

// ==================== Legacy Migration ====================

export class LegacyMigrationHandler {
    private static MIGRATION_KEY = 'zerotrace_migration_status';
    private static LEGACY_KEY = 'zerotrace_sessions';

    static async needsMigration(): Promise<boolean> {
        const status = await AsyncStorage.getItem(this.MIGRATION_KEY);
        if (status === 'completed') return false;
        const data = await AsyncStorage.getItem(this.LEGACY_KEY);
        if (!data) return false;
        try {
            return Object.keys(JSON.parse(data)).length > 0;
        } catch { return false; }
    }

    static async migrate(username: string): Promise<MigrationReport> {
        const start = Date.now();
        const report: MigrationReport = {
            conversationsFound: 0,
            sessionKeysMigrated: 0,
            sessionKeysFailed: 0,
            legacyKeysWiped: false,
            durationMs: 0,
        };

        if (!(await this.needsMigration())) {
            report.durationMs = Date.now() - start;
            return report;
        }

        const dekBundle = KeyHierarchyManager.getDEK(username);
        if (!dekBundle) {
            report.durationMs = Date.now() - start;
            return report;
        }

        const legacyData = await AsyncStorage.getItem(this.LEGACY_KEY);
        if (!legacyData) {
            report.durationMs = Date.now() - start;
            return report;
        }

        try {
            const cache = JSON.parse(legacyData);
            const entries = Object.entries(cache);
            report.conversationsFound = entries.length;
            const dekBytes = decodeBase64(dekBundle.plaintextDEK);

            for (const [cacheKey, sharedSecret] of entries) {
                try {
                    const parts = cacheKey.split(':');
                    if (parts.length < 2) continue;
                    const peerUsername = parts[1];
                    const conversationId = `${username}:${peerUsername}`;
                    const sessionKeyBytes = decodeBase64(sharedSecret as string);
                    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
                    const wrappedKey = nacl.secretbox(sessionKeyBytes, nonce, dekBytes);

                    await deviceLinkApi.storeSessionKey({
                        conversation_id: conversationId,
                        wrapped_session_key: encodeBase64(wrappedKey),
                        session_key_nonce: encodeBase64(nonce),
                        dek_version: dekBundle.version,
                        key_version: 1,
                    });
                    report.sessionKeysMigrated++;
                } catch {
                    report.sessionKeysFailed++;
                }
            }

            if (report.sessionKeysFailed === 0) {
                await AsyncStorage.removeItem(this.LEGACY_KEY);
                await AsyncStorage.setItem(this.MIGRATION_KEY, 'completed');
                report.legacyKeysWiped = true;
            } else {
                await AsyncStorage.setItem(this.MIGRATION_KEY, 'partial');
            }
        } catch (err) {
            console.error('❌ Legacy migration error:', err);
        }

        report.durationMs = Date.now() - start;
        return report;
    }

    static async resetMigrationStatus(): Promise<void> {
        await AsyncStorage.removeItem(this.MIGRATION_KEY);
    }
}

export const encryptedVault = new EncryptedVaultService();
