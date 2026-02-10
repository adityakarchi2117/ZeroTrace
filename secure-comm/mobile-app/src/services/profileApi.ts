import { apiClient } from './api';

export type VisibilityLevel = 'everyone' | 'friends' | 'nobody';
export type ReportReason = 'fake_profile' | 'impersonation' | 'harassment' | 'spam' | 'inappropriate' | 'other';

export interface Profile {
  user_id: number;
  username: string;
  display_name?: string;
  bio?: string;
  birthday?: string;
  location_city?: string;
  website?: string;
  social_links?: Record<string, string>;
  status_message?: string;
  pronouns?: string;
  emoji_badge?: string;
  theme?: Record<string, any>;
  banner_url?: string;
  avatar_url?: string;
  avatar_blur?: string;
  created_at: string;
  updated_at: string;
  is_blocked: boolean;
  is_friend: boolean;
  verification_badges?: any[];
}

export interface ProfileUpdate {
  display_name?: string;
  bio?: string;
  birthday?: string;
  location_city?: string;
  website?: string;
  social_links?: Record<string, string>;
  status_message?: string;
  pronouns?: string;
  emoji_badge?: string;
  theme?: Record<string, any>;
  banner_url?: string;
  avatar_blur?: string;
}

export interface PrivacySettings {
  user_id: number;
  profile_visibility: VisibilityLevel;
  avatar_visibility: VisibilityLevel;
  field_visibility?: Record<string, VisibilityLevel>;
  last_seen_visibility: VisibilityLevel;
  online_visibility: VisibilityLevel;
  typing_visibility: VisibilityLevel;
  read_receipts_visibility: VisibilityLevel;
  discovery_opt_in: boolean;
  message_request_policy: VisibilityLevel;
  created_at: string;
  updated_at: string;
}

export interface PrivacySettingsUpdate {
  profile_visibility?: VisibilityLevel;
  avatar_visibility?: VisibilityLevel;
  field_visibility?: Record<string, VisibilityLevel>;
  last_seen_visibility?: VisibilityLevel;
  online_visibility?: VisibilityLevel;
  typing_visibility?: VisibilityLevel;
  read_receipts_visibility?: VisibilityLevel;
  discovery_opt_in?: boolean;
  message_request_policy?: VisibilityLevel;
}

export interface ProfileHistoryEntry {
  id: number;
  changed_fields: string[];
  snapshot: Record<string, any>;
  change_source: string;
  created_at: string;
}

export interface ProfileReportCreate {
  reported_username: string;
  reason: ReportReason;
  description?: string;
}

export interface ProfileReportResponse {
  id: number;
  report_id: string;
  status: string;
  reason: string;
  created_at: string;
}

export interface ActiveSession {
  id: number;
  device_id: string;
  device_name: string;
  device_type: string;
  ip_address?: string;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

export const profileAPI = {
  // ─── Profile CRUD ──────────────────────────────────
  getProfile: async (userId: number): Promise<Profile> => {
    const response = await apiClient.get(`/profile/${userId}`);
    return response.data;
  },

  updateProfile: async (data: ProfileUpdate): Promise<Profile> => {
    const response = await apiClient.post('/profile/update', data);
    return response.data;
  },

  uploadPhoto: async (file: any): Promise<{ avatar_url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/profile/photo/upload', formData, {
      headers: { 'Content-Type': undefined },
    });
    return response.data;
  },

  removePhoto: async (): Promise<void> => {
    await apiClient.delete('/profile/photo');
  },

  // ─── Privacy Settings ──────────────────────────────
  getPrivacySettings: async (): Promise<PrivacySettings> => {
    const response = await apiClient.get('/privacy/settings');
    return response.data;
  },

  updatePrivacySettings: async (data: PrivacySettingsUpdate): Promise<PrivacySettings> => {
    const response = await apiClient.post('/privacy/update', data);
    return response.data;
  },

  getVisibilityMap: async (): Promise<Record<string, any>> => {
    const response = await apiClient.get('/privacy/visibility-map');
    return response.data;
  },

  // ─── Block / Unblock ───────────────────────────────
  blockUser: async (username: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/profile/block', { target_username: username });
    return response.data;
  },

  unblockUser: async (username: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/profile/unblock', { target_username: username });
    return response.data;
  },

  // ─── Reporting ─────────────────────────────────────
  reportUser: async (payload: ProfileReportCreate): Promise<ProfileReportResponse> => {
    const response = await apiClient.post('/profile/report', payload);
    return response.data;
  },

  // ─── Profile History & Recovery ────────────────────
  getHistory: async (limit = 20, offset = 0): Promise<ProfileHistoryEntry[]> => {
    const response = await apiClient.get('/profile/history', {
      params: { limit, offset },
    });
    return response.data;
  },

  rollbackProfile: async (historyId: number): Promise<void> => {
    await apiClient.post('/profile/rollback', { history_id: historyId });
  },

  exportProfile: async (): Promise<Record<string, any>> => {
    const response = await apiClient.get('/profile/export');
    return response.data;
  },

  // ─── Active Sessions ──────────────────────────────
  getSessions: async (): Promise<ActiveSession[]> => {
    const response = await apiClient.get('/sessions');
    return response.data;
  },

  revokeSession: async (sessionId: number): Promise<void> => {
    await apiClient.delete(`/sessions/${sessionId}`);
  },

  revokeAllSessions: async (): Promise<void> => {
    await apiClient.post('/sessions/revoke-all');
  },
};
