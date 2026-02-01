/**
 * Friend Request & Secure Contact API Client
 * Handles all friend-related API calls
 */

import axios, { AxiosInstance } from 'axios';
import {
  FriendRequest,
  TrustedContact,
  BlockedUser,
  UserSearchResult,
  PendingRequests,
  QRCodeData,
  CanMessageResponse,
  SendFriendRequestData,
  AcceptFriendRequestData,
  RejectFriendRequestData,
  BlockUserData,
  VerifyContactData,
} from './friendTypes';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class FriendApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string | null) {
    this.token = token;
  }

  // ============ Friend Requests ============

  /**
   * Send a friend request to another user
   * @param data Friend request data including receiver username and sender's key fingerprint
   */
  async sendFriendRequest(data: SendFriendRequestData): Promise<FriendRequest> {
    const response = await this.client.post('/api/friend/request', data);
    return response.data;
  }

  /**
   * Accept a pending friend request
   * @param data Accept data including request ID and fingerprint verification
   */
  async acceptFriendRequest(data: AcceptFriendRequestData): Promise<TrustedContact> {
    const response = await this.client.post('/api/friend/accept', data);
    return response.data;
  }

  /**
   * Reject a pending friend request
   * @param data Reject data including request ID
   */
  async rejectFriendRequest(data: RejectFriendRequestData): Promise<void> {
    await this.client.post('/api/friend/reject', data);
  }

  /**
   * Cancel an outgoing friend request
   * @param requestId The ID of the request to cancel
   */
  async cancelFriendRequest(requestId: number): Promise<void> {
    await this.client.post(`/api/friend/cancel/${requestId}`);
  }

  /**
   * Get all pending friend requests (incoming and outgoing)
   */
  async getPendingRequests(): Promise<PendingRequests> {
    const response = await this.client.get('/api/friend/pending');
    return response.data;
  }

  // ============ Trusted Contacts ============

  /**
   * Get all trusted contacts
   */
  async getTrustedContacts(): Promise<TrustedContact[]> {
    const response = await this.client.get('/api/friend/list');
    return response.data;
  }

  /**
   * Get a specific trusted contact
   * @param contactUserId The user ID of the contact
   */
  async getContact(contactUserId: number): Promise<TrustedContact> {
    const response = await this.client.get(`/api/friend/contact/${contactUserId}`);
    return response.data;
  }

  /**
   * Verify a contact's key fingerprint (manual verification)
   * @param data Verification data including contact ID and verified fingerprint
   */
  async verifyContact(data: VerifyContactData): Promise<void> {
    await this.client.post('/api/friend/verify', data);
  }

  /**
   * Remove a trusted contact
   * @param contactUserId The user ID of the contact to remove
   */
  async removeContact(contactUserId: number): Promise<void> {
    await this.client.delete(`/api/friend/contact/${contactUserId}`);
  }

  /**
   * Update contact nickname
   * @param contactUserId The user ID of the contact
   * @param nickname The new nickname (should be encrypted by client)
   */
  async updateContactNickname(contactUserId: number, nickname: string | null): Promise<void> {
    await this.client.put(`/api/friend/contact/${contactUserId}/nickname`, null, {
      params: { nickname },
    });
  }

  /**
   * Check if user can send messages to another user
   * @param contactUserId The user ID to check
   */
  async canMessageUser(contactUserId: number): Promise<CanMessageResponse> {
    const response = await this.client.get(`/api/friend/can-message/${contactUserId}`);
    return response.data;
  }

  // ============ Block Management ============

  /**
   * Block a user
   * @param data Block data including user ID and reason
   */
  async blockUser(data: BlockUserData): Promise<void> {
    await this.client.post('/api/friend/block', data);
  }

  /**
   * Unblock a user
   * @param userId The user ID to unblock
   */
  async unblockUser(userId: number): Promise<void> {
    await this.client.post('/api/friend/unblock', { user_id: userId });
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    const response = await this.client.get('/api/friend/blocked');
    return response.data;
  }

  // ============ User Search ============

  /**
   * Search for users
   * @param query Search query
   * @param searchType Type of search: 'username', 'user_id', or 'fingerprint'
   */
  async searchUsers(query: string, searchType: 'username' | 'user_id' | 'fingerprint' = 'username'): Promise<UserSearchResult[]> {
    const response = await this.client.get('/api/friend/search', {
      params: { q: query, search_type: searchType },
    });
    return response.data;
  }

  // ============ QR Code ============

  /**
   * Get QR code data for sharing contact info
   */
  async getQRData(): Promise<QRCodeData> {
    const response = await this.client.get('/api/friend/qr-data');
    return response.data;
  }

  /**
   * Process scanned QR code to add contact
   * @param qrData The QR code data with signature
   */
  async processQRScan(qrData: QRCodeData & { signature: string }): Promise<{
    message: string;
    request_id: number;
    target_username: string;
    target_fingerprint: string;
  }> {
    const response = await this.client.post('/api/friend/qr-scan', qrData);
    return response.data;
  }

  // ============ Key Updates ============

  /**
   * Notify about key change for a contact
   * @param contactUserId The contact's user ID
   * @param newFingerprint The new key fingerprint
   */
  async notifyKeyChanged(contactUserId: number, newFingerprint: string): Promise<void> {
    await this.client.post(`/api/friend/key-changed/${contactUserId}`, null, {
      params: { new_fingerprint: newFingerprint },
    });
  }
}

export const friendApi = new FriendApiClient();

// Helper function to compute key fingerprint (client-side)
export function computeKeyFingerprint(publicKey: string): string {
  // Remove PEM headers and whitespace
  let cleanKey = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  // Create SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(cleanKey);

  // Use Web Crypto API for hashing
  return crypto.subtle.digest('SHA-256', data).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Take first 16 bytes and format as colon-separated hex
    return hashArray
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(':');
  }) as unknown as string;
}

// Synchronous version using a simple hash for display purposes
export function computeKeyFingerprintSync(publicKey: string): string {
  if (!publicKey) return '';
  
  let cleanKey = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  // Simple hash for display (use proper crypto for verification)
  let hash = 0;
  for (let i = 0; i < cleanKey.length; i++) {
    const char = cleanKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Convert to hex-like format
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(32, '0');
  return hex.match(/.{1,2}/g)?.slice(0, 16).join(':') || '';
}

// Format fingerprint for display (shorter version)
export function formatFingerprint(fingerprint: string, short: boolean = false): string {
  if (!fingerprint) return '';
  if (short) {
    return fingerprint.split(':').slice(0, 4).join(':');
  }
  return fingerprint;
}

// Compare two fingerprints (case-insensitive)
export function verifyFingerprint(fp1: string, fp2: string): boolean {
  return fp1.toUpperCase().replace(/\s/g, '') === fp2.toUpperCase().replace(/\s/g, '');
}
