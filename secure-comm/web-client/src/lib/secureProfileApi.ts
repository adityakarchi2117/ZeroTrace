/**
 * ZeroTrace Secure Profile API Client
 * 
 * Handles all API calls to the /api/secure/* endpoints.
 * Integrates with KeyHierarchyManager for client-side encryption.
 */

import { api as apiClient } from './api';
import { KeyHierarchyManager, KeyRotationManager, EncryptedBlob } from './keyManager';

// ==================== Response Types ====================

export interface DEKResponse {
  id: number;
  user_id: number;
  key_version: number;
  wrapped_dek: string;
  wrap_nonce: string;
  algorithm: string;
  is_active: boolean;
  created_at: string;
  rotated_at: string | null;
}

export interface EncryptedProfileResponse {
  id: number;
  user_id: number;
  encrypted_data: string;
  profile_nonce: string;
  dek_version: number;
  profile_version: number;
  content_hash: string;
  schema_version: string;
  created_at: string;
}

export interface KeyInfoResponse {
  identity_key: string | null;
  encryption_key: string | null;
  active_dek_version: number | null;
  total_dek_versions: number;
  total_rotations: number;
  last_rotation: string | null;
  profile_versions: number;
}

export interface ProfileVersionInfo {
  version: number;
  dek_version: number;
  content_hash: string;
  schema_version: string;
  created_at: string;
}

export interface BackupResponse {
  id: number;
  backup_type: string;
  backup_data: string;
  backup_nonce: string;
  wrapped_dek: string;
  dek_wrap_nonce: string;
  backup_key_hash: string;
  created_at: string;
}

export interface RotationHistoryEntry {
  id: number;
  rotation_type: string;
  previous_key_version: number | null;
  new_key_version: number | null;
  re_encrypted_items: number;
  rotated_by: string;
  details: string | null;
  created_at: string;
}

// ==================== Secure Profile API ====================

class SecureProfileApi {
  private get http() {
    return apiClient.http;
  }

  // ==================== DEK Management ====================

  /**
   * Store a wrapped DEK on the server.
   */
  async storeDEK(wrappedDEK: string, wrapNonce: string, keyVersion: number): Promise<DEKResponse> {
    const response = await this.http.post('/api/secure/dek/store', {
      wrapped_dek: wrappedDEK,
      wrap_nonce: wrapNonce,
      key_version: keyVersion,
      algorithm: 'x25519-xsalsa20-poly1305',
    });
    return response.data;
  }

