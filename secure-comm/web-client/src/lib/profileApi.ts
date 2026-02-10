import { api } from './api';
import {
  Profile,
  PrivacySettings,
  VisibilityLevel,
  ProfileHistoryEntry,
  ProfileReportCreate,
  ProfileReportResponse,
  ActiveSession,
  VisibilityMap,
} from './profileTypes';

class ProfileApi {

  async getProfile(userId: number): Promise<Profile> {
    const res = await api.http.get(`/api/profile/${userId}`);
    return res.data;
  }

  async updateProfile(payload: Partial<Profile>): Promise<Profile> {
    const res = await api.http.post('/api/profile/update', payload);
    return res.data;
  }

  async uploadAvatar(file: File): Promise<{ avatar_url: string }> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.http.post('/api/profile/photo/upload', form, {
      headers: { 'Content-Type': undefined },
    });
    return res.data;
  }

  async removeAvatar(): Promise<void> {
    await api.http.delete('/api/profile/photo');
  }

  async getPrivacy(): Promise<PrivacySettings> {
    const res = await api.http.get('/api/privacy/settings');
    return res.data;
  }

  async updatePrivacy(payload: Partial<PrivacySettings>): Promise<PrivacySettings> {
    const res = await api.http.post('/api/privacy/update', payload);
    return res.data;
  }

  async getVisibilityMap(): Promise<VisibilityMap> {
    const res = await api.http.get('/api/privacy/visibility-map');
    return res.data;
  }

  async block(username: string): Promise<void> {
    await api.http.post('/api/profile/block', null, { params: { target_username: username } });
  }

  async unblock(username: string): Promise<void> {
    await api.http.post('/api/profile/unblock', null, { params: { target_username: username } });
  }

  async report(payload: ProfileReportCreate): Promise<ProfileReportResponse> {
    const res = await api.http.post('/api/profile/report', payload);
    return res.data;
  }

  async getHistory(limit = 20, offset = 0): Promise<ProfileHistoryEntry[]> {
    const res = await api.http.get('/api/profile/history', { params: { limit, offset } });
    return res.data;
  }

  async rollback(historyId: number): Promise<void> {
    await api.http.post('/api/profile/rollback', { history_id: historyId });
  }

  async exportProfile(): Promise<Record<string, any>> {
    const res = await api.http.get('/api/profile/export');
    return res.data;
  }

  async getSessions(): Promise<ActiveSession[]> {
    const res = await api.http.get('/api/sessions');
    return res.data;
  }

  async revokeSession(sessionId: number): Promise<void> {
    await api.http.delete(`/api/sessions/${sessionId}`);
  }

  async revokeAllSessions(): Promise<void> {
    await api.http.post('/api/sessions/revoke-all');
  }
}

const profileApi = new ProfileApi();
export default profileApi;
