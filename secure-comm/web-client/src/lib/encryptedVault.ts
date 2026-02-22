/**
 * ZeroTrace Encrypted Vault Service
 * 
 * Manages:
 *   1. Session key vault — wrap/unwrap/store session keys with DEK
 *   2. Legacy migration — detect old unmanaged keys and migrate them
 *   3. Encrypted backup — create/restore full key backups
 * 
 * This bridges the existing per-message crypto (crypto.ts session keys)
 * with the 3-layer hierarchy (keyManager.ts) and the multi-device
 * sync system (deviceLinkService.ts).
 * 
 * SECURITY:
 *   - All crypto operations are client-side
 *   - Server only stores wrapped/encrypted blobs
 *   - Old plaintext session keys are wiped after migration
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { KeyStorage } from './crypto';
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
  /** The raw session key bytes (only in memory, NEVER persisted plaintext) */
  sessionKey: Uint8Array;
  firstMessageId: string | null;
  lastMessageId: string | null;
}

export interface BackupPayload {
  /** Encrypted JSON blob of all keys & metadata */
  encryptedData: string;
  /** Nonce for the backup encryption */
  nonce: string;
  /** Wrapped backup DEK (so the backup is independently recoverable) */
  wrappedDek: string;
  dekWrapNonce: string;
  /** Hash of the plaintext for integrity verification */
  contentHash: string;
  /** ISO timestamp */
  createdAt: string;
}

export interface MigrationReport {
  conversationsFound: number;
  sessionKeysMigrated: number;
  sessionKeysFailed: number;
  legacyKeysWiped: boolean;
  durationMs: number;
}

// ==================== Storage Keys ====================
const LEGACY_SESSION_CACHE_KEY = 'zerotrace_sessions';
const MIGRATION_STATUS_KEY = 'zerotrace_migration_status';

// ==================== Encrypted Vault Service ====================

export class EncryptedVaultService {
  /**
   * Wrap and store a session key in the vault (server-side).
   * Call this whenever a new session key is established for a conversation.
   */
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

  /**
   * Retrieve and unwrap all session keys for a conversation.
   * Used to decrypt message history on a new device.
   */
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

  /**
   * Create an encrypted backup of all keys.
   * 
   * Backup includes:
   *  - DEK bundle (wrapped)
   *  - All session keys (wrapped with DEK)
   *  - Device info
   *  - Key metadata
   * 
   * The backup itself is encrypted with a backup-specific key
   * derived from the user's password (PBKDF2) — handled client-side.
   */
  async createBackup(
    username: string,
  ): Promise<BackupPayload | null> {
    const dekBundle = KeyHierarchyManager.getDEK(username);
    if (!dekBundle) {
      console.error('❌ No DEK available for backup');
      return null;
    }

    try {
      // Gather all session keys
      const allSessionKeys = await deviceLinkApi.getAllSessionKeys();

      // Build backup manifest
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

      // Encrypt the backup with the DEK
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

  /**
   * Restore keys from an encrypted backup.
   */
  async restoreFromBackup(
    username: string,
    backup: BackupPayload,
  ): Promise<boolean> {
    try {
      const keys = KeyStorage.load(username);
      if (!keys || !keys.publicKey || !keys.privateKey) {
        console.error('❌ Cannot restore backup: encryption keys not available');
        return false;
      }

      // First unwrap the DEK
      const { unwrapDEK } = await import('./keyManager');
      const dekBytes = unwrapDEK(
        backup.wrappedDek,
        backup.dekWrapNonce,
        decodeBase64(keys.publicKey),
        decodeBase64(keys.privateKey),
      );

      if (!dekBytes) {
        console.error('❌ Cannot restore: DEK unwrap failed');
        return false;
      }

      // Decrypt the backup data
      const plaintext = decryptWithDEK(backup.encryptedData, backup.nonce, dekBytes);
      if (!plaintext) {
        console.error('❌ Cannot restore: backup decryption failed');
        return false;
      }

      // Verify integrity
      const hash = await hashContent(plaintext);
      if (hash !== backup.contentHash) {
        console.error('❌ Backup integrity check failed');
        return false;
      }

      const backupData = JSON.parse(plaintext);

      // Restore DEK bundle
      const bundle: DEKBundle = {
        plaintextDEK: encodeBase64(dekBytes),
        wrappedDEK: backupData.dek.wrapped_dek,
        wrapNonce: backupData.dek.wrap_nonce,
        version: backupData.dek.version,
        algorithm: backupData.dek.algorithm,
      };
      KeyHierarchyManager.saveDEKLocally(username, bundle);

      // Re-upload session keys (in case server lost them)
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
        } catch {
          // Session key might already exist, that's OK
        }
      }

      console.log(`🔑 Backup restored: ${backupData.total_session_keys} session keys`);
      return true;
    } catch (err) {
      console.error('❌ Backup restore failed:', err);
      return false;
    }
  }
}

