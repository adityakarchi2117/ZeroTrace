/**
 * Verification System API (Mobile)
 * 
 * Handles verification badges, requests, and history.
 */

import { apiClient } from './api';

// ==================== Types ====================

export type VerificationType = 
  | 'identity' 
  | 'organization' 
  | 'developer' 
  | 'creator' 
  | 'business' 
  | 'government' 
  | 'media' 
  | 'custom';

export type VerificationStatus = 
  | 'pending' 
  | 'under_review' 
  | 'approved' 
  | 'rejected' 
  | 'expired' 
  | 'revoked';

export interface VerificationBadge {
  id: number;
  user_id: number;
  verification_type: VerificationType;
  badge_label: string;
  badge_color: string;
  badge_icon?: string;
  issued_at: string;
  expires_at?: string;
  is_active: boolean;
  issued_by?: string;
}

export interface VerificationRequest {
  id: number;
  user_id: number;
  verification_type: VerificationType;
  status: VerificationStatus;
  supporting_documents?: Record<string, any>;
  notes?: string;
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: number;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface VerificationSummary {
  user_id: number;
  username: string;
  total_badges: number;
  active_badges: number;
  pending_requests: number;
  badges: VerificationBadge[];
}

export interface VerificationHistoryEntry {
  id: number;
  user_id: number;
  verification_type: VerificationType;
  action: 'requested' | 'approved' | 'rejected' | 'revoked' | 'expired';
  performed_by?: number;
  reason?: string;
  created_at: string;
}

export interface CreateVerificationRequestPayload {
  verification_type: VerificationType;
  supporting_documents?: Record<string, any>;
  notes?: string;
}

export interface ReviewVerificationPayload {
  request_id: number;
  approved: boolean;
  rejection_reason?: string;
  badge_label?: string;
  badge_color?: string;
  expires_at?: string;
}

// ==================== API Functions ====================

export const verificationAPI = {
  /**
   * Get verification summary for a user
   */
  getVerificationSummary: async (userId: number): Promise<VerificationSummary> => {
    const response = await apiClient.get(`/verification/summary/${userId}`);
    return response.data;
  },

  /**
   * Get my verification badges
   */
  getMyBadges: async (): Promise<VerificationBadge[]> => {
    const response = await apiClient.get('/verification/badges');
    return response.data;
  },

  /**
   * Get verification badges for a specific user
   */
  getUserBadges: async (userId: number): Promise<VerificationBadge[]> => {
    const response = await apiClient.get(`/verification/badges/${userId}`);
    return response.data;
  },

  /**
   * Create a new verification request
   */
  createVerificationRequest: async (
    payload: CreateVerificationRequestPayload
  ): Promise<VerificationRequest> => {
    const response = await apiClient.post('/verification/request', payload);
    return response.data;
  },

  /**
   * Get my verification requests
   */
  getMyRequests: async (): Promise<VerificationRequest[]> => {
    const response = await apiClient.get('/verification/requests');
    return response.data;
  },

  /**
   * Get pending verification requests (admin only)
   */
  getPendingRequests: async (): Promise<VerificationRequest[]> => {
    const response = await apiClient.get('/verification/requests/pending');
    return response.data;
  },

  /**
   * Review a verification request (admin only)
   */
  reviewRequest: async (payload: ReviewVerificationPayload): Promise<VerificationRequest> => {
    const response = await apiClient.post('/verification/review', payload);
    return response.data;
  },

  /**
   * Get verification history
   */
  getVerificationHistory: async (): Promise<VerificationHistoryEntry[]> => {
    const response = await apiClient.get('/verification/history');
    return response.data;
  },

  /**
   * Revoke a verification badge
   */
  revokeBadge: async (verificationType: VerificationType): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/verification/badge/${verificationType}`);
    return response.data;
  },
};

// ==================== Utility Functions ====================

/**
 * Get badge color for verification type
 */
export function getBadgeColor(type: VerificationType): string {
  const colors: Record<VerificationType, string> = {
    identity: '#3B82F6',      // Blue
    organization: '#8B5CF6',  // Purple
    developer: '#10B981',     // Green
    creator: '#F59E0B',       // Amber
    business: '#6366F1',      // Indigo
    government: '#DC2626',    // Red
    media: '#EC4899',         // Pink
    custom: '#6B7280',        // Gray
  };
  return colors[type] || '#6B7280';
}

/**
 * Get badge icon for verification type
 */
export function getBadgeIcon(type: VerificationType): string {
  const icons: Record<VerificationType, string> = {
    identity: '✓',
    organization: '🏢',
    developer: '💻',
    creator: '🎨',
    business: '💼',
    government: '🏛️',
    media: '📰',
    custom: '⭐',
  };
  return icons[type] || '✓';
}

/**
 * Get badge label for verification type
 */
export function getBadgeLabel(type: VerificationType): string {
  const labels: Record<VerificationType, string> = {
    identity: 'Verified',
    organization: 'Organization',
    developer: 'Developer',
    creator: 'Creator',
    business: 'Business',
    government: 'Government',
    media: 'Media',
    custom: 'Verified',
  };
  return labels[type] || 'Verified';
}

/**
 * Get status color
 */
export function getStatusColor(status: VerificationStatus): string {
  const colors: Record<VerificationStatus, string> = {
    pending: '#F59E0B',       // Amber
    under_review: '#3B82F6',  // Blue
    approved: '#10B981',      // Green
    rejected: '#EF4444',      // Red
    expired: '#6B7280',       // Gray
    revoked: '#DC2626',       // Dark Red
  };
  return colors[status] || '#6B7280';
}

/**
 * Format verification type for display
 */
export function formatVerificationType(type: VerificationType): string {
  return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
}

/**
 * Check if badge is expiring soon (within 30 days)
 */
export function isBadgeExpiringSoon(badge: VerificationBadge): boolean {
  if (!badge.expires_at) return false;
  const expiryDate = new Date(badge.expires_at);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
}

/**
 * Check if badge is expired
 */
export function isBadgeExpired(badge: VerificationBadge): boolean {
  if (!badge.expires_at) return false;
  return new Date(badge.expires_at) < new Date();
}

/**
 * Get days until expiry
 */
export function getDaysUntilExpiry(badge: VerificationBadge): number | null {
  if (!badge.expires_at) return null;
  const expiryDate = new Date(badge.expires_at);
  const now = new Date();
  return Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
