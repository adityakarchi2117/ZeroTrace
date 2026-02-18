/**
 * ZeroTrace Secure Profile API (Mobile)
 * 
 * Client-side encrypted profile management.
 * All encryption/decryption happens locally.
 */

import { apiClient } from './api';
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
    async storeDEK(wrappedDEK: string, wrapNonce: string, keyVersion: number): Promise<DEKResponse> {
        const response = await apiClient.post('/secure/dek/store', {
            wrapped_dek: wrappedDEK,
            wrap_nonce: wrapNonce,
            key_version: keyVersion,
            algorithm: 'x25519-xsalsa20-poly1305',
        });
        return response.data;
    }

    async getActiveDEK(): Promise<DEKResponse | null> {
        try {
            const response = await apiClient.get('/secure/dek/active');
            return response.data;
        } catch (error: any) {
            if (error?.response?.status === 404) return null;
            throw error;
        }
    }

    async rotateKeys(params: {
        new_identity_key: string;
        new_signed_prekey: string;
        new_signed_prekey_signature: string;
        new_one_time_prekeys: string[];
        rewrapped_dek: string;
        dek_wrap_nonce: string;
        reason?: string;
    }): Promise<any> {
        const response = await apiClient.post('/secure/keys/rotate', params);
        return response.data;
    }

    async getKeyInfo(): Promise<KeyInfoResponse> {
        const response = await apiClient.get('/secure/keys/info');
        return response.data;
    }

    async getRotationHistory(limit: number = 20): Promise<RotationHistoryEntry[]> {
        const response = await apiClient.get(`/secure/keys/rotation-history?limit=${limit}`);
        return response.data;
    }

    async updateEncryptedProfile(params: {
        encrypted_data: string;
        profile_nonce: string;
        dek_version: number;
        content_hash: string;
        schema_version?: string;
    }): Promise<EncryptedProfileResponse> {
        const response = await apiClient.post('/secure/profile/secure/update', params);
        return response.data;
    }

    async getEncryptedProfile(): Promise<EncryptedProfileResponse | null> {
        try {
            const response = await apiClient.get('/secure/profile/secure');
            return response.data;
        } catch (error: any) {
            if (error?.response?.status === 404) return null;
            throw error;
        }
    }

    async getProfileVersions(limit: number = 10): Promise<ProfileVersionInfo[]> {
        const response = await apiClient.get(`/secure/profile/versions?limit=${limit}`);
        return response.data;
    }

    async restoreProfileVersion(version: number): Promise<EncryptedProfileResponse> {
        const response = await apiClient.post('/secure/profile/restore', { version });
        return response.data;
    }

    async uploadEncryptedPhoto(params: {
        encrypted_data: string;
        photo_nonce: string;
        dek_version: number;
        content_hash: string;
        mime_type: string;
        encrypted_size: number;
        original_size: number;
    }): Promise<any> {
        const response = await apiClient.post('/secure/profile/secure/photo', params);
        return response.data;
    }

    async updateEncryptedMetadata(params: {
        metadata_type: string;
        encrypted_data: string;
        metadata_nonce: string;
        dek_version: number;
        content_hash: string;
    }): Promise<any> {
        const response = await apiClient.post('/secure/metadata/secure/update', params);
        return response.data;
    }

    async createBackup(params: {
        backup_type: string;
        backup_data: string;
        backup_nonce: string;
        wrapped_dek: string;
        dek_wrap_nonce: string;
        backup_key_hash: string;
    }): Promise<BackupResponse> {
        const response = await apiClient.post('/secure/backup/create', params);
        return response.data;
    }

    async restoreBackup(backupId: number): Promise<BackupResponse> {
        const response = await apiClient.post('/secure/backup/restore', { backup_id: backupId });
        return response.data;
    }

    async listBackups(): Promise<BackupResponse[]> {
        const response = await apiClient.get('/secure/backup/list');
        return response.data;
    }

    async requestDeviceSync(params: {
        device_id: string;
        device_public_key: string;
        sync_type?: string;
    }): Promise<any> {
        const response = await apiClient.post('/secure/sync/device', params);
        return response.data;
    }
}

// ==================== High-Level Service ====================

export class SecureProfileService {
    private api = new SecureProfileApi();

    async initializeOnLogin(
        username: string,
        encryptionPublicKey: string,
        encryptionPrivateKey: string,
    ): Promise<boolean> {
        try {
            const serverDEK = await this.api.getActiveDEK();
            if (serverDEK) {
                const bundle = KeyHierarchyManager.unwrapAndCacheDEK(
                    username,
                    serverDEK.wrapped_dek,
                    serverDEK.wrap_nonce,
                    serverDEK.key_version,
                    encryptionPublicKey,
                    encryptionPrivateKey,
                );
                if (!bundle) return false;
            } else {
                const bundle = KeyHierarchyManager.generateAndWrapDEK(
                    username,
                    encryptionPublicKey,
                    encryptionPrivateKey,
                );
                await this.api.storeDEK(bundle.wrappedDEK, bundle.wrapNonce, bundle.version);
            }

            await this.restoreProfile(username);
            return true;
        } catch (error) {
            console.error('❌ Secure profile init failed:', error);
            return false;
        }
    }

    async saveProfile(username: string, profileData: Record<string, any>): Promise<boolean> {
        try {
            const encrypted = await KeyHierarchyManager.encryptProfileData(username, profileData);
            if (!encrypted) return false;

            await this.api.updateEncryptedProfile({
                encrypted_data: encrypted.ciphertext,
                profile_nonce: encrypted.nonce,
                dek_version: encrypted.dekVersion,
                content_hash: encrypted.contentHash,
            });
            return true;
        } catch {
            return false;
        }
    }

    async restoreProfile(username: string): Promise<Record<string, any> | null> {
        try {
            const serverProfile = await this.api.getEncryptedProfile();
            if (!serverProfile) return null;
            return KeyHierarchyManager.decryptProfileData(
                username,
                serverProfile.encrypted_data,
                serverProfile.profile_nonce,
                serverProfile.dek_version,
            );
        } catch {
            return null;
        }
    }

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
            return true;
        } catch {
            return false;
        }
    }

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
            return true;
        } catch {
            return false;
        }
    }

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
        } catch {
            return false;
        }
    }

    async listBackups(): Promise<BackupResponse[]> {
        try { return await this.api.listBackups(); } catch { return []; }
    }

    async getKeyInfo(): Promise<KeyInfoResponse | null> {
        try { return await this.api.getKeyInfo(); } catch { return null; }
    }

    async getRotationHistory(limit?: number): Promise<RotationHistoryEntry[]> {
        try { return await this.api.getRotationHistory(limit); } catch { return []; }
    }

    async getProfileVersions(limit?: number): Promise<ProfileVersionInfo[]> {
        try { return await this.api.getProfileVersions(limit); } catch { return []; }
    }

    async restoreProfileVersion(username: string, version: number): Promise<Record<string, any> | null> {
        try {
            const serverProfile = await this.api.restoreProfileVersion(version);
            return KeyHierarchyManager.decryptProfileData(
                username,
                serverProfile.encrypted_data,
                serverProfile.profile_nonce,
                serverProfile.dek_version,
            );
        } catch { return null; }
    }
}

export const secureProfileService = new SecureProfileService();
export const secureProfileApi = new SecureProfileApi();
