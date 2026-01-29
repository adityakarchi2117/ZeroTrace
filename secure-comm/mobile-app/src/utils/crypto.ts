/**
 * CipherLink Mobile Cryptography Module
 * 
 * Implements end-to-end encryption using:
 * - X25519 for key exchange (ECDH)
 * - Ed25519 for signing
 * - NaCl secretbox for symmetric encryption
 * 
 * SECURITY: Private keys NEVER leave the device
 */

import nacl from 'tweetnacl';
import { encode as encodeBase64, decode as decodeBase64 } from 'base64-arraybuffer';

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
}

/**
 * Initialize cryptographic libraries
 */
export const initializeCrypto = async (): Promise<void> => {
  // Ensure random number generator is properly seeded
  // This is handled by react-native-get-random-values
  return Promise.resolve();
};

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
 * Encrypt message using recipient's public key
 */
export const encryptMessage = (
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: string
): EncryptedMessage => {
  const messageBytes = new TextEncoder().encode(message);
  const recipientPublicKeyBytes = base64ToArrayBuffer(recipientPublicKey);
  const senderPrivateKeyBytes = base64ToArrayBuffer(senderPrivateKey);
  
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    new Uint8Array(recipientPublicKeyBytes),
    new Uint8Array(senderPrivateKeyBytes)
  );

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    nonce: arrayBufferToBase64(nonce),
  };
};

/**
 * Decrypt message using sender's public key
 */
export const decryptMessage = (
  encryptedMessage: EncryptedMessage,
  senderPublicKey: string,
  recipientPrivateKey: string
): string => {
  const ciphertextBytes = base64ToArrayBuffer(encryptedMessage.ciphertext);
  const nonceBytes = base64ToArrayBuffer(encryptedMessage.nonce);
  const senderPublicKeyBytes = base64ToArrayBuffer(senderPublicKey);
  const recipientPrivateKeyBytes = base64ToArrayBuffer(recipientPrivateKey);

  const decrypted = nacl.box.open(
    new Uint8Array(ciphertextBytes),
    new Uint8Array(nonceBytes),
    new Uint8Array(senderPublicKeyBytes),
    new Uint8Array(recipientPrivateKeyBytes)
  );

  if (!decrypted) {
    throw new Error('Decryption failed');
  }

  return new TextDecoder().decode(decrypted);
};

/**
 * Encrypt message with forward secrecy using ephemeral key
 */
export const encryptMessageWithForwardSecrecy = (
  message: string,
  recipientPublicKey: string
): EncryptedMessage => {
  // Generate ephemeral key pair
  const ephemeralKeyPair = nacl.box.keyPair();
  
  const messageBytes = new TextEncoder().encode(message);
  const recipientPublicKeyBytes = base64ToArrayBuffer(recipientPublicKey);
  
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    new Uint8Array(recipientPublicKeyBytes),
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
): string => {
  if (!encryptedMessage.ephemeralPublicKey) {
    throw new Error('Ephemeral public key required for forward secrecy decryption');
  }

  const ciphertextBytes = base64ToArrayBuffer(encryptedMessage.ciphertext);
  const nonceBytes = base64ToArrayBuffer(encryptedMessage.nonce);
  const ephemeralPublicKeyBytes = base64ToArrayBuffer(encryptedMessage.ephemeralPublicKey);
  const recipientPrivateKeyBytes = base64ToArrayBuffer(recipientPrivateKey);

  const decrypted = nacl.box.open(
    new Uint8Array(ciphertextBytes),
    new Uint8Array(nonceBytes),
    new Uint8Array(ephemeralPublicKeyBytes),
    new Uint8Array(recipientPrivateKeyBytes)
  );

  if (!decrypted) {
    throw new Error('Decryption failed');
  }

  return new TextDecoder().decode(decrypted);
};

/**
 * Sign message with Ed25519 private key
 */
export const signMessage = (
  message: string,
  privateKey: string
): string => {
  const messageBytes = new TextEncoder().encode(message);
  const privateKeyBytes = base64ToArrayBuffer(privateKey);
  
  const signature = nacl.sign.detached(
    messageBytes,
    new Uint8Array(privateKeyBytes)
  );

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
    const signatureBytes = base64ToArrayBuffer(signature);
    const publicKeyBytes = base64ToArrayBuffer(publicKey);

    return nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(signatureBytes),
      new Uint8Array(publicKeyBytes)
    );
  } catch {
    return false;
  }
};

/**
 * Generate fingerprint for key verification
 */
export const generateFingerprint = (publicKey: string): string => {
  const publicKeyBytes = base64ToArrayBuffer(publicKey);
  const hash = nacl.hash(new Uint8Array(publicKeyBytes));
  
  // Take first 16 bytes and format as hex
  const fingerprint = Array.from(hash.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  
  // Format as groups of 4
  return fingerprint.match(/.{4}/g)?.join(' ') || fingerprint;
};

/**
 * Secure random bytes generation
 */
export const generateRandomBytes = (length: number): Uint8Array => {
  return nacl.randomBytes(length);
};

/**
 * Generate secure random string
 */
export const generateRandomString = (length: number): string => {
  const bytes = generateRandomBytes(length);
  return arrayBufferToBase64(bytes).slice(0, length);
};

// Utility functions
const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  return encodeBase64(buffer instanceof Uint8Array ? buffer.buffer : buffer);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  return decodeBase64(base64);
};

/**
 * Secure key storage utilities
 */
export const KeyStorage = {
  /**
   * Derive key from password using PBKDF2
   */
  deriveKeyFromPassword: async (password: string, salt: string): Promise<string> => {
    // Note: In production, use a proper PBKDF2 implementation
    // This is a simplified version for demo purposes
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
};