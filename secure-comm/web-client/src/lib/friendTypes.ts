/**
 * Friend Request & Secure Contact API
 * TypeScript types and API client methods
 */

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

// ============ Request Types ============

export interface SendFriendRequestData {
  receiver_username: string;
  sender_public_key_fingerprint: string;
  message?: string;
}

export interface AcceptFriendRequestData {
  request_id: number;
  receiver_public_key_fingerprint: string;
  verify_sender_fingerprint: string;
}

export interface RejectFriendRequestData {
  request_id: number;
  reason?: string;
}

export interface BlockUserData {
  user_id: number;
  reason: BlockReason;
  additional_info?: string;
}

export interface VerifyContactData {
  contact_user_id: number;
  verified_fingerprint: string;
}

// ============ WebSocket Event Types ============

export interface FriendRequestEvent {
  type: 'friend_request';
  request_id: number;
  sender_username: string;
  sender_fingerprint: string;
  timestamp: string;
}

export interface FriendRequestAcceptedEvent {
  type: 'friend_request_accepted';
  accepter_username: string;
  contact_fingerprint: string;
  timestamp: string;
}

export interface FriendRequestRejectedEvent {
  type: 'friend_request_rejected';
  username: string;
  timestamp: string;
}

export interface ContactRemovedEvent {
  type: 'contact_removed';
  removed_by: string;
  timestamp: string;
}

export interface KeyChangedEvent {
  type: 'key_changed';
  username: string;
  new_fingerprint: string;
  requires_verification: boolean;
  timestamp: string;
}

export type FriendEvent =
  | FriendRequestEvent
  | FriendRequestAcceptedEvent
  | FriendRequestRejectedEvent
  | ContactRemovedEvent
  | KeyChangedEvent;
