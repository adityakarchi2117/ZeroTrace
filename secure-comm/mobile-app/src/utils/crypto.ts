/**
 * ZeroTrace Mobile Cryptography Module
 *
 * Implements end-to-end encryption using:
 * - X25519 for key exchange (ECDH)
 * - Ed25519 for signing
 * - NaCl secretbox for symmetric encryption (XSalsa20-Poly1305)
 *
 * SECURITY: Private keys NEVER leave the device
 *
 * Protocol versions:
 *   v1 – Legacy: encrypted payload without senderPublicKey
 *   v2 – Current: encrypted payload includes senderPublicKey, allowing
 *        the receiver to always decrypt even if their contact cache is stale.
 */

import nacl from 'tweetnacl';
import { encode as encodeBase64, decode as decodeBase64 } from 'base64-arraybuffer';

// ─── Types ─────────────────────────────────────────

export interface KeyPair {
  publicKey: string;  // Base64 encoded
  privateKey: string; // Base64 encoded
}

export interface SigningKeyPair {
  publicKey: string;  // Base64 encoded (Ed25519 public key)
  privateKey: string; // Base64 encoded (Ed25519 private key)
}

export interface EncryptedMessage {
  ciphertext: string;       // Base64 encoded
  nonce: string;            // Base64 encoded
  ephemeralPublicKey?: string; // For forward secrecy
  senderPublicKey?: string;    // v2: embedded sender key
  version?: string;            // 'v1' | 'v2'
}

export interface KeyBundle {
  publicKey: string;
  identityKey: string;
  signedPrekey: string;
  signedPrekeySignature: string;
  oneTimePrekeys: string[];
}

// ─── Initialization ────────────────────────────────

/**
 * Initialize cryptographic libraries
 */
export const initializeCrypto = async (): Promise<void> => {
  // Ensure random number generator is properly seeded
  // This is handled by react-native-get-random-values
  return Promise.resolve();
};

// ─── Key Generation ────────────────────────────────

/**
 * Generate X25519 key pair for encryption
 */
export const generateKeyPair = (): KeyPair => {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: arrayBufferToBase64(keyPair.publicKey),
    privateKey: arrayBufferToBase64(keyPair.secretKey),
  };
};

/**
 * Generate Ed25519 key pair for signing
 */
export const generateSigningKeyPair = (): SigningKeyPair => {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: arrayBufferToBase64(keyPair.publicKey),
    privateKey: arrayBufferToBase64(keyPair.secretKey),
  };
};

/**
 * Generate a full key bundle for Signal Protocol-style key exchange
 */
export const generateKeyBundle = (
  prekeyCount: number = 10
): {
  bundle: KeyBundle;
  privateKeys: {
    identityPrivate: string;
    signedPrekeyPrivate: string;
    oneTimePrekeyPrivates: string[];
  };
} => {
  // Identity key (Ed25519 for signing)
  const identityKeyPair = nacl.sign.keyPair();

  // Signed prekey (X25519 for key agreement)
  const signedPrekeyPair = nacl.box.keyPair();

  // Sign the prekey with identity key
  const signedPrekeyBytes = signedPrekeyPair.publicKey;
  const signature = nacl.sign.detached(signedPrekeyBytes, identityKeyPair.secretKey);

  // One-time prekeys (X25519)
  const oneTimePrekeys: string[] = [];
  const oneTimePrekeyPrivates: string[] = [];

  for (let i = 0; i < prekeyCount; i++) {
    const otkp = nacl.box.keyPair();
    oneTimePrekeys.push(arrayBufferToBase64(otkp.publicKey));
    oneTimePrekeyPrivates.push(arrayBufferToBase64(otkp.secretKey));
  }

  return {
    bundle: {
      publicKey: arrayBufferToBase64(signedPrekeyPair.publicKey),
      identityKey: arrayBufferToBase64(identityKeyPair.publicKey),
      signedPrekey: arrayBufferToBase64(signedPrekeyPair.publicKey),
      signedPrekeySignature: arrayBufferToBase64(signature),
      oneTimePrekeys,
    },
    privateKeys: {
      identityPrivate: arrayBufferToBase64(identityKeyPair.secretKey),
      signedPrekeyPrivate: arrayBufferToBase64(signedPrekeyPair.secretKey),
      oneTimePrekeyPrivates,
    },
  };
};

