/**
 * ZeroTrace Key Hierarchy Manager (Mobile)
 * 
 * Implements the 3-layer key system:
 *   1. Identity Key (Long-Term) - Ed25519 for auth & verification
 *   2. Data Encryption Key (DEK) - For profile & settings, rotatable
 *   3. Session Keys - For messages (handled by existing crypto.ts)
 * 
 * Key hierarchy:
 *   Identity Key
 *     ↓ wraps
 *   Data Encryption Key (DEK)
 *     ↓ encrypts
 *   Profile / Metadata
 * 
 * SECURITY: All encryption/decryption happens client-side.
 * Server NEVER sees plaintext keys or data.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==================== Types ====================

export interface DEKBundle {
    /** The raw DEK (32 bytes, base64 encoded) — NEVER sent to server */
    plaintextDEK: string;
    /** DEK encrypted (wrapped) with identity key, base64 — stored on server */
    wrappedDEK: string;
    /** Nonce used for wrapping, base64 */
    wrapNonce: string;
    /** Monotonically increasing version */
    version: number;
    /** Algorithm identifier */
    algorithm: string;
}

export interface EncryptedBlob {
    /** Encrypted data, base64 */
    ciphertext: string;
    /** Nonce used for encryption, base64 */
    nonce: string;
    /** DEK version used */
    dekVersion: number;
    /** SHA-256 hash of plaintext for integrity */
    contentHash: string;
}

export interface KeyHierarchyState {
    identityPrivateKey: string;
    identityPublicKey: string;
    encryptionPrivateKey: string;
    encryptionPublicKey: string;
    dek: DEKBundle | null;
}

// ==================== DEK Operations ====================

export function generateDEK(): Uint8Array {
    return nacl.randomBytes(nacl.secretbox.keyLength);
}

export function wrapDEK(
    plaintextDEK: Uint8Array,
    encryptionPublicKey: Uint8Array,
    encryptionPrivateKey: Uint8Array,
): { wrappedDEK: string; nonce: string } {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(
        plaintextDEK,
        nonce,
        encryptionPublicKey,
        encryptionPrivateKey,
    );
    return {
        wrappedDEK: encodeBase64(encrypted),
        nonce: encodeBase64(nonce),
    };
}

export function unwrapDEK(
    wrappedDEK: string,
    nonce: string,
    encryptionPublicKey: Uint8Array,
    encryptionPrivateKey: Uint8Array,
): Uint8Array | null {
    try {
        const encrypted = decodeBase64(wrappedDEK);
        const nonceBytes = decodeBase64(nonce);
        return nacl.box.open(encrypted, nonceBytes, encryptionPublicKey, encryptionPrivateKey);
    } catch (error) {
        console.error('❌ DEK unwrap failed:', error);
        return null;
    }
}

export function encryptWithDEK(
    plaintext: string,
    dekBytes: Uint8Array,
): { ciphertext: string; nonce: string } {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(plaintext);
    const encrypted = nacl.secretbox(messageBytes, nonce, dekBytes);
    return {
        ciphertext: encodeBase64(encrypted),
        nonce: encodeBase64(nonce),
    };
}

export function decryptWithDEK(
    ciphertext: string,
    nonce: string,
    dekBytes: Uint8Array,
): string | null {
    try {
        const cipherBytes = decodeBase64(ciphertext);
        const nonceBytes = decodeBase64(nonce);
        const decrypted = nacl.secretbox.open(cipherBytes, nonceBytes, dekBytes);
        if (!decrypted) return null;
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        console.error('❌ DEK decryption failed:', error);
        return null;
    }
}

export function encryptFileWithDEK(
    fileData: Uint8Array,
    dekBytes: Uint8Array,
): { ciphertext: Uint8Array; nonce: string } {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encrypted = nacl.secretbox(fileData, nonce, dekBytes);
    return { ciphertext: encrypted, nonce: encodeBase64(nonce) };
}

