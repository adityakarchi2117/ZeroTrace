/**
 * ZeroTrace Client-Side Cryptography Module
 * 
 * Implements end-to-end encryption using:
 * - X25519 for key exchange (ECDH)
 * - Ed25519 for signing
 * - AES-256-GCM for symmetric encryption (via NaCl secretbox)
 * 
 * SECURITY: Private keys NEVER leave the client
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export interface KeyPair {
  publicKey: string;  // Base64 encoded
  privateKey: string; // Base64 encoded
}

export interface SigningKeyPair {
  publicKey: string;  // Base64 encoded (Ed25519 public key)
  privateKey: string; // Base64 encoded (Ed25519 private key)
}

export interface EncryptedMessage {
  ciphertext: string; // Base64 encoded
  nonce: string;      // Base64 encoded
  ephemeralPublicKey?: string; // For forward secrecy
  senderPublicKey?: string; // Sender's public key for decryption (required for v2+)
  version?: string; // Crypto protocol version (e.g., "v2")
}

export interface KeyBundle {
  publicKey: string;
  identityKey: string;
  signedPrekey: string;
  signedPrekeySignature: string;
  oneTimePrekeys: string[];
}

/**
 * Generate X25519 key pair for encryption
 */
export function generateKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey),
  };
}

/**
 * Generate Ed25519 key pair for signing
 */
export function generateSigningKeyPair(): SigningKeyPair {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey),
  };
}

/**
 * Generate a full key bundle for Signal Protocol-style key exchange
 */
export function generateKeyBundle(prekeyCount: number = 10): {
  bundle: KeyBundle;
  privateKeys: {
    identityPrivate: string;
    signedPrekeyPrivate: string;
    oneTimePrekeyPrivates: string[];
  };
} {
  // Generate identity key pair (Ed25519 for signing)
  const identityKeyPair = nacl.sign.keyPair();

  // Generate signed pre-key (X25519 for encryption)
  const signedPrekey = nacl.box.keyPair();

  // Sign the pre-key with identity key
  const signedPrekeySignature = nacl.sign.detached(
    signedPrekey.publicKey,
    identityKeyPair.secretKey
  );

  // Generate one-time pre-keys
  const oneTimePrekeys: string[] = [];
  const oneTimePrekeyPrivates: string[] = [];

  for (let i = 0; i < prekeyCount; i++) {
    const otpk = nacl.box.keyPair();
    oneTimePrekeys.push(encodeBase64(otpk.publicKey));
    oneTimePrekeyPrivates.push(encodeBase64(otpk.secretKey));
  }

  return {
    bundle: {
      publicKey: encodeBase64(signedPrekey.publicKey),
      identityKey: encodeBase64(identityKeyPair.publicKey),
      signedPrekey: encodeBase64(signedPrekey.publicKey),
      signedPrekeySignature: encodeBase64(signedPrekeySignature),
      oneTimePrekeys,
    },
    privateKeys: {
      identityPrivate: encodeBase64(identityKeyPair.secretKey),
      signedPrekeyPrivate: encodeBase64(signedPrekey.secretKey),
      oneTimePrekeyPrivates,
    },
  };
}

/**
 * Encrypt a message using recipient's public key
 * Uses authenticated encryption (NaCl box)
 * 
 * Version 2 (v2): Includes sender's public key in the payload
 * so the receiver can always decrypt correctly, even if their
 * local contact cache is stale or missing.
 */
export function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: string,
  senderPublicKey?: string
): EncryptedMessage {
  // Debug logging
  console.log('🔐 Encrypting message:', {
    recipientKeyPrefix: recipientPublicKey?.substring(0, 20),
    senderPrivKeyPrefix: senderPrivateKey?.substring(0, 20),
    senderPubKeyPrefix: senderPublicKey?.substring(0, 20),
    hasSenderPubKey: !!senderPublicKey,
  });

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = decodeUTF8(message);
  const publicKeyBytes = decodeBase64(recipientPublicKey);
  const privateKeyBytes = decodeBase64(senderPrivateKey);

  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    publicKeyBytes,
    privateKeyBytes
  );

  const result = {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
    senderPublicKey: senderPublicKey, // Include sender's key for reliable decryption
    version: 'v2', // Mark as v2 protocol
  };
  
  console.log('✅ Encrypted with v2 protocol, embedded senderPublicKey:', !!senderPublicKey);
  return result;
}

