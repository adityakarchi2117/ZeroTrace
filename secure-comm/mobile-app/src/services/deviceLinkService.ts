/**
 * ZeroTrace Device Link Service (Mobile)
 * 
 * Multi-device sync: registration, QR pairing, DEK wrapping, key restore, device revocation.
 * Adapted from web version to use AsyncStorage and React Native APIs.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiClient } from './api';
import {
    wrapDEK, unwrapDEK,
    KeyHierarchyManager,
    DEKBundle,
} from './keyManager';

// ==================== Types ====================

export interface DeviceInfoType {
    id: number;
    device_id: string;
    device_name: string;
    device_type: string;
    device_fingerprint: string;
    is_primary: boolean;
    is_active: boolean;
    authorized_at: string;
    last_verified_at: string | null;
    last_ip: string | null;
}

export interface PairingQRPayload {
    type: 'zerotrace_pair';
    token: string;
    challenge: string;
    user_id: number;
    expires: string;
}

export interface PairInitResult {
    pairing_token: string;
    challenge: string;
    expires_at: string;
    qr_payload: string;
}

export interface PairStatusResult {
    status: 'pending' | 'scanned' | 'approved' | 'completed' | 'expired' | 'rejected';
    new_device_id: string | null;
    new_device_name: string | null;
    new_device_fingerprint: string | null;
    wrapped_dek_for_device: string | null;
    dek_wrap_nonce: string | null;
}

export interface SessionKeyEntry {
    id: number;
    user_id: number;
    conversation_id: string;
    wrapped_session_key: string;
    session_key_nonce: string;
    dek_version: number;
    key_version: number;
    is_active: boolean;
    first_message_id: string | null;
    last_message_id: string | null;
    created_at: string;
}

export interface KeyRestoreResult {
    wrapped_dek: string;
    wrap_nonce: string;
    dek_version: number;
    device_authorized: boolean;
    session_key_count: number;
    profile_version: number;
}

export interface RevokeResult {
    success: boolean;
    message: string;
    dek_rotated: boolean;
    new_dek_version: number | null;
}

// ==================== Device ID Management ====================

const DEVICE_ID_KEY = 'zerotrace_device_id';

export async function getOrCreateDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        const random = nacl.randomBytes(16);
        deviceId = `mobile-${encodeBase64(random).replace(/[+/=]/g, '').slice(0, 24)}`;
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

// ==================== Device Link API ====================

class DeviceLinkApi {
    async registerDevice(
        deviceId: string,
        deviceName: string = 'Mobile Device',
        deviceType: string = 'mobile',
        devicePublicKey: string = '',
    ): Promise<DeviceInfoType> {
        const response = await apiClient.post('/device/register', null, {
            params: { device_id: deviceId, device_name: deviceName, device_type: deviceType, device_public_key: devicePublicKey },
        });
        return response.data;
    }

    async initPairing(deviceId: string): Promise<PairInitResult> {
        const response = await apiClient.post('/device/pair/init', { device_id: deviceId });
        return response.data;
    }

    async scanPairing(
        pairingToken: string,
        deviceId: string,
        deviceName: string,
        deviceType: string,
        devicePublicKey: string,
    ): Promise<{ status: string; challenge: string; device_fingerprint: string; device_public_key: string; message: string }> {
        const response = await apiClient.post('/device/pair/scan', {
            pairing_token: pairingToken,
            device_id: deviceId,
            device_name: deviceName,
            device_type: deviceType,
            device_public_key: devicePublicKey,
        });
        return response.data;
    }

    async approvePairing(
        pairingToken: string,
        wrappedDek: string,
        dekWrapNonce: string,
    ): Promise<{ status: string; new_device_id: string; new_device_fingerprint: string; message: string }> {
        const response = await apiClient.post('/device/pair/approve', {
            pairing_token: pairingToken,
            wrapped_dek_for_device: wrappedDek,
            dek_wrap_nonce: dekWrapNonce,
        });
        return response.data;
    }

    async completePairing(pairingToken: string): Promise<{
        wrapped_dek: string;
        dek_wrap_nonce: string;
        dek_version: number;
        message: string;
    }> {
        const response = await apiClient.post('/device/pair/complete', { pairing_token: pairingToken });
        return response.data;
    }

    async getPairingStatus(pairingToken: string): Promise<PairStatusResult> {
        const response = await apiClient.get('/device/pair/status', {
            params: { pairing_token: pairingToken },
        });
        return response.data;
    }

    async listDevices(): Promise<{ devices: DeviceInfoType[]; total: number }> {
        const response = await apiClient.get('/device/list');
        return response.data;
    }

    async revokeDevice(
        deviceId: string,
        revokingDeviceId: string,
        reason: string = 'user_initiated',
        rotateDek: boolean = false,
    ): Promise<RevokeResult> {
        const response = await apiClient.post('/device/revoke', {
            device_id: deviceId,
            revoking_device_id: revokingDeviceId,
            reason,
            rotate_dek: rotateDek,
        });
        return response.data;
    }

    async getRevocationHistory(limit: number = 50): Promise<any[]> {
        const response = await apiClient.get('/device/revocation-history', { params: { limit } });
        return response.data;
    }

    async storeWrappedDEK(
        deviceId: string,
        wrappedDek: string,
        wrapNonce: string,
        dekVersion: number,
    ): Promise<any> {
        const response = await apiClient.post('/device/wrapped', null, {
            params: { device_id: deviceId, wrapped_dek: wrappedDek, wrap_nonce: wrapNonce, dek_version: dekVersion },
        });
        return response.data;
    }

    async getWrappedDEK(deviceId: string): Promise<any> {
        const response = await apiClient.get('/device/wrapped', { params: { device_id: deviceId } });
        return response.data;
    }

    async restoreKeys(deviceId: string, devicePublicKey: string): Promise<KeyRestoreResult> {
        const response = await apiClient.post('/device/restore', {
            device_id: deviceId,
            device_public_key: devicePublicKey,
        });
        return response.data;
    }

    async storeSessionKey(params: {
        conversation_id: string;
        wrapped_session_key: string;
        session_key_nonce: string;
        dek_version: number;
        key_version: number;
        first_message_id?: string;
    }): Promise<SessionKeyEntry> {
        const response = await apiClient.post('/device/session/store', params);
        return response.data;
    }

    async getSessionKeys(conversationId: string): Promise<SessionKeyEntry[]> {
        const response = await apiClient.get(`/device/session/${conversationId}`);
        return response.data;
    }

    async getAllSessionKeys(): Promise<SessionKeyEntry[]> {
        const response = await apiClient.get('/device/session');
        return response.data;
    }

    async rewrapSessionKeys(
        oldDekVersion: number,
        newDekVersion: number,
        rewrappedKeys: Array<{
            session_key_id: number;
            wrapped_session_key: string;
            session_key_nonce: string;
        }>,
    ): Promise<{ success: boolean; rewrapped_count: number }> {
        const response = await apiClient.post('/device/session/rewrap', {
            old_dek_version: oldDekVersion,
            new_dek_version: newDekVersion,
            rewrapped_keys: rewrappedKeys,
        });
        return response.data;
    }
}

// ==================== Device Link Service ====================

export class DeviceLinkService {
    private api = new DeviceLinkApi();
    private deviceId: string = '';

    async init(): Promise<void> {
        this.deviceId = await getOrCreateDeviceId();
    }

    getDeviceId(): string {
        return this.deviceId;
    }

    async registerPrimaryDevice(username: string, publicKey?: string): Promise<DeviceInfoType> {
        if (!this.deviceId) await this.init();
        const device = await this.api.registerDevice(
            this.deviceId,
            this.getDeviceName(),
            Platform.OS === 'ios' ? 'ios' : 'android',
            publicKey || this.deviceId,
        );
        console.log(`📱 Primary device registered: ${this.deviceId}`);
        return device;
    }

    async initiatePairing(): Promise<{ qrData: PairingQRPayload; token: string }> {
        if (!this.deviceId) await this.init();
        const result = await this.api.initPairing(this.deviceId);
        const qrData: PairingQRPayload = JSON.parse(result.qr_payload);
        return { qrData, token: result.pairing_token };
    }

    async approvePairing(
        pairingToken: string,
        username: string,
        newDevicePubKey: string,
    ): Promise<{ status: string; newDeviceId: string }> {
        const dekBundle = KeyHierarchyManager.getDEK(username);
        if (!dekBundle) throw new Error('No DEK available.');

        const dekBytes = decodeBase64(dekBundle.plaintextDEK);
        const newDevicePubKeyBytes = decodeBase64(newDevicePubKey);

        // Get our private key from secure storage
        const Keychain = require('react-native-keychain');
        const credentials = await Keychain.getGenericPassword({ service: 'cipherlink_private_key' });
        if (!credentials) throw new Error('Private key not available.');
        const ourPrivateKeyBytes = decodeBase64((credentials as any).password);

        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const wrappedForNewDevice = nacl.box(dekBytes, nonce, newDevicePubKeyBytes, ourPrivateKeyBytes);

        const result = await this.api.approvePairing(
            pairingToken,
            encodeBase64(wrappedForNewDevice),
            encodeBase64(nonce),
        );

        return { status: result.status, newDeviceId: result.new_device_id };
    }

    async pollPairingStatus(pairingToken: string): Promise<PairStatusResult> {
        return this.api.getPairingStatus(pairingToken);
    }

    startPairingPoller(
        pairingToken: string,
        onUpdate: (status: PairStatusResult) => void,
        intervalMs: number = 2000,
    ): { stop: () => void } {
        let active = true;
        const poll = async () => {
            while (active) {
                try {
                    const status = await this.api.getPairingStatus(pairingToken);
                    onUpdate(status);
                    if (['completed', 'expired', 'rejected'].includes(status.status)) {
                        active = false;
                        return;
                    }
                } catch (err) {
                    console.warn('Pairing poll error:', err);
                }
                await new Promise(r => setTimeout(r, intervalMs));
            }
        };
        poll();
        return { stop: () => { active = false; } };
    }

    async scanPairingQR(
        qrPayload: PairingQRPayload,
        publicKey: string,
    ): Promise<{ challenge: string; fingerprint: string; device_public_key: string }> {
        if (!this.deviceId) await this.init();
        const result = await this.api.scanPairing(
            qrPayload.token,
            this.deviceId,
            this.getDeviceName(),
            Platform.OS === 'ios' ? 'ios' : 'android',
            publicKey,
        );
        return {
            challenge: result.challenge,
            fingerprint: result.device_fingerprint,
            device_public_key: result.device_public_key
        };
    }

    async completePairingAsNewDevice(
        pairingToken: string,
        username: string,
        publicKey: string,
        privateKey: string,
    ): Promise<DEKBundle | null> {
        const result = await this.api.completePairing(pairingToken);
        const dekBytes = unwrapDEK(
            result.wrapped_dek,
            result.dek_wrap_nonce,
            decodeBase64(publicKey),
            decodeBase64(privateKey),
        );

        if (!dekBytes) {
            console.error('❌ Failed to unwrap DEK from pairing');
            return null;
        }

        const bundle: DEKBundle = {
            plaintextDEK: encodeBase64(dekBytes),
            wrappedDEK: result.wrapped_dek,
            wrapNonce: result.dek_wrap_nonce,
            version: result.dek_version,
            algorithm: 'x25519-xsalsa20-poly1305',
        };

        KeyHierarchyManager.saveDEKLocally(username, bundle);
        return bundle;
    }

    async restoreKeysOnLogin(username: string, publicKey: string, privateKey: string): Promise<{
        dekBundle: DEKBundle | null;
        sessionKeyCount: number;
        profileVersion: number;
        deviceAuthorized: boolean;
    }> {
        if (!this.deviceId) await this.init();
        try {
            const result = await this.api.restoreKeys(this.deviceId, publicKey);
            const dekBytes = unwrapDEK(
                result.wrapped_dek,
                result.wrap_nonce,
                decodeBase64(publicKey),
                decodeBase64(privateKey),
            );

            if (!dekBytes) {
                return {
                    dekBundle: null,
                    sessionKeyCount: result.session_key_count,
                    profileVersion: result.profile_version,
                    deviceAuthorized: result.device_authorized,
                };
            }

            const bundle: DEKBundle = {
                plaintextDEK: encodeBase64(dekBytes),
                wrappedDEK: result.wrapped_dek,
                wrapNonce: result.wrap_nonce,
                version: result.dek_version,
                algorithm: 'x25519-xsalsa20-poly1305',
            };

            KeyHierarchyManager.saveDEKLocally(username, bundle);
            return {
                dekBundle: bundle,
                sessionKeyCount: result.session_key_count,
                profileVersion: result.profile_version,
                deviceAuthorized: result.device_authorized,
            };
        } catch (err: any) {
            if (err?.response?.status === 404) {
                return { dekBundle: null, sessionKeyCount: 0, profileVersion: 0, deviceAuthorized: false };
            }
            throw err;
        }
    }

    async listDevices(): Promise<DeviceInfoType[]> {
        const result = await this.api.listDevices();
        return result.devices;
    }

    async revokeDevice(
        targetDeviceId: string,
        reason: string = 'user_initiated',
        rotateDek: boolean = false,
    ): Promise<RevokeResult> {
        if (!this.deviceId) await this.init();
        return this.api.revokeDevice(targetDeviceId, this.deviceId, reason, rotateDek);
    }

    async wrapAndStoreSessionKey(
        username: string,
        conversationId: string,
        sessionKeyBytes: Uint8Array,
        keyVersion: number = 1,
        firstMessageId?: string,
    ): Promise<SessionKeyEntry> {
        const dekBundle = KeyHierarchyManager.getDEK(username);
        if (!dekBundle) throw new Error('No DEK available to wrap session key.');

        const dekBytes = decodeBase64(dekBundle.plaintextDEK);
        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const wrappedKey = nacl.secretbox(sessionKeyBytes, nonce, dekBytes);

        return this.api.storeSessionKey({
            conversation_id: conversationId,
            wrapped_session_key: encodeBase64(wrappedKey),
            session_key_nonce: encodeBase64(nonce),
            dek_version: dekBundle.version,
            key_version: keyVersion,
            first_message_id: firstMessageId,
        });
    }

    async getAndUnwrapSessionKeys(
        username: string,
        conversationId: string,
    ): Promise<Array<{ keyVersion: number; sessionKey: Uint8Array; firstMsgId: string | null; lastMsgId: string | null }>> {
        const dekBundle = KeyHierarchyManager.getDEK(username);
        if (!dekBundle) throw new Error('No DEK available to unwrap session keys.');

        const dekBytes = decodeBase64(dekBundle.plaintextDEK);
        const entries = await this.api.getSessionKeys(conversationId);
        const unwrapped: Array<{ keyVersion: number; sessionKey: Uint8Array; firstMsgId: string | null; lastMsgId: string | null }> = [];

        for (const entry of entries) {
            try {
                const wrappedBytes = decodeBase64(entry.wrapped_session_key);
                const nonceBytes = decodeBase64(entry.session_key_nonce);
                const sessionKey = nacl.secretbox.open(wrappedBytes, nonceBytes, dekBytes);
                if (sessionKey) {
                    unwrapped.push({
                        keyVersion: entry.key_version,
                        sessionKey,
                        firstMsgId: entry.first_message_id,
                        lastMsgId: entry.last_message_id,
                    });
                }
            } catch (err) {
                console.warn(`⚠️ Error unwrapping session key:`, err);
            }
        }
        return unwrapped;
    }

    private getDeviceName(): string {
        return `${Platform.OS.charAt(0).toUpperCase() + Platform.OS.slice(1)} Device`;
    }
}

// ==================== Singleton Exports ====================

export const deviceLinkService = new DeviceLinkService();
export const deviceLinkApi = new DeviceLinkApi();