export function decryptFileWithDEK(
    ciphertext: Uint8Array,
    nonce: string,
    dekBytes: Uint8Array,
): Uint8Array | null {
    try {
        const nonceBytes = decodeBase64(nonce);
        return nacl.secretbox.open(ciphertext, nonceBytes, dekBytes);
    } catch {
        return null;
    }
}

// ==================== Content Hash ====================

export async function hashContent(content: string): Promise<string> {
    // React Native: use nacl.hash (SHA-512) then truncate
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBytes = nacl.hash(data);
    return encodeBase64(hashBytes.slice(0, 32));
}

export async function hashFileContent(data: Uint8Array): Promise<string> {
    const hashBytes = nacl.hash(data);
    return encodeBase64(hashBytes.slice(0, 32));
}

// ==================== Key Hierarchy Manager ====================

export class KeyHierarchyManager {
    private static DEK_STORAGE_KEY = 'zerotrace_dek';
    private static _memoryCache: Record<string, DEKBundle> = {};

    static generateAndWrapDEK(
        username: string,
        encryptionPublicKey: string,
        encryptionPrivateKey: string,
        version: number = 1,
    ): DEKBundle {
        const pubKeyBytes = decodeBase64(encryptionPublicKey);
        const privKeyBytes = decodeBase64(encryptionPrivateKey);
        const dekBytes = generateDEK();
        const { wrappedDEK, nonce } = wrapDEK(dekBytes, pubKeyBytes, privKeyBytes);

        const bundle: DEKBundle = {
            plaintextDEK: encodeBase64(dekBytes),
            wrappedDEK,
            wrapNonce: nonce,
            version,
            algorithm: 'x25519-xsalsa20-poly1305',
        };

        this.saveDEKLocally(username, bundle);
        console.log(`🔑 DEK generated and wrapped (v${version})`);
        return bundle;
    }

    static unwrapAndCacheDEK(
        username: string,
        wrappedDEK: string,
        nonce: string,
        version: number,
        encryptionPublicKey: string,
        encryptionPrivateKey: string,
    ): DEKBundle | null {
        const pubKeyBytes = decodeBase64(encryptionPublicKey);
        const privKeyBytes = decodeBase64(encryptionPrivateKey);
        const dekBytes = unwrapDEK(wrappedDEK, nonce, pubKeyBytes, privKeyBytes);

        if (!dekBytes) {
            console.error('❌ Failed to unwrap DEK');
            return null;
        }

        const bundle: DEKBundle = {
            plaintextDEK: encodeBase64(dekBytes),
            wrappedDEK,
            wrapNonce: nonce,
            version,
            algorithm: 'x25519-xsalsa20-poly1305',
        };

        this.saveDEKLocally(username, bundle);
        console.log(`🔓 DEK unwrapped and cached (v${version})`);
        return bundle;
    }

    static rewrapDEKForRotation(
        username: string,
        _oldEncryptionPublicKey: string,
        _oldEncryptionPrivateKey: string,
        newEncryptionPublicKey: string,
        newEncryptionPrivateKey: string,
    ): { newWrappedDEK: string; newNonce: string; dekVersion: number } | null {
        const cached = this._memoryCache[username];
        if (!cached || !cached.plaintextDEK) {
            console.error('❌ No cached DEK for re-wrapping');
            return null;
        }

        const dekBytes = decodeBase64(cached.plaintextDEK);
        const newPubKeyBytes = decodeBase64(newEncryptionPublicKey);
        const newPrivKeyBytes = decodeBase64(newEncryptionPrivateKey);
        const { wrappedDEK, nonce } = wrapDEK(dekBytes, newPubKeyBytes, newPrivKeyBytes);

        const updatedBundle: DEKBundle = {
            ...cached,
            wrappedDEK,
            wrapNonce: nonce,
        };
        this.saveDEKLocally(username, updatedBundle);

        return {
            newWrappedDEK: wrappedDEK,
            newNonce: nonce,
            dekVersion: cached.version,
        };
    }

