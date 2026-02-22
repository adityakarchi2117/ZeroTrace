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
  Notification,
  NotificationCount,
  BlockReason,
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

  // ============ Unfriend ============

  /**
   * Unfriend a user with full cleanup
   * @param userId The user ID to unfriend
   * @param revokeKeys Whether to revoke shared encryption keys
   */
  async unfriendUser(userId: number, revokeKeys: boolean = true): Promise<{ success: boolean; message: string; keys_revoked: boolean }> {
    const response = await this.client.post('/api/friend/unfriend', {
      user_id: userId,
      revoke_keys: revokeKeys,
    });
    return response.data;
  }

  // ============ Block Management ============

  /**
   * Block a user
   * @param userId The user ID to block
   * @param reason The reason for blocking
   * @param additionalInfo Optional additional info
   */
  async blockUser(userId: number, reason: BlockReason = 'other', additionalInfo?: string): Promise<void> {
    await this.client.post('/api/friend/block', {
      user_id: userId,
      reason,
      additional_info: additionalInfo,
    });
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

  // ============ Notifications ============

  /**
   * Get notifications for the current user
   * @param unreadOnly Only return unread notifications
   * @param limit Maximum number of notifications
   * @param offset Offset for pagination
   */
  async getNotifications(unreadOnly: boolean = false, limit: number = 50, offset: number = 0): Promise<Notification[]> {
    const response = await this.client.get('/api/friend/notifications', {
      params: { unread_only: unreadOnly, limit, offset },
    });
    return response.data;
  }

  /**
   * Get notification counts for badge display
   */
  async getNotificationCount(): Promise<NotificationCount> {
    const response = await this.client.get('/api/friend/notifications/count');
    return response.data;
  }

  /**
   * Mark a notification as read
   * @param notificationId The notification ID
   */
  async markNotificationRead(notificationId: number): Promise<void> {
    await this.client.post(`/api/friend/notifications/${notificationId}/read`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead(): Promise<void> {
    await this.client.post('/api/friend/notifications/read-all');
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

/**
 * AUDIT FIX: This function was returning a Promise<string> cast as string,
 * making it always return "[object Promise]". Fixed to be properly async.
 * Callers MUST await this function.
 */
export async function computeKeyFingerprint(publicKey: string): Promise<string> {
  // Remove PEM headers and whitespace
  let cleanKey = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  // Create SHA-256 hash using Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(cleanKey);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Take first 16 bytes and format as colon-separated hex
  return hashArray
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

/**
 * AUDIT FIX: Improved sync fingerprint computation using a proper hash spread.
 * Uses FNV-1a (32-bit) for better collision resistance than DJB2.
 * Still not cryptographically secure, but suitable for display-only purposes.
 */
export function computeKeyFingerprintSync(publicKey: string): string {
  if (!publicKey) return '';
  
  let cleanKey = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  // FNV-1a 32-bit hash for better distribution than DJB2
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < cleanKey.length; i++) {
    hash ^= cleanKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  
  // Extend to 64 bits by running a second pass with different seed
  let hash2 = 0x1a47e90b;
  for (let i = cleanKey.length - 1; i >= 0; i--) {
    hash2 ^= cleanKey.charCodeAt(i);
    hash2 = Math.imul(hash2, 0x01000193);
  }
  
  // Combine into 8-byte (16 hex char) fingerprint
  const hex1 = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const hex2 = (hash2 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const hex = hex1 + hex2;
  return hex.match(/.{1,2}/g)?.slice(0, 8).join(':') || '';
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