// ─── v2 Encryption ─────────────────────────────────

/**
 * Encrypt message using recipient's public key (v2 – includes senderPublicKey)
 */
export const encryptMessage = (
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: string,
  senderPublicKey?: string
): EncryptedMessage => {
  // Build the payload: for v2, embed sender's public key
  const payload = senderPublicKey
    ? JSON.stringify({ m: message, spk: senderPublicKey })
    : message;

  const messageBytes = new TextEncoder().encode(payload);
  const recipientPublicKeyBytes = new Uint8Array(base64ToArrayBuffer(recipientPublicKey));
  const senderPrivateKeyBytes = new Uint8Array(base64ToArrayBuffer(senderPrivateKey));

  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKeyBytes,
    senderPrivateKeyBytes
  );

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    nonce: arrayBufferToBase64(nonce),
    senderPublicKey: senderPublicKey || undefined,
    version: senderPublicKey ? 'v2' : 'v1',
  };
};

/**
 * Decrypt message using sender's public key
 * For v2 messages: uses the senderPublicKey embedded in the message
 * For v1 (legacy) messages: falls back to the provided senderPublicKey param
 */
export const decryptMessage = (
  encryptedMessage: EncryptedMessage,
  senderPublicKeyFallback: string,
  recipientPrivateKey: string
): string | null => {
  try {
    const ciphertextBytes = new Uint8Array(base64ToArrayBuffer(encryptedMessage.ciphertext));
    const nonceBytes = new Uint8Array(base64ToArrayBuffer(encryptedMessage.nonce));
    const recipientPrivateKeyBytes = new Uint8Array(base64ToArrayBuffer(recipientPrivateKey));

    // Determine which sender key to use
    const senderKey = encryptedMessage.senderPublicKey || senderPublicKeyFallback;
    const senderPublicKeyBytes = new Uint8Array(base64ToArrayBuffer(senderKey));

    const decrypted = nacl.box.open(
      ciphertextBytes,
      nonceBytes,
      senderPublicKeyBytes,
      recipientPrivateKeyBytes
    );

    if (!decrypted) {
      // If v2 key failed, try fallback
      if (encryptedMessage.senderPublicKey && senderPublicKeyFallback !== encryptedMessage.senderPublicKey) {
        const fallbackKeyBytes = new Uint8Array(base64ToArrayBuffer(senderPublicKeyFallback));
        const retry = nacl.box.open(
          ciphertextBytes,
          nonceBytes,
          fallbackKeyBytes,
          recipientPrivateKeyBytes
        );
        if (!retry) return null;
        return new TextDecoder().decode(retry);
      }
      return null;
    }

    const plaintext = new TextDecoder().decode(decrypted);

    // Check if this is a v2 payload with embedded sender key
    try {
      const parsed = JSON.parse(plaintext);
      if (parsed && typeof parsed.m === 'string' && parsed.spk) {
        return parsed.m;
      }
    } catch {
      // Not JSON – it's a v1 plain message
    }

    return plaintext;
  } catch (error) {
    console.error('[Crypto] Decryption error:', error);
    return null;
  }
};

// ─── Forward Secrecy ───────────────────────────────

/**
 * Encrypt message with forward secrecy using ephemeral key
 */