    static async encryptProfileData(
        username: string,
        profileData: Record<string, any>,
    ): Promise<EncryptedBlob | null> {
        const dek = this.getDEK(username);
        if (!dek || !dek.plaintextDEK) return null;

        const dekBytes = decodeBase64(dek.plaintextDEK);
        const plaintext = JSON.stringify(profileData);
        const { ciphertext, nonce } = encryptWithDEK(plaintext, dekBytes);
        const contentHash = await hashContent(plaintext);

        return { ciphertext, nonce, dekVersion: dek.version, contentHash };
    }

    static decryptProfileData(
        username: string,
        ciphertext: string,
        nonce: string,
        dekVersion?: number,
    ): Record<string, any> | null {
        const dek = this.getDEK(username);
        if (!dek || !dek.plaintextDEK) return null;

        if (dekVersion && dekVersion !== dek.version) {
            console.warn(`⚠️ DEK version mismatch: data v${dekVersion}, have v${dek.version}`);
        }

        const dekBytes = decodeBase64(dek.plaintextDEK);
        const decrypted = decryptWithDEK(ciphertext, nonce, dekBytes);
        if (!decrypted) return null;

        try {
            return JSON.parse(decrypted);
        } catch {
            return null;
        }
    }

    static async encryptProfilePicture(
        username: string,
        fileData: Uint8Array,
    ): Promise<{ ciphertext: Uint8Array; nonce: string; contentHash: string; dekVersion: number } | null> {
        const dek = this.getDEK(username);
        if (!dek || !dek.plaintextDEK) return null;

        const dekBytes = decodeBase64(dek.plaintextDEK);
        const { ciphertext, nonce } = encryptFileWithDEK(fileData, dekBytes);
        const contentHash = await hashFileContent(fileData);
        return { ciphertext, nonce, contentHash, dekVersion: dek.version };
    }

    static decryptProfilePicture(
        username: string,
        ciphertext: Uint8Array,
        nonce: string,
    ): Uint8Array | null {
        const dek = this.getDEK(username);
        if (!dek || !dek.plaintextDEK) return null;
        const dekBytes = decodeBase64(dek.plaintextDEK);
        return decryptFileWithDEK(ciphertext, nonce, dekBytes);
    }

    static async encryptMetadata(
        username: string,
        metadata: Record<string, any>,
    ): Promise<EncryptedBlob | null> {
        return this.encryptProfileData(username, metadata);
    }

    static decryptMetadata(
        username: string,
        ciphertext: string,
        nonce: string,
        dekVersion?: number,
    ): Record<string, any> | null {
        return this.decryptProfileData(username, ciphertext, nonce, dekVersion);
    }

    static async createBackupBundle(
        username: string,
        backupPassword: string,
        profileData: Record<string, any>,
        metadata: Record<string, any>,
    ): Promise<{
        encryptedBackup: string;
        backupNonce: string;
        wrappedDEK: string;
        dekWrapNonce: string;
        backupKeyHash: string;
    } | null> {
        const dek = this.getDEK(username);
        if (!dek || !dek.plaintextDEK) return null;

        const backupKeyBytes = deriveKeyFromPassword(backupPassword);
        const backupKeyHash = await hashContent(backupPassword + ':zerotrace-backup');

        const bundle = JSON.stringify({
            profile: profileData,
            metadata,
            dekVersion: dek.version,
            timestamp: new Date().toISOString(),
        });

        const { ciphertext: encryptedBackup, nonce: backupNonce } = encryptWithDEK(bundle, backupKeyBytes);
        const dekBytes = decodeBase64(dek.plaintextDEK);
        const dekWrapNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const wrappedDEKForBackup = nacl.secretbox(dekBytes, dekWrapNonce, backupKeyBytes);

        return {
            encryptedBackup,
            backupNonce,
            wrappedDEK: encodeBase64(wrappedDEKForBackup),
            dekWrapNonce: encodeBase64(dekWrapNonce),
            backupKeyHash,
        };
    }

    static getDEKVersion(username: string): number {
        const dek = this.getDEK(username);
        return dek?.version || 0;
    }

    static hasDEK(username: string): boolean {
        return !!this.getDEK(username)?.plaintextDEK;
    }

    // ==================== Storage ====================

