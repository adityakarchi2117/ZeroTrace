/**
 * ZeroTrace Device Link Service
 * 
 * Manages multi-device synchronization:
 *   - Device registration (first device = primary)
 *   - Device pairing via QR code exchange
 *   - Per-device DEK wrapping/unwrapping
 *   - Key restore on login
 *   - Device revocation + DEK rotation
 *   - Session key storage & re-wrapping
 * 
 * SECURITY:
 *   - Server NEVER sees plaintext keys
 *   - DEK is re-wrapped per-device using NaCl box (X25519)
 *   - Session keys are wrapped with DEK using NaCl secretbox
 *   - Revocation invalidates old wrapped DEK immediately
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { api as apiClient } from './api';
import { KeyStorage, generateFingerprint } from './crypto';
import {
  wrapDEK, unwrapDEK,
  encryptWithDEK, decryptWithDEK,
  KeyHierarchyManager,
  DEKBundle,
} from './keyManager';

// ==================== Types ====================

export interface DeviceInfo {
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

/**
 * Generate or retrieve a stable device identifier.
 * Persisted in localStorage so it survives page reloads.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    // SSR fallback – real ID is resolved client-side
    return 'ssr-placeholder';
  }
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    const random = nacl.randomBytes(16);
    deviceId = `web-${encodeBase64(random).replace(/[+/=]/g, '').slice(0, 24)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Generate a fingerprint for a device's public key.
 */
export function getDeviceFingerprint(publicKey: string): string {
  return generateFingerprint(publicKey);
}

// ==================== Device Link API ====================

class DeviceLinkApi {
  private get http() {
    return apiClient.http;
  }

  // ── Device Registration ──

  async registerDevice(
    deviceId: string,
    deviceName: string = 'Web Browser',
    deviceType: string = 'web',
    devicePublicKey: string = '',
  ): Promise<DeviceInfo> {
    const response = await this.http.post('/api/device/register', null, {
      params: { device_id: deviceId, device_name: deviceName, device_type: deviceType, device_public_key: devicePublicKey },
    });
    return response.data;
  }

  // ── Pairing Flow ──

  async initPairing(deviceId: string): Promise<PairInitResult> {
    const response = await this.http.post('/api/device/pair/init', { device_id: deviceId });
    return response.data;
  }

