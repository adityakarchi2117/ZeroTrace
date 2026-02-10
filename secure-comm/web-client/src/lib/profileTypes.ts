export type VisibilityLevel = 'everyone' | 'friends' | 'nobody';

export type ReportReason =
  | 'fake_profile'
  | 'impersonation'
  | 'harassment'
  | 'spam'
  | 'inappropriate'
  | 'other';

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
  theme?: any;
  banner_url?: string;
  avatar_url?: string;
  avatar_blur?: string;
  is_blocked?: boolean;
  is_friend?: boolean;
  created_at?: string;
  updated_at?: string;
  verification_badges?: any[];
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
}

/** A single profile change history entry */
export interface ProfileHistoryEntry {
  id: number;
  changed_fields: string[];
  snapshot: Record<string, any>;
  change_source: string;
  created_at: string;
}

/** Report creation payload */
export interface ProfileReportCreate {
  reported_username: string;
  reason: ReportReason;
  description?: string;
}

/** Report response from server */
export interface ProfileReportResponse {
  id: number;
  report_id: string;
  status: string;
  reason: string;
  created_at: string;
}

/** Active session / device info */
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

/** Visibility map for all fields */
export interface VisibilityMap {
  profile: VisibilityLevel;
  avatar: VisibilityLevel;
  online: VisibilityLevel;
  last_seen: VisibilityLevel;
  typing: VisibilityLevel;
  read_receipts: VisibilityLevel;
  field_overrides: Record<string, VisibilityLevel>;
}