    static saveDEKLocally(username: string, bundle: DEKBundle): void {
        this._memoryCache[username] = bundle;
        AsyncStorage.setItem(
            `${this.DEK_STORAGE_KEY}_${username}`,
            JSON.stringify(bundle),
        ).catch(err => console.error('Failed to save DEK:', err));
    }

    static loadDEKLocally(username: string): DEKBundle | null {
        return this._memoryCache[username] || null;
    }

    static async loadDEKFromStorage(username: string): Promise<DEKBundle | null> {
        if (this._memoryCache[username]) return this._memoryCache[username];
        try {
            const stored = await AsyncStorage.getItem(`${this.DEK_STORAGE_KEY}_${username}`);
            if (!stored) return null;
            const bundle = JSON.parse(stored);
            this._memoryCache[username] = bundle;
            return bundle;
        } catch {
            return null;
        }
    }

    static getDEK(username: string): DEKBundle | null {
        return this.loadDEKLocally(username);
    }

    static clearLocalDEK(username: string): void {
        delete this._memoryCache[username];
        AsyncStorage.removeItem(`${this.DEK_STORAGE_KEY}_${username}`)
            .catch(err => console.error('Failed to clear DEK:', err));
    }
}

// ==================== Key Rotation Manager ====================

export class KeyRotationManager {
    static performRotation(
        username: string,
    ): {
        newIdentityKeyPair: { publicKey: string; privateKey: string };
        newEncryptionKeyPair: { publicKey: string; privateKey: string };
        newSignedPrekey: string;
        newSignedPrekeySignature: string;
        newOneTimePrekeys: string[];
        rewrappedDEK: string;
        rewrappedDEKNonce: string;
        dekVersion: number;
    } | null {
        const newIdentityKP = nacl.sign.keyPair();
        const newEncryptionKP = nacl.box.keyPair();

        const signedPrekeySignature = nacl.sign.detached(
            newEncryptionKP.publicKey,
            newIdentityKP.secretKey,
        );

        const oneTimePrekeys: string[] = [];
        for (let i = 0; i < 5; i++) {
            const otpk = nacl.box.keyPair();
            oneTimePrekeys.push(encodeBase64(otpk.publicKey));
        }

        const currentDEK = KeyHierarchyManager.getDEK(username);
        if (!currentDEK) {
            console.error('❌ No DEK available for rotation');
            return null;
        }

        const reWrapResult = KeyHierarchyManager.rewrapDEKForRotation(
            username,
            '', // old keys not needed since we read plaintext from cache
            '',
            encodeBase64(newEncryptionKP.publicKey),
            encodeBase64(newEncryptionKP.secretKey),
        );

        if (!reWrapResult) {
            console.error('❌ DEK re-wrapping failed during rotation');
            return null;
        }

        return {
            newIdentityKeyPair: {
                publicKey: encodeBase64(newIdentityKP.publicKey),
                privateKey: encodeBase64(newIdentityKP.secretKey),
            },
            newEncryptionKeyPair: {
                publicKey: encodeBase64(newEncryptionKP.publicKey),
                privateKey: encodeBase64(newEncryptionKP.secretKey),
            },
            newSignedPrekey: encodeBase64(newEncryptionKP.publicKey),
            newSignedPrekeySignature: encodeBase64(signedPrekeySignature),
            newOneTimePrekeys: oneTimePrekeys,
            rewrappedDEK: reWrapResult.newWrappedDEK,
            rewrappedDEKNonce: reWrapResult.newNonce,
            dekVersion: reWrapResult.dekVersion,
        };
    }
}

// ==================== Utility ====================

function deriveKeyFromPassword(password: string): Uint8Array {
    // PBKDF2-like derivation using nacl.hash (deterministic)
    const encoder = new TextEncoder();
    const salt = 'zerotrace-backup-salt-v1';
    let key = nacl.hash(encoder.encode(password + salt));
    // Multiple rounds for key stretching
    for (let i = 0; i < 1000; i++) {
        key = nacl.hash(key);
    }
    return key.slice(0, nacl.secretbox.keyLength);
}
