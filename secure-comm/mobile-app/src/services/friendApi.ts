/**
 * Friend Request Types & API for Mobile App
 * React Native version of the friend system
 */

import { apiClient } from './api';

// ============ Types ============

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
export type TrustLevel = 'unverified' | 'verified' | 'trusted';
export type BlockReason = 'spam' | 'harassment' | 'unwanted' | 'other';

export interface FriendRequest {
  id: number;
  sender_id: number;
  sender_username: string;
  receiver_id: number;
  receiver_username: string;
  sender_public_key_fingerprint: string;
  receiver_public_key_fingerprint?: string;
  message?: string;
  status: FriendRequestStatus;
  created_at: string;
  updated_at?: string;
  expires_at: string;
}

export interface TrustedContact {
  id: number;
  user_id: number;
  contact_user_id: number;
  contact_username: string;
  public_key?: string;
  identity_key?: string;
  public_key_fingerprint: string;
  trust_level: TrustLevel;
  nickname?: string;
  is_verified: boolean;
  last_key_exchange: string;
  created_at: string;
}

export interface BlockedUser {
  id: number;
  blocked_user_id: number;
  blocked_username: string;
  reason: BlockReason;
  blocked_at: string;
}

export interface UserSearchResult {
  user_id: number;
  username: string;
  public_key_fingerprint?: string;
  has_pending_request: boolean;
  is_contact: boolean;
  is_blocked: boolean;
}

export interface PendingRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  total_incoming: number;
  total_outgoing: number;
}

export interface QRCodeData {
  user_id: number;
  username: string;
  public_key_fingerprint: string;
  identity_key_fingerprint: string;
  timestamp: number;
  expires_in: number;
}

export interface CanMessageResponse {
  can_message: boolean;
  reason?: string;
  contact_username?: string;
  public_key?: string;
  identity_key?: string;
  is_verified?: boolean;
  trust_level?: TrustLevel;
}

// ============ API Functions ============

export const friendAPI = {
  // Friend Requests
  sendFriendRequest: (data: {
    receiver_username: string;
    sender_public_key_fingerprint: string;
    message?: string;
  }) => apiClient.post('/friend/request', data),

  acceptFriendRequest: (data: {
    request_id: number;
    receiver_public_key_fingerprint: string;
    verify_sender_fingerprint: string;
  }) => apiClient.post('/friend/accept', data),

  rejectFriendRequest: (data: {
    request_id: number;
    reason?: string;
  }) => apiClient.post('/friend/reject', data),

  cancelFriendRequest: (requestId: number) =>
    apiClient.post(`/friend/cancel/${requestId}`),

  getPendingRequests: () =>
    apiClient.get<PendingRequests>('/friend/pending'),

  // Trusted Contacts
  getTrustedContacts: () =>
    apiClient.get<TrustedContact[]>('/friend/list'),

  getContact: (contactUserId: number) =>
    apiClient.get<TrustedContact>(`/friend/contact/${contactUserId}`),

  verifyContact: (data: {
    contact_user_id: number;
    verified_fingerprint: string;
  }) => apiClient.post('/friend/verify', data),

  removeContact: (contactUserId: number) =>
    apiClient.delete(`/friend/contact/${contactUserId}`),

  updateContactNickname: (contactUserId: number, nickname: string | null) =>
    apiClient.put(`/friend/contact/${contactUserId}/nickname`, null, {
      params: { nickname },
    }),

  canMessageUser: (contactUserId: number) =>
    apiClient.get<CanMessageResponse>(`/friend/can-message/${contactUserId}`),

  // Block Management
  blockUser: (data: {
    user_id: number;
    reason: BlockReason;
    additional_info?: string;
  }) => apiClient.post('/friend/block', data),

  unblockUser: (userId: number) =>
    apiClient.post('/friend/unblock', { user_id: userId }),

  getBlockedUsers: () =>
    apiClient.get<BlockedUser[]>('/friend/blocked'),

  // Search
  searchUsers: (query: string, searchType: 'username' | 'user_id' | 'fingerprint' = 'username') =>
    apiClient.get<UserSearchResult[]>('/friend/search', {
      params: { q: query, search_type: searchType },
    }),

  // QR Code
  getQRData: () =>
    apiClient.get<QRCodeData>('/friend/qr-data'),

  processQRScan: (qrData: QRCodeData & { signature: string }) =>
    apiClient.post('/friend/qr-scan', qrData),

  // Key Updates
  notifyKeyChanged: (contactUserId: number, newFingerprint: string) =>
    apiClient.post(`/friend/key-changed/${contactUserId}`, null, {
      params: { new_fingerprint: newFingerprint },
    }),
};

// ============ Utility Functions ============

/**
 * Compute SHA-256 fingerprint of a public key (simplified version)
 */
export function computeKeyFingerprint(publicKey: string): string {
  if (!publicKey) return '';
  
  let cleanKey = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  // Simple hash for display
  let hash = 0;
  for (let i = 0; i < cleanKey.length; i++) {
    const char = cleanKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(32, '0');
  return hex.match(/.{1,2}/g)?.slice(0, 16).join(':') || '';
}

/**
 * Format fingerprint for display
 */
export function formatFingerprint(fingerprint: string, short: boolean = false): string {
  if (!fingerprint) return '';
  if (short) {
    return fingerprint.split(':').slice(0, 4).join(':');
  }
  return fingerprint;
}

/**
 * Compare two fingerprints (case-insensitive)
 */
export function verifyFingerprint(fp1: string, fp2: string): boolean {
  return fp1.toUpperCase().replace(/\s/g, '') === fp2.toUpperCase().replace(/\s/g, '');
}

/**
 * Format time remaining until expiry
 */
export function formatTimeRemaining(expiresAt: string): string {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  
  if (diff <= 0) return 'Expired';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}