export const encryptMessageWithForwardSecrecy = (
  message: string,
  recipientPublicKey: string
): EncryptedMessage => {
  const ephemeralKeyPair = nacl.box.keyPair();

  const messageBytes = new TextEncoder().encode(message);
  const recipientPublicKeyBytes = new Uint8Array(base64ToArrayBuffer(recipientPublicKey));

  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKeyBytes,
    ephemeralKeyPair.secretKey
  );

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    nonce: arrayBufferToBase64(nonce),
    ephemeralPublicKey: arrayBufferToBase64(ephemeralKeyPair.publicKey),
  };
};

/**
 * Decrypt message encrypted with forward secrecy
 */
export const decryptMessageWithForwardSecrecy = (
  encryptedMessage: EncryptedMessage,
  recipientPrivateKey: string
): string | null => {
  if (!encryptedMessage.ephemeralPublicKey) {
    console.error('[Crypto] Ephemeral key required for forward secrecy decryption');
    return null;
  }

  try {
    const ciphertextBytes = new Uint8Array(base64ToArrayBuffer(encryptedMessage.ciphertext));
    const nonceBytes = new Uint8Array(base64ToArrayBuffer(encryptedMessage.nonce));
    const ephemeralPublicKeyBytes = new Uint8Array(
      base64ToArrayBuffer(encryptedMessage.ephemeralPublicKey)
    );
    const recipientPrivateKeyBytes = new Uint8Array(base64ToArrayBuffer(recipientPrivateKey));

    const decrypted = nacl.box.open(
      ciphertextBytes,
      nonceBytes,
      ephemeralPublicKeyBytes,
      recipientPrivateKeyBytes
    );

    if (!decrypted) return null;
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('[Crypto] Forward secrecy decryption error:', error);
    return null;
  }
};

// ─── Signing ───────────────────────────────────────

/**
 * Sign message with Ed25519 private key
 */
export const signMessage = (
  message: string,
  privateKey: string
): string => {
  const messageBytes = new TextEncoder().encode(message);
  const privateKeyBytes = new Uint8Array(base64ToArrayBuffer(privateKey));

  const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
  return arrayBufferToBase64(signature);
};

/**
 * Verify message signature with Ed25519 public key
 */
export const verifySignature = (
  message: string,
  signature: string,
  publicKey: string
): boolean => {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = new Uint8Array(base64ToArrayBuffer(signature));
    const publicKeyBytes = new Uint8Array(base64ToArrayBuffer(publicKey));

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
};

// ─── Key Verification ──────────────────────────────

/**
 * Generate fingerprint for key verification
 */
