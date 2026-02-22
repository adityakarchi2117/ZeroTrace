/**
 * ZeroTrace Key Hierarchy Manager
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
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { KeyStorage, generateFingerprint } from './crypto';

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
  /** Identity private key (Ed25519 secret key), base64 */
  identityPrivateKey: string;
  /** Identity public key (Ed25519 public key), base64 */
  identityPublicKey: string;
  /** Encryption private key (X25519), base64 */
  encryptionPrivateKey: string;
  /** Encryption public key (X25519), base64 */
  encryptionPublicKey: string;
  /** Currently active DEK bundle */
  dek: DEKBundle | null;
}

// ==================== DEK Operations ====================

/**
 * Generate a fresh Data Encryption Key (DEK).
 * The DEK is a 32-byte random key used with NaCl secretbox (XSalsa20-Poly1305).
 */
export function generateDEK(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

/**
 * Wrap (encrypt) a DEK with the user's X25519 encryption key pair.
 * Uses NaCl box (X25519 + XSalsa20-Poly1305).
 * 
 * The DEK is encrypted using the user's own public key as recipient,
 * so only the user's private key can unwrap it (self-encryption).
 */
export function wrapDEK(
  plaintextDEK: Uint8Array,
  encryptionPublicKey: Uint8Array,
  encryptionPrivateKey: Uint8Array,
): { wrappedDEK: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  // Encrypt DEK with user's own key pair (self-encryption)
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

/**
 * Unwrap (decrypt) a DEK using the user's X25519 encryption key pair.
 */
export function unwrapDEK(
  wrappedDEK: string,
  nonce: string,
  encryptionPublicKey: Uint8Array,
  encryptionPrivateKey: Uint8Array,
): Uint8Array | null {
  try {
    const encrypted = decodeBase64(wrappedDEK);
    const nonceBytes = decodeBase64(nonce);
    
    const decrypted = nacl.box.open(
      encrypted,
      nonceBytes,
      encryptionPublicKey,
      encryptionPrivateKey,
    );
    
    return decrypted;
  } catch (error) {
    console.error('❌ DEK unwrap failed:', error);
    return null;
  }
}

/**
 * Encrypt data with the DEK using NaCl secretbox (XSalsa20-Poly1305).
 */
export function encryptWithDEK(
  plaintext: string,
  dekBytes: Uint8Array,
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = decodeUTF8(plaintext);
  
  const encrypted = nacl.secretbox(messageBytes, nonce, dekBytes);
  
  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt data with the DEK using NaCl secretbox.
 */
export function decryptWithDEK(
  ciphertext: string,
  nonce: string,
  dekBytes: Uint8Array,
): string | null {
  try {
    const cipherBytes = decodeBase64(ciphertext);
    const nonceBytes = decodeBase64(nonce);
    
    const decrypted = nacl.secretbox.open(cipherBytes, nonceBytes, dekBytes);
    
    if (!decrypted) {
      console.warn('⚠️ DEK decryption returned null');
      return null;
    }
    
    return encodeUTF8(decrypted);
  } catch (error) {
    console.error('❌ DEK decryption failed:', error);
    return null;
  }
}

/**
 * Encrypt a file (as Uint8Array) with the DEK.
 */
export function encryptFileWithDEK(
  fileData: Uint8Array,
  dekBytes: Uint8Array,
): { ciphertext: Uint8Array; nonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(fileData, nonce, dekBytes);
  
  return {
    ciphertext: encrypted,
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a file with the DEK.
 */
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

/**
 * BUGFIX: Check if Web Crypto API is available (requires HTTPS or localhost).
 * Falls back to a simple hash if crypto.subtle is undefined.
 */
function assertCryptoSubtle(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Web Crypto API (crypto.subtle) is not available. ' +
      'This requires a secure context (HTTPS or localhost).'
    );
  }
}

/**
 * Generate SHA-256 hash of content for integrity verification.
 * Uses Web Crypto API.
 */
export async function hashContent(content: string): Promise<string> {
  assertCryptoSubtle();
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate SHA-256 hash of file data for integrity verification.
 */
export async function hashFileContent(data: Uint8Array): Promise<string> {
  assertCryptoSubtle();
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== Key Hierarchy Manager ====================

/**
 * Full Key Hierarchy Manager.
 * 
 * Manages the 3-layer key system:
 *   - Identity Key: long-term, for authentication
 *   - DEK: for profile/settings encryption, rotatable
 *   - Session Keys: for messages (managed by crypto.ts)
 */
export class KeyHierarchyManager {
  private static DEK_STORAGE_KEY = 'zerotrace_dek';
  
  /**
   * Generate and store a new DEK, wrapped with the user's encryption keys.
   * Called once during first login or when no DEK exists.
   */
  static generateAndWrapDEK(
    username: string,
    encryptionPublicKey: string,
    encryptionPrivateKey: string,
    version: number = 1,
  ): DEKBundle {
    const pubKeyBytes = decodeBase64(encryptionPublicKey);
    const privKeyBytes = decodeBase64(encryptionPrivateKey);
    
    // Generate fresh DEK
    const dekBytes = generateDEK();
    
    // Wrap DEK with identity/encryption key
    const { wrappedDEK, nonce } = wrapDEK(dekBytes, pubKeyBytes, privKeyBytes);
    
    const bundle: DEKBundle = {
      plaintextDEK: encodeBase64(dekBytes),
      wrappedDEK,
      wrapNonce: nonce,
      version,
      algorithm: 'x25519-xsalsa20-poly1305',
    };
    
    // Store locally (plaintext DEK stays on device only)
    this.saveDEKLocally(username, bundle);
    
    console.log(`🔑 DEK generated and wrapped (v${version})`);
    return bundle;
  }
  
  /**
   * Unwrap a DEK received from the server using local encryption keys.
   * Called on login to restore access to encrypted profile data.
   */
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
    
    // Cache locally
    this.saveDEKLocally(username, bundle);
    
    console.log(`🔓 DEK unwrapped and cached (v${version})`);
    return bundle;
  }
  
  /**
   * Re-wrap the DEK with a NEW identity/encryption key pair.
   * Called during key rotation. Does NOT change the DEK itself.
   * 
   * Flow:
   *   1. Unwrap DEK with OLD key pair
   *   2. Re-wrap DEK with NEW key pair
   *   3. Upload re-wrapped DEK to server
   *   4. All encrypted data remains accessible
   */
  static rewrapDEKForRotation(
    username: string,
    oldEncryptionPublicKey: string,
    oldEncryptionPrivateKey: string,
    newEncryptionPublicKey: string,
    newEncryptionPrivateKey: string,
  ): { newWrappedDEK: string; newNonce: string; dekVersion: number } | null {
    // Get cached DEK
    const cached = this.loadDEKLocally(username);
    if (!cached || !cached.plaintextDEK) {
      console.error('❌ No cached DEK for re-wrapping');
      return null;
    }
    
    const dekBytes = decodeBase64(cached.plaintextDEK);
    const newPubKeyBytes = decodeBase64(newEncryptionPublicKey);
    const newPrivKeyBytes = decodeBase64(newEncryptionPrivateKey);
    
    // Re-wrap with new keys
    const { wrappedDEK, nonce } = wrapDEK(dekBytes, newPubKeyBytes, newPrivKeyBytes);
    
    // Update local cache with new wrapping
    const updatedBundle: DEKBundle = {
      ...cached,
      wrappedDEK,
      wrapNonce: nonce,
      version: cached.version, // Version doesn't change, server will increment
    };
    this.saveDEKLocally(username, updatedBundle);
    
    console.log(`🔄 DEK re-wrapped for key rotation (v${cached.version})`);
    return {
      newWrappedDEK: wrappedDEK,
      newNonce: nonce,
      dekVersion: cached.version,
    };
  }
  
  /**
   * Encrypt profile data with the current DEK.
   */
  static async encryptProfileData(
    username: string,
    profileData: Record<string, any>,
  ): Promise<EncryptedBlob | null> {
    const dek = this.loadDEKLocally(username);
    if (!dek || !dek.plaintextDEK) {
      console.error('❌ No DEK available for encryption');
      return null;
    }
    
    const dekBytes = decodeBase64(dek.plaintextDEK);
    const plaintext = JSON.stringify(profileData);
    
    const { ciphertext, nonce } = encryptWithDEK(plaintext, dekBytes);
    const contentHash = await hashContent(plaintext);
    
    return {
      ciphertext,
      nonce,
      dekVersion: dek.version,
      contentHash,
    };
  }
  
  /**
   * Decrypt profile data with the DEK.
   */
  static decryptProfileData(
    username: string,
    ciphertext: string,
    nonce: string,
    dekVersion?: number,
  ): Record<string, any> | null {
    const dek = this.loadDEKLocally(username);
    if (!dek || !dek.plaintextDEK) {
      console.error('❌ No DEK available for decryption');
      return null;
    }
    
    // Version check (warn if mismatch but still try)
    if (dekVersion && dekVersion !== dek.version) {
      console.warn(`⚠️ DEK version mismatch: data encrypted with v${dekVersion}, have v${dek.version}`);
    }
    
    const dekBytes = decodeBase64(dek.plaintextDEK);
    const decrypted = decryptWithDEK(ciphertext, nonce, dekBytes);
    
    if (!decrypted) {
      return null;
    }
    
    try {
      return JSON.parse(decrypted);
    } catch (e) {
      console.error('❌ Failed to parse decrypted profile data:', e);
      return null;
    }
  }
  
  /**
   * Encrypt a file (profile picture) with the DEK.
   */
  static async encryptProfilePicture(
    username: string,
    fileData: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; nonce: string; contentHash: string; dekVersion: number } | null> {
    const dek = this.loadDEKLocally(username);
    if (!dek || !dek.plaintextDEK) {
      return null;
    }
    
    const dekBytes = decodeBase64(dek.plaintextDEK);
    const { ciphertext, nonce } = encryptFileWithDEK(fileData, dekBytes);
    const contentHash = await hashFileContent(fileData);
    
    return {
      ciphertext,
      nonce,
      contentHash,
      dekVersion: dek.version,
    };
  }
  
  /**
   * Decrypt a file (profile picture) with the DEK.
   */
  static decryptProfilePicture(
    username: string,
    ciphertext: Uint8Array,
    nonce: string,
  ): Uint8Array | null {
    const dek = this.loadDEKLocally(username);
    if (!dek || !dek.plaintextDEK) {
      return null;
    }
    
    const dekBytes = decodeBase64(dek.plaintextDEK);
    return decryptFileWithDEK(ciphertext, nonce, dekBytes);
  }
  
  /**
   * Encrypt message metadata (chat names, nicknames, pinned chats) with the DEK.
   */
  static async encryptMetadata(
    username: string,
    metadata: Record<string, any>,
  ): Promise<EncryptedBlob | null> {
    return this.encryptProfileData(username, metadata);
  }
  
  /**
   * Decrypt message metadata with the DEK.
   */
  static decryptMetadata(
    username: string,
    ciphertext: string,
    nonce: string,
    dekVersion?: number,
  ): Record<string, any> | null {
    return this.decryptProfileData(username, ciphertext, nonce, dekVersion);
  }
  
  /**
   * Create an encrypted backup bundle.
   */
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
    const dek = this.loadDEKLocally(username);
    if (!dek || !dek.plaintextDEK) {
      return null;
    }
    
    // Derive backup key from password using PBKDF2 with random salt
    const { key: backupKeyBytes, salt: backupSalt } = await deriveKeyFromPassword(backupPassword);
    const backupKeyHash = await hashContent(backupPassword + ':zerotrace-backup');
    
    // Create backup bundle (include salt so we can re-derive on restore)
    const bundle = JSON.stringify({
      profile: profileData,
      metadata,
      dekVersion: dek.version,
      timestamp: new Date().toISOString(),
      backupSalt: encodeBase64(backupSalt),
    });
    
    // Encrypt bundle with backup key
    const { ciphertext: encryptedBackup, nonce: backupNonce } = encryptWithDEK(bundle, backupKeyBytes);
    
    // Wrap DEK with backup key
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
  
  /**
   * Get current DEK version.
   */
  static getDEKVersion(username: string): number {
    const dek = this.loadDEKLocally(username);
    return dek?.version || 0;
  }
  
  /**
   * Check if user has a DEK.
   */
  static hasDEK(username: string): boolean {
    const dek = this.loadDEKLocally(username);
    return !!dek?.plaintextDEK;
  }
  
  // ==================== Local Storage ====================
  
  static saveDEKLocally(username: string, bundle: DEKBundle): void {
    try {
      const stored = localStorage.getItem(this.DEK_STORAGE_KEY);
      const allDEKs = stored ? JSON.parse(stored) : {};
      allDEKs[username] = bundle;
      localStorage.setItem(this.DEK_STORAGE_KEY, JSON.stringify(allDEKs));
    } catch (error) {
      console.error('Failed to save DEK locally:', error);
    }
  }
  
  static loadDEKLocally(username: string): DEKBundle | null {
    try {
      const stored = localStorage.getItem(this.DEK_STORAGE_KEY);
      if (!stored) return null;
      const allDEKs = JSON.parse(stored);
      return allDEKs[username] || null;
    } catch {
      return null;
    }
  }
  
  /** Alias for loadDEKLocally — used by DeviceLinkService & EncryptedVault */
  static getDEK(username: string): DEKBundle | null {
    return this.loadDEKLocally(username);
  }
  
  static clearLocalDEK(username: string): void {
    try {
      const stored = localStorage.getItem(this.DEK_STORAGE_KEY);
      if (stored) {
        const allDEKs = JSON.parse(stored);
        delete allDEKs[username];
        localStorage.setItem(this.DEK_STORAGE_KEY, JSON.stringify(allDEKs));
      }
    } catch (error) {
      console.error('Failed to clear local DEK:', error);
    }
  }
}

// ==================== Key Rotation Manager ====================

/**
 * Manages the full key rotation process.
 * 
 * On rotation:
 *   1. Generate new identity/encryption key pair
 *   2. Re-wrap existing DEK with new key pair  
 *   3. Upload new public keys + re-wrapped DEK to server
 *   4. NO re-encryption of profile data needed
 *   5. Profile data remains instantly accessible
 */
export class KeyRotationManager {
  
  /**
   * Perform full key rotation.
   * 
   * Returns the data needed for the server API call.
   * Does NOT call the API — that's the caller's responsibility.
   */
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
    // Load current keys
    const currentKeys = KeyStorage.load(username);
    if (!currentKeys) {
      console.error('❌ No keys found for rotation');
      return null;
    }
    
    // 1. Generate new identity key pair (Ed25519)
    const newIdentityKP = nacl.sign.keyPair();
    
    // 2. Generate new encryption key pair (X25519)
    const newEncryptionKP = nacl.box.keyPair();
    
    // 3. Sign the new pre-key with new identity key
    const signedPrekeySignature = nacl.sign.detached(
      newEncryptionKP.publicKey,
      newIdentityKP.secretKey,
    );
    
    // 4. Generate new one-time pre-keys
    const oneTimePrekeys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const otpk = nacl.box.keyPair();
      oneTimePrekeys.push(encodeBase64(otpk.publicKey));
    }
    
    // 5. Re-wrap DEK with new encryption keys
    const reWrapResult = KeyHierarchyManager.rewrapDEKForRotation(
      username,
      currentKeys.publicKey,
      currentKeys.privateKey,
      encodeBase64(newEncryptionKP.publicKey),
      encodeBase64(newEncryptionKP.secretKey),
    );
    
    if (!reWrapResult) {
      console.error('❌ DEK re-wrapping failed during rotation');
      return null;
    }
    
    // 6. Update local key storage
    KeyStorage.save(username, {
      privateKey: encodeBase64(newEncryptionKP.secretKey),
      publicKey: encodeBase64(newEncryptionKP.publicKey),
      identityKey: encodeBase64(newIdentityKP.publicKey),
      identityPrivateKey: encodeBase64(newIdentityKP.secretKey),
      signedPrekey: encodeBase64(newEncryptionKP.publicKey),
      signedPrekeySignature: encodeBase64(signedPrekeySignature),
      oneTimePrekeys,
    });
    
    console.log('🔄 Key rotation prepared — local keys updated');
    
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

/**
 * Derive an encryption key from a password using PBKDF2 via Web Crypto API.
 * 
 * AUDIT FIX: Accepts optional random salt parameter. If not provided, generates
 * a random 16-byte salt. The salt MUST be stored alongside the encrypted data
 * so decryption can re-derive the same key.
 * 
 * Returns { key, salt } so callers can persist the salt.
 * 
 * @param password      The user's password
 * @param existingSalt  Salt from a previous derivation (for restore). If omitted, a random salt is generated.
 * @param iterations    PBKDF2 iteration count. Must match the value used when encrypting.
 */
export async function deriveKeyFromPassword(
  password: string,
  existingSalt?: Uint8Array,
  iterations: number = 100000,
): Promise<{ key: Uint8Array; salt: Uint8Array }> {
  assertCryptoSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  
  // AUDIT FIX: Use random salt instead of hardcoded. Store salt with ciphertext.
  const salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  
  return { key: new Uint8Array(bits), salt };
}