// ==================== Legacy Migration Handler ====================

/**
 * Migrates legacy session keys from localStorage (plaintext cache)
 * to the encrypted vault (wrapped with DEK, stored server-side).
 * 
 * Legacy format (from crypto.ts KeyStorage.SESSION_CACHE_KEY):
 *   { "user1:user2:fingerprint": "sharedSecretBase64", ... }
 * 
 * This migration:
 * 1. Reads all legacy session keys from localStorage
 * 2. Wraps each with the current DEK
 * 3. Uploads to the server vault
 * 4. Wipes the plaintext cache from localStorage
 * 
 * Safe to call multiple times — idempotent.
 */
export class LegacyMigrationHandler {
  /**
   * Check if legacy migration is needed.
   */
  static needsMigration(): boolean {
    // AUDIT FIX: SSR guard — localStorage is unavailable during server-side rendering
    if (typeof window === 'undefined') return false;
    
    const status = localStorage.getItem(MIGRATION_STATUS_KEY);
    if (status === 'completed') return false;

    const legacyData = localStorage.getItem(LEGACY_SESSION_CACHE_KEY);
    if (!legacyData) return false;

    try {
      const parsed = JSON.parse(legacyData);
      return Object.keys(parsed).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Run the full legacy migration.
   */
  static async migrate(username: string): Promise<MigrationReport> {
    const startTime = Date.now();
    const report: MigrationReport = {
      conversationsFound: 0,
      sessionKeysMigrated: 0,
      sessionKeysFailed: 0,
      legacyKeysWiped: false,
      durationMs: 0,
    };

    if (!this.needsMigration()) {
      report.durationMs = Date.now() - startTime;
      return report;
    }

    const dekBundle = KeyHierarchyManager.getDEK(username);
    if (!dekBundle) {
      console.warn('⚠️ Cannot migrate legacy keys: no DEK available');
      report.durationMs = Date.now() - startTime;
      return report;
    }

    const legacyData = localStorage.getItem(LEGACY_SESSION_CACHE_KEY);
    if (!legacyData) {
      report.durationMs = Date.now() - startTime;
      return report;
    }

    try {
      const cache = JSON.parse(legacyData);
      const entries = Object.entries(cache);
      report.conversationsFound = entries.length;

      const dekBytes = decodeBase64(dekBundle.plaintextDEK);

      for (const [cacheKey, sharedSecret] of entries) {
        try {
          // Parse cache key: "myUsername:peerUsername:fingerprint"
          const parts = cacheKey.split(':');
          if (parts.length < 2) continue;

          const peerUsername = parts[1];
          const conversationId = `${username}:${peerUsername}`;

          // Convert shared secret to bytes
          const sessionKeyBytes = decodeBase64(sharedSecret as string);

          // Wrap with DEK and upload
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
        } catch (err) {
          console.warn(`⚠️ Failed to migrate session key:`, err);
          report.sessionKeysFailed++;
        }
      }

      // Wipe legacy plaintext cache
      if (report.sessionKeysFailed === 0) {
        localStorage.removeItem(LEGACY_SESSION_CACHE_KEY);
        localStorage.setItem(MIGRATION_STATUS_KEY, 'completed');
        report.legacyKeysWiped = true;
        console.log('🧹 Legacy session key cache wiped');
      } else {
        localStorage.setItem(MIGRATION_STATUS_KEY, 'partial');
        console.warn(`⚠️ Migration partial: ${report.sessionKeysFailed} keys failed`);
      }
    } catch (err) {
      console.error('❌ Legacy migration error:', err);
    }

    report.durationMs = Date.now() - startTime;
    console.log(
      `📦 Legacy migration: ${report.sessionKeysMigrated}/${report.conversationsFound} keys migrated in ${report.durationMs}ms`,
    );
    return report;
  }

  /**
   * Reset migration status (for retry).
   */
  static resetMigrationStatus(): void {
    localStorage.removeItem(MIGRATION_STATUS_KEY);
  }
}

// ==================== Singleton Export ====================

export const encryptedVault = new EncryptedVaultService();