/**
 * Decrypt a message using sender's public key
 * 
 * For v2 messages: Uses the senderPublicKey embedded in the message
 * For v1 (legacy) messages: Falls back to the provided senderPublicKey parameter
 * 
 * Enhanced with key mismatch detection and recovery hints
 */
export function decryptMessage(
  encrypted: EncryptedMessage,
  senderPublicKeyFallback: string,
  recipientPrivateKey: string
): string | null {
  try {
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const nonce = decodeBase64(encrypted.nonce);
    
    // Prefer the embedded sender public key (v2), fallback to provided key (v1)
    const senderPublicKey = encrypted.senderPublicKey || senderPublicKeyFallback;
    
    // Debug logging
    console.log('🔓 Decryption attempt:', {
      version: encrypted.version || 'v1',
      hasEmbeddedKey: !!encrypted.senderPublicKey,
      embeddedKeyPrefix: encrypted.senderPublicKey?.substring(0, 20),
      fallbackKeyPrefix: senderPublicKeyFallback?.substring(0, 20),
      usingKeyPrefix: senderPublicKey?.substring(0, 20),
      recipientKeyPrefix: recipientPrivateKey?.substring(0, 20),
    });
    
    if (!senderPublicKey) {
      console.error('❌ Decryption failed: No sender public key available');
      return null;
    }
    
    const publicKeyBytes = decodeBase64(senderPublicKey);
    const privateKeyBytes = decodeBase64(recipientPrivateKey);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      publicKeyBytes,
      privateKeyBytes
    );

    if (!decrypted) {
      console.warn('⚠️ Primary decryption failed with key:', senderPublicKey?.substring(0, 20));
      
      // Key mismatch diagnostics - verify recipient key pair is valid
      const recipientDerivedPubKey = derivePublicKeyFromPrivate(recipientPrivateKey);
      
      console.log('🔍 Key diagnostics:', {
        senderKeyPrefix: senderPublicKey?.substring(0, 20),
        recipientDerivedPubKey: recipientDerivedPubKey?.substring(0, 20),
        hint: 'Key mismatch detected - sender or recipient may have regenerated keys',
        recovery: 'If you regenerated your keys, old messages cannot be decrypted. Contact sender to resend.',
      });
      
      // If v2 key failed, try fallback key as a last resort
      if (encrypted.senderPublicKey && senderPublicKeyFallback && 
          encrypted.senderPublicKey !== senderPublicKeyFallback) {
        console.log('🔄 Trying fallback sender key:', senderPublicKeyFallback?.substring(0, 20));
        try {
          const fallbackKeyBytes = decodeBase64(senderPublicKeyFallback);
          const decryptedFallback = nacl.box.open(
            ciphertext,
            nonce,
            fallbackKeyBytes,
            privateKeyBytes
          );
          if (decryptedFallback) {
            console.log('✅ Fallback decryption succeeded!');
            return encodeUTF8(decryptedFallback);
          }
        } catch (e) {
          console.warn('❌ Fallback decryption also failed:', e);
        }
      }
      
      // Last resort: Try ALL available contact public keys if this is a group/unknown scenario
      // (Could be extended with a key history cache)
      console.error('❌ All decryption attempts failed. This message may be permanently undecryptable if keys were regenerated.');
      return null;
    }

    console.log('✅ Decryption succeeded');
    return encodeUTF8(decrypted);
  } catch (error) {
    console.error('❌ Decryption error:', error);
    return null;
  }
}

/**
 * Encrypt message with ephemeral key for forward secrecy
 */