export const generateFingerprint = (publicKey: string): string => {
  const publicKeyBytes = new Uint8Array(base64ToArrayBuffer(publicKey));
  const hash = nacl.hash(publicKeyBytes);

  // Take first 16 bytes and format as hex
  const fingerprint = Array.from(hash.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  // Format as groups of 4
  return fingerprint.match(/.{4}/g)?.join(' ') || fingerprint;
};

/**
 * Verify that a private key and public key form a valid pair
 */
export const verifyKeyPair = (privateKey: string, publicKey: string): boolean => {
  try {
    const privBytes = new Uint8Array(base64ToArrayBuffer(privateKey));
    // Derive public key from private key
    const derivedPublicKey = nacl.box.keyPair.fromSecretKey(privBytes).publicKey;
    const expectedPublicKey = new Uint8Array(base64ToArrayBuffer(publicKey));

    if (derivedPublicKey.length !== expectedPublicKey.length) return false;

    for (let i = 0; i < derivedPublicKey.length; i++) {
      if (derivedPublicKey[i] !== expectedPublicKey[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Derive the correct public key from a private key
 */
export const derivePublicKeyFromPrivate = (privateKey: string): string => {
  const privBytes = new Uint8Array(base64ToArrayBuffer(privateKey));
  const derived = nacl.box.keyPair.fromSecretKey(privBytes);
  return arrayBufferToBase64(derived.publicKey);
};

/**
 * Derive a shared secret from key exchange
 */
export const deriveSharedSecret = (
  privateKey: string,
  publicKey: string
): string => {
  const privBytes = new Uint8Array(base64ToArrayBuffer(privateKey));
  const pubBytes = new Uint8Array(base64ToArrayBuffer(publicKey));
  const shared = nacl.box.before(pubBytes, privBytes);
  return arrayBufferToBase64(shared);
};

// ─── Storage Encryption ────────────────────────────

/**
 * Encrypt data for local storage (symmetric encryption)
 */
export const encryptForStorage = (data: string, key: string): string => {
  const keyBytes = new Uint8Array(base64ToArrayBuffer(key)).slice(0, 32);
  const nonce = nacl.randomBytes(24);
  const dataBytes = new TextEncoder().encode(data);

  const encrypted = nacl.secretbox(dataBytes, nonce, keyBytes);
  if (!encrypted) throw new Error('Storage encryption failed');

  return JSON.stringify({
    c: arrayBufferToBase64(encrypted),
    n: arrayBufferToBase64(nonce),
  });
};

/**
 * Decrypt data from local storage
 */
export const decryptFromStorage = (encryptedData: string, key: string): string | null => {
  try {
    const { c, n } = JSON.parse(encryptedData);
    const keyBytes = new Uint8Array(base64ToArrayBuffer(key)).slice(0, 32);
    const cipherBytes = new Uint8Array(base64ToArrayBuffer(c));
    const nonceBytes = new Uint8Array(base64ToArrayBuffer(n));

    const decrypted = nacl.secretbox.open(cipherBytes, nonceBytes, keyBytes);
    if (!decrypted) return null;

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
};

/**
 * Generate a random symmetric key for session encryption
 */
export const generateSessionKey = (): string => {
  return arrayBufferToBase64(nacl.randomBytes(32));
};

// ─── Utility Functions ─────────────────────────────

export const generateRandomBytes = (length: number): Uint8Array => {
  return nacl.randomBytes(length);
};

export const generateRandomString = (length: number): string => {
  const bytes = generateRandomBytes(length);
  return arrayBufferToBase64(bytes).slice(0, length);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  if (buffer instanceof Uint8Array) {
    // Ensure we pass a proper ArrayBuffer with correct bounds
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    return encodeBase64(ab);
  }
  return encodeBase64(buffer);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  return decodeBase64(base64);
};

// ─── Secure Key Storage ────────────────────────────

export const KeyStorage = {
  /**
   * Derive key from password using NaCl hash
   */
  deriveKeyFromPassword: async (password: string, salt: string): Promise<string> => {
    const combined = password + salt;
    const hash = nacl.hash(new TextEncoder().encode(combined));
    return arrayBufferToBase64(hash.slice(0, 32));
  },

  /**
   * Encrypt private key with password
   */
  encryptPrivateKey: (privateKey: string, password: string): string => {
    const nonce = nacl.randomBytes(24);
    const key = nacl.hash(new TextEncoder().encode(password)).slice(0, 32);

    const encrypted = nacl.secretbox(
      new TextEncoder().encode(privateKey),
      nonce,
      key
    );

    if (!encrypted) {
      throw new Error('Private key encryption failed');
    }

    return JSON.stringify({
      encrypted: arrayBufferToBase64(encrypted),
      nonce: arrayBufferToBase64(nonce),
    });
  },

  /**
   * Decrypt private key with password
   */
  decryptPrivateKey: (encryptedData: string, password: string): string => {
    const { encrypted, nonce } = JSON.parse(encryptedData);
    const key = nacl.hash(new TextEncoder().encode(password)).slice(0, 32);

    const decrypted = nacl.secretbox.open(
      new Uint8Array(base64ToArrayBuffer(encrypted)),
      new Uint8Array(base64ToArrayBuffer(nonce)),
      key
    );

    if (!decrypted) {
      throw new Error('Private key decryption failed');
    }

    return new TextDecoder().decode(decrypted);
  },

  STORAGE_KEY: 'zerotrace_keys',
  SESSION_CACHE_KEY: 'zerotrace_sessions',
};