  /**
   * Get the current active DEK from the server.
   */
  async getActiveDEK(): Promise<DEKResponse | null> {
    try {
      const response = await this.http.get('/api/secure/dek/active');
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // ==================== Key Rotation ====================

  /**
   * Perform a full key rotation on the server.
   */
  async rotateKeys(params: {
    new_identity_key: string;
    new_signed_prekey: string;
    new_signed_prekey_signature: string;
    new_one_time_prekeys: string[];
    rewrapped_dek: string;
    dek_wrap_nonce: string;
    reason?: string;
  }): Promise<any> {
    const response = await this.http.post('/api/secure/keys/rotate', params);
    return response.data;
  }

  /**
   * Get key information (versions, rotation count, etc.).
   */
  async getKeyInfo(): Promise<KeyInfoResponse> {
    const response = await this.http.get('/api/secure/keys/info');
    return response.data;
  }

  /**
   * Get rotation history.
   */
  async getRotationHistory(limit: number = 20): Promise<RotationHistoryEntry[]> {
    const response = await this.http.get(`/api/secure/keys/rotation-history?limit=${limit}`);
    return response.data;
  }

  // ==================== Encrypted Profile ====================

  /**
   * Store an encrypted profile on the server.
   */
  async updateEncryptedProfile(params: {
    encrypted_data: string;
    profile_nonce: string;
    dek_version: number;
    content_hash: string;
    schema_version?: string;
  }): Promise<EncryptedProfileResponse> {
    const response = await this.http.post('/api/secure/profile/secure/update', params);
    return response.data;
  }

  /**
   * Get the latest encrypted profile from the server.
   */
  async getEncryptedProfile(): Promise<EncryptedProfileResponse | null> {
    try {
      const response = await this.http.get('/api/secure/profile/secure');
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get profile version history.
   */
  async getProfileVersions(limit: number = 10): Promise<ProfileVersionInfo[]> {
    const response = await this.http.get(`/api/secure/profile/versions?limit=${limit}`);
    return response.data;
  }

  /**
   * Restore a specific profile version.
   */
  async restoreProfileVersion(version: number): Promise<EncryptedProfileResponse> {
    const response = await this.http.post('/api/secure/profile/restore', { version });
    return response.data;
  }

  // ==================== Encrypted Profile Picture ====================

  /**
   * Upload an encrypted profile picture.
   */
  async uploadEncryptedPhoto(params: {
    encrypted_data: string;
    photo_nonce: string;
    dek_version: number;
    content_hash: string;
    mime_type: string;
    encrypted_size: number;
    original_size: number;
  }): Promise<any> {
    const response = await this.http.post('/api/secure/profile/secure/photo', params);
    return response.data;
  }

  // ==================== Encrypted Message Metadata ====================

  /**
   * Store encrypted message metadata (chat settings, nicknames, pins).
   */
  async updateEncryptedMetadata(params: {
    metadata_type: string;
    encrypted_data: string;
    metadata_nonce: string;
    dek_version: number;
    content_hash: string;
  }): Promise<any> {
    const response = await this.http.post('/api/secure/metadata/secure/update', params);
    return response.data;
  }

  // ==================== Backup ====================

  /**
   * Create an encrypted backup on the server.
   */
  async createBackup(params: {
    backup_type: string;
    backup_data: string;
    backup_nonce: string;
    wrapped_dek: string;
    dek_wrap_nonce: string;
    backup_key_hash: string;
  }): Promise<BackupResponse> {
    const response = await this.http.post('/api/secure/backup/create', params);
    return response.data;
  }

  /**
   * Restore from an encrypted backup.
   */
  async restoreBackup(backupId: number): Promise<BackupResponse> {
    const response = await this.http.post('/api/secure/backup/restore', {
      backup_id: backupId,
    });
    return response.data;
  }

  /**
   * List available backups.
   */
  async listBackups(): Promise<BackupResponse[]> {
    const response = await this.http.get('/api/secure/backup/list');
    return response.data;
  }

  // ==================== Device Sync ====================

  /**
   * Request device sync data bundle.
   */
  async requestDeviceSync(params: {
    device_id: string;
    device_public_key: string;
    sync_type?: string;
  }): Promise<any> {
    const response = await this.http.post('/api/secure/sync/device', params);
    return response.data;
  }
}

// ==================== High-Level Orchestration ====================

/**
 * High-level methods that coordinate between KeyHierarchyManager and the API.
 * These are the main entry points for the UI layer.
 */
export class SecureProfileService {
  private api = new SecureProfileApi();

  /**
   * Initialize the secure profile system for a user on login.
   * - If DEK exists on server → fetch & unwrap
   * - If no DEK → generate, wrap, and upload
   */
  async initializeOnLogin(
    username: string,
    encryptionPublicKey: string,
    encryptionPrivateKey: string,
  ): Promise<boolean> {
    try {
      // Check for existing DEK on server
      const serverDEK = await this.api.getActiveDEK();

      if (serverDEK) {
        // Unwrap and cache it locally
        const bundle = KeyHierarchyManager.unwrapAndCacheDEK(
          username,
          serverDEK.wrapped_dek,
          serverDEK.wrap_nonce,
          serverDEK.key_version,
          encryptionPublicKey,
          encryptionPrivateKey,
        );

        if (!bundle) {
          console.error('❌ Failed to unwrap server DEK');
          return false;
        }

        console.log(`✅ DEK restored from server (v${serverDEK.key_version})`);
      } else {
        // First time: generate new DEK
        const bundle = KeyHierarchyManager.generateAndWrapDEK(
          username,
          encryptionPublicKey,
          encryptionPrivateKey,
        );

        // Upload wrapped DEK to server
        await this.api.storeDEK(bundle.wrappedDEK, bundle.wrapNonce, bundle.version);
        console.log('✅ New DEK generated and uploaded');
      }

      // Try to restore encrypted profile
      await this.restoreProfile(username);

      return true;
    } catch (error) {
      console.error('❌ Secure profile initialization failed:', error);
      return false;
    }
  }

  /**
   * Save encrypted profile data.
   */
  async saveProfile(
    username: string,
    profileData: Record<string, any>,
  ): Promise<boolean> {
    try {
      const encrypted = await KeyHierarchyManager.encryptProfileData(username, profileData);
      if (!encrypted) return false;

      await this.api.updateEncryptedProfile({
        encrypted_data: encrypted.ciphertext,
        profile_nonce: encrypted.nonce,
        dek_version: encrypted.dekVersion,
        content_hash: encrypted.contentHash,
      });

      console.log('✅ Profile saved (encrypted)');
      return true;
    } catch (error) {
      console.error('❌ Profile save failed:', error);
      return false;
    }
  }

  /**
   * Restore and decrypt profile data.
   */
  async restoreProfile(username: string): Promise<Record<string, any> | null> {
    try {
      const serverProfile = await this.api.getEncryptedProfile();
      if (!serverProfile) return null;

      const decrypted = KeyHierarchyManager.decryptProfileData(
        username,
        serverProfile.encrypted_data,
        serverProfile.profile_nonce,
        serverProfile.dek_version,
      );

      if (decrypted) {
        console.log(`✅ Profile restored (v${serverProfile.profile_version})`);
      }
      return decrypted;
    } catch (error) {
      console.error('❌ Profile restore failed:', error);
      return null;
    }
  }

  /**
   * Perform key rotation.
   */
  async performKeyRotation(username: string, reason?: string): Promise<boolean> {
    try {
      const rotationData = KeyRotationManager.performRotation(username);
      if (!rotationData) return false;

      await this.api.rotateKeys({
        new_identity_key: rotationData.newIdentityKeyPair.publicKey,
        new_signed_prekey: rotationData.newSignedPrekey,
        new_signed_prekey_signature: rotationData.newSignedPrekeySignature,
        new_one_time_prekeys: rotationData.newOneTimePrekeys,
        rewrapped_dek: rotationData.rewrappedDEK,
        dek_wrap_nonce: rotationData.rewrappedDEKNonce,
        reason,
      });

      console.log('✅ Key rotation completed');
      return true;
    } catch (error) {
      console.error('❌ Key rotation failed:', error);
      return false;
    }
  }

  /**
   * Create a backup.
   */
  async createBackup(
    username: string,
    backupPassword: string,
    profileData: Record<string, any>,
    metadata: Record<string, any>,
  ): Promise<boolean> {
    try {
      const backupBundle = await KeyHierarchyManager.createBackupBundle(
        username,
        backupPassword,
        profileData,
        metadata,
      );

      if (!backupBundle) return false;

      await this.api.createBackup({
        backup_type: 'full',
        backup_data: backupBundle.encryptedBackup,
        backup_nonce: backupBundle.backupNonce,
        wrapped_dek: backupBundle.wrappedDEK,
        dek_wrap_nonce: backupBundle.dekWrapNonce,
        backup_key_hash: backupBundle.backupKeyHash,
      });

      console.log('✅ Encrypted backup created');
      return true;
    } catch (error) {
      console.error('❌ Backup creation failed:', error);
      return false;
    }
  }

  /**
   * Save encrypted metadata (chat settings, nicknames).
   */
  async saveMetadata(
    username: string,
    metadataType: string,
    metadata: Record<string, any>,
  ): Promise<boolean> {
    try {
      const encrypted = await KeyHierarchyManager.encryptMetadata(username, metadata);
      if (!encrypted) return false;

      await this.api.updateEncryptedMetadata({
        metadata_type: metadataType,
        encrypted_data: encrypted.ciphertext,
        metadata_nonce: encrypted.nonce,
        dek_version: encrypted.dekVersion,
        content_hash: encrypted.contentHash,
      });

      return true;
    } catch (error) {
      console.error('❌ Metadata save failed:', error);
      return false;
    }
  }

  /**
   * Get key info.
   */
  async getKeyInfo(): Promise<KeyInfoResponse | null> {
    try {
      return await this.api.getKeyInfo();
    } catch {
      return null;
    }
  }

  /**
   * Get rotation history.
   */
  async getRotationHistory(limit?: number): Promise<RotationHistoryEntry[]> {
    try {
      return await this.api.getRotationHistory(limit);
    } catch {
      return [];
    }
  }

  /**
   * Get profile versions.
   */
  async getProfileVersions(limit?: number): Promise<ProfileVersionInfo[]> {
    try {
      return await this.api.getProfileVersions(limit);
    } catch {
      return [];
    }
  }

  /**
   * Restore a specific profile version.
   */
  async restoreProfileVersion(
    username: string,
    version: number,
  ): Promise<Record<string, any> | null> {
    try {
      const serverProfile = await this.api.restoreProfileVersion(version);
      return KeyHierarchyManager.decryptProfileData(
        username,
        serverProfile.encrypted_data,
        serverProfile.profile_nonce,
        serverProfile.dek_version,
      );
    } catch (error) {
      console.error('❌ Profile version restore failed:', error);
      return null;
    }
  }
}

export const secureProfileService = new SecureProfileService();
export const secureProfileApi = new SecureProfileApi();
export default secureProfileApi;