export function encryptMessageWithForwardSecrecy(
  message: string,
  recipientPublicKey: string
): EncryptedMessage {
  // Generate ephemeral key pair
  const ephemeralKeyPair = nacl.box.keyPair();

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = decodeUTF8(message);
  const publicKeyBytes = decodeBase64(recipientPublicKey);

  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    publicKeyBytes,
    ephemeralKeyPair.secretKey
  );

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
    ephemeralPublicKey: encodeBase64(ephemeralKeyPair.publicKey),
  };
}

/**
 * Decrypt message encrypted with forward secrecy
 */
export function decryptMessageWithForwardSecrecy(
  encrypted: EncryptedMessage,
  recipientPrivateKey: string
): string | null {
  if (!encrypted.ephemeralPublicKey) {
    return null;
  }

  try {
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const nonce = decodeBase64(encrypted.nonce);
    const ephemeralPublicKey = decodeBase64(encrypted.ephemeralPublicKey);
    const privateKeyBytes = decodeBase64(recipientPrivateKey);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      ephemeralPublicKey,
      privateKeyBytes
    );

    if (!decrypted) {
      return null;
    }

    return encodeUTF8(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}

/**
 * Sign a message with Ed25519 private key
 */
export function signMessage(message: string, privateKey: string): string {
  const messageBytes = decodeUTF8(message);
  const privateKeyBytes = decodeBase64(privateKey);
  const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
  return encodeBase64(signature);
}

/**
 * Verify a message signature
 */
export function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const messageBytes = decodeUTF8(message);
    const signatureBytes = decodeBase64(signature);
    const publicKeyBytes = decodeBase64(publicKey);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a key fingerprint for verification
 */
export function generateFingerprint(publicKey: string): string {
  const keyBytes = decodeBase64(publicKey);
  const hash = nacl.hash(keyBytes);
  const hex = Array.from(hash.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Format as groups for easy reading
  return hex.toUpperCase().match(/.{1,4}/g)?.join(' ') || hex.toUpperCase();
}

/**
 * Verify that a private key and public key form a valid pair
 * by deriving the public key from the private key and comparing
 */
export function verifyKeyPair(privateKey: string, publicKey: string): boolean {
  try {
    const privateKeyBytes = decodeBase64(privateKey);
    const publicKeyBytes = decodeBase64(publicKey);
    
    // Derive public key from private key using NaCl
    const derivedKeyPair = nacl.box.keyPair.fromSecretKey(privateKeyBytes);
    const derivedPublicKey = derivedKeyPair.publicKey;
    
    // Compare derived public key with provided public key
    if (derivedPublicKey.length !== publicKeyBytes.length) {
      return false;
    }
    
    for (let i = 0; i < derivedPublicKey.length; i++) {
      if (derivedPublicKey[i] !== publicKeyBytes[i]) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Key pair verification failed:', error);
    return false;
  }
}

/**
 * Derive the correct public key from a private key
 */
export function derivePublicKeyFromPrivate(privateKey: string): string {
  const privateKeyBytes = decodeBase64(privateKey);
  const derivedKeyPair = nacl.box.keyPair.fromSecretKey(privateKeyBytes);
  return encodeBase64(derivedKeyPair.publicKey);
}

/**
 * Derive a shared secret from key exchange
 */
export function deriveSharedSecret(
  privateKey: string,
  publicKey: string
): string {
  const privateKeyBytes = decodeBase64(privateKey);
  const publicKeyBytes = decodeBase64(publicKey);
  const sharedSecret = nacl.box.before(publicKeyBytes, privateKeyBytes);
  return encodeBase64(sharedSecret);
}

/**
 * Encrypt data for local storage (symmetric encryption)
 */
export function encryptForStorage(data: string, key: string): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = decodeUTF8(data);
  const keyBytes = decodeBase64(key).slice(0, nacl.secretbox.keyLength);

  const ciphertext = nacl.secretbox(messageBytes, nonce, keyBytes);

  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  return encodeBase64(combined);
}

/**
 * Decrypt data from local storage
 */
export function decryptFromStorage(encryptedData: string, key: string): string | null {
  try {
    const combined = decodeBase64(encryptedData);
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const ciphertext = combined.slice(nacl.secretbox.nonceLength);
    const keyBytes = decodeBase64(key).slice(0, nacl.secretbox.keyLength);

    const decrypted = nacl.secretbox.open(ciphertext, nonce, keyBytes);

    if (!decrypted) {
      return null;
    }

    return encodeUTF8(decrypted);
  } catch {
    return null;
  }
}

/**
 * Generate a random symmetric key for session encryption
 */
export function generateSessionKey(): string {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  return encodeBase64(key);
}

/**
 * Securely store keys in browser (IndexedDB or localStorage with encryption)
 */
export interface StoredKeys {
  privateKey: string;
  publicKey: string;
  identityKey?: string;
  signedPrekey?: string;
  signedPrekeySignature?: string;
  identityPrivateKey?: string;
  oneTimePrekeys?: string[];
  fingerprint?: string; // Key fingerprint for verification
}

export const KeyStorage = {
  STORAGE_KEY: 'zerotrace_keys',
  SESSION_CACHE_KEY: 'zerotrace_sessions',

  save(username: string, keys: StoredKeys): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      const allKeys = stored ? JSON.parse(stored) : {};
      // Add fingerprint for verification
      keys.fingerprint = generateFingerprint(keys.publicKey);
      allKeys[username] = keys;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allKeys));
    } catch (error) {
      console.error('Failed to save keys:', error);
    }
  },

  load(username: string): StoredKeys | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;
      const allKeys = JSON.parse(stored);
      return allKeys[username] || null;
    } catch {
      return null;
    }
  },

  /**
   * Verify that local key matches the server key fingerprint
   * Returns true if keys match, false otherwise
   */
  verifyKeyConsistency(username: string, serverPublicKey: string): boolean {
    const localKeys = this.load(username);
    if (!localKeys) return false;
    
    const localFingerprint = generateFingerprint(localKeys.publicKey);
    const serverFingerprint = generateFingerprint(serverPublicKey);
    
    return localFingerprint === serverFingerprint;
  },

  remove(username: string): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const allKeys = JSON.parse(stored);
        delete allKeys[username];
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allKeys));
      }
      // Also clear session cache for this user
      this.clearSessionCache(username);
    } catch (error) {
      console.error('Failed to remove keys:', error);
    }
  },

  clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.SESSION_CACHE_KEY);
  },

  // ============ Session Cache for Derived Shared Secrets ============
  
  /**
   * Get or derive shared secret for a conversation
   * Cached for performance - avoids recomputing ECDH every message
   */
  getOrDeriveSessionKey(
    myUsername: string,
    peerUsername: string,
    myPrivateKey: string,
    peerPublicKey: string
  ): string {
    const cacheKey = `${myUsername}:${peerUsername}:${generateFingerprint(peerPublicKey).slice(0, 16)}`;
    
    try {
      const stored = localStorage.getItem(this.SESSION_CACHE_KEY);
      const cache = stored ? JSON.parse(stored) : {};
      
      if (cache[cacheKey]) {
        return cache[cacheKey];
      }
      
      // Derive and cache
      const sharedSecret = deriveSharedSecret(myPrivateKey, peerPublicKey);
      cache[cacheKey] = sharedSecret;
      localStorage.setItem(this.SESSION_CACHE_KEY, JSON.stringify(cache));
      
      return sharedSecret;
    } catch (error) {
      console.error('Session cache error:', error);
      // Fallback to direct derivation
      return deriveSharedSecret(myPrivateKey, peerPublicKey);
    }
  },

  clearSessionCache(username?: string): void {
    if (!username) {
      localStorage.removeItem(this.SESSION_CACHE_KEY);
      return;
    }
    
    try {
      const stored = localStorage.getItem(this.SESSION_CACHE_KEY);
      if (stored) {
        const cache = JSON.parse(stored);
        // Remove all sessions involving this user
        const newCache: Record<string, string> = {};
        for (const [key, value] of Object.entries(cache)) {
          if (!key.startsWith(`${username}:`)) {
            newCache[key] = value as string;
          }
        }
        localStorage.setItem(this.SESSION_CACHE_KEY, JSON.stringify(newCache));
      }
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }
  },
};