  async scanPairing(
    pairingToken: string,
    deviceId: string,
    deviceName: string,
    deviceType: string,
    devicePublicKey: string,
  ): Promise<{ status: string; challenge: string; device_fingerprint: string; message: string }> {
    const response = await this.http.post('/api/device/pair/scan', {
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
    const response = await this.http.post('/api/device/pair/approve', {
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
    const response = await this.http.post('/api/device/pair/complete', { pairing_token: pairingToken });
    return response.data;
  }

  async getPairingStatus(pairingToken: string): Promise<PairStatusResult> {
    const response = await this.http.get('/api/device/pair/status', {
      params: { pairing_token: pairingToken },
    });
    return response.data;
  }

  // ── Device Management ──

  async listDevices(): Promise<{ devices: DeviceInfo[]; total: number }> {
    const response = await this.http.get('/api/device/list');
    return response.data;
  }

  async revokeDevice(
    deviceId: string,
    revokingDeviceId: string,
    reason: string = 'user_initiated',
    rotateDek: boolean = false,
  ): Promise<RevokeResult> {
    const response = await this.http.post('/api/device/revoke', {
      device_id: deviceId,
      revoking_device_id: revokingDeviceId,
      reason,
      rotate_dek: rotateDek,
    });
    return response.data;
  }

  async getRevocationHistory(limit: number = 50): Promise<any[]> {
    const response = await this.http.get('/api/device/revocation-history', {
      params: { limit },
    });
    return response.data;
  }

  // ── Per-Device Wrapped DEK ──

  async storeWrappedDEK(
    deviceId: string,
    wrappedDek: string,
    wrapNonce: string,
    dekVersion: number,
  ): Promise<any> {
    const response = await this.http.post('/api/device/wrapped', null, {
      params: { device_id: deviceId, wrapped_dek: wrappedDek, wrap_nonce: wrapNonce, dek_version: dekVersion },
    });
    return response.data;
  }

  async getWrappedDEK(deviceId: string): Promise<any> {
    const response = await this.http.get('/api/device/wrapped', {
      params: { device_id: deviceId },
    });
    return response.data;
  }

  // ── Key Restore ──

  async restoreKeys(deviceId: string, devicePublicKey: string): Promise<KeyRestoreResult> {
    const response = await this.http.post('/api/device/restore', {
      device_id: deviceId,
      device_public_key: devicePublicKey,
    });
    return response.data;
  }

  // ── Session Keys ──

  async storeSessionKey(params: {
    conversation_id: string;
    wrapped_session_key: string;
    session_key_nonce: string;
    dek_version: number;
    key_version: number;
    first_message_id?: string;
  }): Promise<SessionKeyEntry> {
    const response = await this.http.post('/api/device/session/store', params);
    return response.data;
  }

  async getSessionKeys(conversationId: string): Promise<SessionKeyEntry[]> {
    const response = await this.http.get(`/api/device/session/${conversationId}`);
    return response.data;
  }

  async getAllSessionKeys(): Promise<SessionKeyEntry[]> {
    const response = await this.http.get('/api/device/session');
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
    const response = await this.http.post('/api/device/session/rewrap', {
      old_dek_version: oldDekVersion,
      new_dek_version: newDekVersion,
      rewrapped_keys: rewrappedKeys,
    });
    return response.data;
  }
}

// ==================== Device Link Service (Orchestrator) ====================

/**
 * High-level orchestrator for multi-device operations.
 * 
 * Coordinates between:
 *   - DeviceLinkApi (server calls)
 *   - KeyHierarchyManager (local key ops)
 *   - NaCl crypto (wrapping / unwrapping)
 */
export class DeviceLinkService {
  private api = new DeviceLinkApi();
  private deviceId: string;

  constructor() {
    this.deviceId = getOrCreateDeviceId();
  }

  /**
   * Get the current device's stable ID.
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  // ── First Login: Register Primary Device ──

  /**
   * Register this device as the primary device.
   * Called on first login when no devices exist.
   * 
   * @returns device info from server
   */
  async registerPrimaryDevice(username: string): Promise<DeviceInfo> {
    const keys = KeyStorage.load(username);
    const publicKey = keys?.publicKey || this.deviceId;

    const device = await this.api.registerDevice(
      this.deviceId,
      this.getDeviceName(),
      'web',
      publicKey,
    );
    console.log(`📱 Primary device registered: ${this.deviceId}`);
    return device;
  }

  // ── Pairing Flow (Existing Device Side) ──

  /**
   * Step 1: Initiate pairing from this (existing) device.
   * Returns QR data to display.
   */
  async initiatePairing(): Promise<{ qrData: PairingQRPayload; token: string }> {
    const result = await this.api.initPairing(this.deviceId);
    const qrData: PairingQRPayload = JSON.parse(result.qr_payload);
    return { qrData, token: result.pairing_token };
  }

  /**
   * Step 3: Approve pairing from this (existing) device.
   * Re-wraps the DEK for the new device's public key.
   * 
   * @param pairingToken  - The pairing session token
   * @param username      - Current user's username
   * @param newDevicePubKey - The new device's X25519 public key (base64)
   */
  async approvePairing(
    pairingToken: string,
    username: string,
    newDevicePubKey: string,
  ): Promise<{ status: string; newDeviceId: string }> {
    // Get local DEK bundle
    const dekBundle = KeyHierarchyManager.getDEK(username);
    if (!dekBundle) {
      throw new Error('No DEK available. Cannot approve pairing without DEK.');
    }

    // Get local encryption keys
    const keys = KeyStorage.load(username);
    if (!keys || !keys.privateKey) {
      throw new Error('Encryption keys not available.');
    }

    // Unwrap the plaintext DEK
    const dekBytes = decodeBase64(dekBundle.plaintextDEK);

    // Re-wrap DEK for the NEW device's public key
    // We use nacl.box: encrypt dekBytes with (newDevicePubKey, our privateKey)
    const newDevicePubKeyBytes = decodeBase64(newDevicePubKey);
    const ourPrivateKeyBytes = decodeBase64(keys.privateKey);

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const wrappedForNewDevice = nacl.box(
      dekBytes,
      nonce,
      newDevicePubKeyBytes,
      ourPrivateKeyBytes,
    );

    const result = await this.api.approvePairing(
      pairingToken,
      encodeBase64(wrappedForNewDevice),
      encodeBase64(nonce),
    );

    console.log(`✅ Pairing approved for device ${result.new_device_id}`);
    return {
      status: result.status,
      newDeviceId: result.new_device_id,
    };
  }

  /**
   * Poll pairing status (for UI progress updates).
   */
  async pollPairingStatus(pairingToken: string): Promise<PairStatusResult> {
    return this.api.getPairingStatus(pairingToken);
  }

  /**
   * Start polling pairing status until terminal state.
   * Returns a disposable poller.
   */
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

  // ── Pairing Flow (New Device Side) ──

  /**
   * Step 2: New device scans QR code.
   * Sends its public key to the server.
   */
  async scanPairingQR(
    qrPayload: PairingQRPayload,
    username: string,
  ): Promise<{ challenge: string; fingerprint: string }> {
    const keys = KeyStorage.load(username);
    const publicKey = keys?.publicKey || '';

    const result = await this.api.scanPairing(
      qrPayload.token,
      this.deviceId,
      this.getDeviceName(),
      'web',
      publicKey,
    );

    return {
      challenge: result.challenge,
      fingerprint: result.device_fingerprint,
    };
  }

  /**
   * Step 4: New device completes pairing.
   * Receives wrapped DEK, unwraps it, and caches locally.
   */
  async completePairingAsNewDevice(
    pairingToken: string,
    username: string,
  ): Promise<DEKBundle | null> {
    const keys = KeyStorage.load(username);
    if (!keys || !keys.privateKey || !keys.publicKey) {
      throw new Error('Encryption keys not available to unwrap DEK.');
    }

    const result = await this.api.completePairing(pairingToken);

    // Unwrap the DEK that was wrapped for our public key
    const dekBytes = unwrapDEK(
      result.wrapped_dek,
      result.dek_wrap_nonce,
      decodeBase64(keys.publicKey),
      decodeBase64(keys.privateKey),
    );

    if (!dekBytes) {
      console.error('❌ Failed to unwrap DEK from pairing');
      return null;
    }

    // Cache DEK bundle locally
    const bundle: DEKBundle = {
      plaintextDEK: encodeBase64(dekBytes),
      wrappedDEK: result.wrapped_dek,
      wrapNonce: result.dek_wrap_nonce,
      version: result.dek_version,
      algorithm: 'x25519-xsalsa20-poly1305',
    };

    KeyHierarchyManager.saveDEKLocally(username, bundle);
    console.log(`🔗 DEK received via pairing (v${result.dek_version})`);
    return bundle;
  }

  // ── Key Restore on Login ──

  /**
   * Restore DEK on login.
   * 
   * Flow:
   * 1. Ask server for wrapped DEK (per-device or user-level)
   * 2. Unwrap with local encryption keys
   * 3. Cache locally
   * 4. Return session info (session key count, profile version)
   */
  async restoreKeysOnLogin(username: string): Promise<{
    dekBundle: DEKBundle | null;
    sessionKeyCount: number;
    profileVersion: number;
    deviceAuthorized: boolean;
  }> {
    const keys = KeyStorage.load(username);
    if (!keys || !keys.publicKey) {
      return { dekBundle: null, sessionKeyCount: 0, profileVersion: 0, deviceAuthorized: false };
    }

    try {
      const result = await this.api.restoreKeys(this.deviceId, keys.publicKey);

      // Unwrap DEK
      const dekBytes = unwrapDEK(
        result.wrapped_dek,
        result.wrap_nonce,
        decodeBase64(keys.publicKey),
        decodeBase64(keys.privateKey || ''),
      );

      if (!dekBytes) {
        console.error('❌ Key restore: failed to unwrap DEK');
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
        // No DEK on server — first-time user, will generate fresh
        return { dekBundle: null, sessionKeyCount: 0, profileVersion: 0, deviceAuthorized: false };
      }
      throw err;
    }
  }

  // ── Device Management ──

  async listDevices(): Promise<DeviceInfo[]> {
    const result = await this.api.listDevices();
    return result.devices;
  }

  /**
   * Revoke a device.
   * If rotateDek=true, the caller must then re-wrap & re-upload DEK.
   */
  async revokeDevice(
    targetDeviceId: string,
    reason: string = 'user_initiated',
    rotateDek: boolean = false,
  ): Promise<RevokeResult> {
    return this.api.revokeDevice(targetDeviceId, this.deviceId, reason, rotateDek);
  }

  /**
   * Revoke a device AND rotate the DEK + re-wrap session keys.
   * Full security flow — called when a device may be compromised.
   */
  async revokeWithFullRotation(
    targetDeviceId: string,
    username: string,
    reason: string = 'security',
  ): Promise<{
    revokeResult: RevokeResult;
    newDekBundle: DEKBundle;
    rewrappedCount: number;
  }> {
    // 1. Revoke device with DEK rotation flag
    const revokeResult = await this.revokeDevice(targetDeviceId, reason, true);

    // 2. Generate new DEK
    const keys = KeyStorage.load(username);
    if (!keys || !keys.publicKey || !keys.privateKey) {
      throw new Error('Cannot rotate DEK: encryption keys not available.');
    }

    const newVersion = revokeResult.new_dek_version || (
      (KeyHierarchyManager.getDEK(username)?.version || 0) + 1
    );

    const newDekBundle = KeyHierarchyManager.generateAndWrapDEK(
      username,
      keys.publicKey,
      keys.privateKey,
      newVersion,
    );

    // 3. Re-wrap all session keys with new DEK
    const rewrappedCount = await this.rewrapAllSessionKeys(
      username,
      newDekBundle.version - 1,
      newDekBundle,
    );

    // 4. Upload new per-device wrapped DEK
    await this.api.storeWrappedDEK(
      this.deviceId,
      newDekBundle.wrappedDEK,
      newDekBundle.wrapNonce,
      newDekBundle.version,
    );

    console.log(`🔄 Full rotation complete: DEK v${newVersion}, ${rewrappedCount} session keys re-wrapped`);

    return { revokeResult, newDekBundle, rewrappedCount };
  }

  // ── Session Key Operations ──

  /**
   * Wrap a session key with the DEK and store it on the server.
   * Called when a new conversation session key is established.
   */
  async wrapAndStoreSessionKey(
    username: string,
    conversationId: string,
    sessionKeyBytes: Uint8Array,
    keyVersion: number = 1,
    firstMessageId?: string,
  ): Promise<SessionKeyEntry> {
    const dekBundle = KeyHierarchyManager.getDEK(username);
    if (!dekBundle) {
      throw new Error('No DEK available to wrap session key.');
    }

    const dekBytes = decodeBase64(dekBundle.plaintextDEK);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    // Wrap session key with DEK (secretbox)
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

  /**
   * Retrieve and unwrap session keys for a conversation.
   * Needed to decrypt old message history on a new device.
   */
  async getAndUnwrapSessionKeys(
    username: string,
    conversationId: string,
  ): Promise<Array<{ keyVersion: number; sessionKey: Uint8Array; firstMsgId: string | null; lastMsgId: string | null }>> {
    const dekBundle = KeyHierarchyManager.getDEK(username);
    if (!dekBundle) {
      throw new Error('No DEK available to unwrap session keys.');
    }

    const dekBytes = decodeBase64(dekBundle.plaintextDEK);
    const entries = await this.api.getSessionKeys(conversationId);

    const unwrapped: Array<{
      keyVersion: number;
      sessionKey: Uint8Array;
      firstMsgId: string | null;
      lastMsgId: string | null;
    }> = [];

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
        } else {
          console.warn(`⚠️ Failed to unwrap session key v${entry.key_version} for ${conversationId}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error unwrapping session key:`, err);
      }
    }

    return unwrapped;
  }

  /**
   * Re-wrap all session keys from an old DEK version to a new DEK.
   * Called after DEK rotation.
   */
  async rewrapAllSessionKeys(
    username: string,
    oldDekVersion: number,
    newDekBundle: DEKBundle,
  ): Promise<number> {
    // Get all session keys
    const allKeys = await this.api.getAllSessionKeys();

    // Filter keys that need re-wrapping
    const toRewrap = allKeys.filter(k => k.dek_version === oldDekVersion);

    if (toRewrap.length === 0) {
      return 0;
    }

    // Get old DEK (from local cache — might need fallback handling)
    const oldDekBundle = KeyHierarchyManager.getDEK(username);
    if (!oldDekBundle) {
      console.warn('⚠️ Old DEK not available for re-wrapping');
      return 0;
    }

    const oldDekBytes = decodeBase64(oldDekBundle.plaintextDEK);
    const newDekBytes = decodeBase64(newDekBundle.plaintextDEK);

    const rewrapped: Array<{
      session_key_id: number;
      wrapped_session_key: string;
      session_key_nonce: string;
    }> = [];

    for (const entry of toRewrap) {
      try {
        // Unwrap with old DEK
        const wrappedBytes = decodeBase64(entry.wrapped_session_key);
        const oldNonce = decodeBase64(entry.session_key_nonce);
        const sessionKey = nacl.secretbox.open(wrappedBytes, oldNonce, oldDekBytes);

        if (!sessionKey) {
          console.warn(`⚠️ Could not unwrap session key ${entry.id} with old DEK`);
          continue;
        }

        // Re-wrap with new DEK
        const newNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const newWrapped = nacl.secretbox(sessionKey, newNonce, newDekBytes);

        rewrapped.push({
          session_key_id: entry.id,
          wrapped_session_key: encodeBase64(newWrapped),
          session_key_nonce: encodeBase64(newNonce),
        });
      } catch (err) {
        console.warn(`⚠️ Error re-wrapping session key ${entry.id}:`, err);
      }
    }

    if (rewrapped.length > 0) {
      const result = await this.api.rewrapSessionKeys(oldDekVersion, newDekBundle.version, rewrapped);
      return result.rewrapped_count;
    }

    return 0;
  }

  // ── Helpers ──

  private getDeviceName(): string {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (ua.includes('Chrome')) return 'Chrome Browser';
      if (ua.includes('Firefox')) return 'Firefox Browser';
      if (ua.includes('Safari')) return 'Safari Browser';
      if (ua.includes('Edge')) return 'Edge Browser';
      return 'Web Browser';
    }
    return 'Web Browser';
  }
}

// ==================== Singleton Export ====================

export const deviceLinkService = new DeviceLinkService();
export const deviceLinkApi = new DeviceLinkApi();
