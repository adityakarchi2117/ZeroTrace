/**
 * CipherLink API Client
 * Handles all communication with the backend
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface User {
  id: number;
  username: string;
  email: string;
  public_key?: string;
  identity_key?: string;
  is_verified: boolean;
  last_seen?: string;
  created_at: string;
  settings?: any;
}

export interface Message {
  id: number;
  sender_id: number;
  sender_username: string;
  recipient_id: number;
  recipient_username: string;
  encrypted_content: string;
  encrypted_key?: string;
  message_type: string;
  status: string;
  expiry_type: string;
  expires_at?: string;
  file_metadata?: any;
  sender_theme?: {
    bubbleColor?: string;
    textColor?: string;
    style?: 'rounded' | 'glass' | 'neon';
    font?: 'inter' | 'mono';
    accentGradient?: string;
    accentPrimary?: string;
    accentSecondary?: string;
  };
  created_at: string;
  delivered_at?: string;
  read_at?: string;
}

export interface Contact {
  id: number;
  user_id: number;
  contact_id: number;
  contact_username: string;
  contact_email: string;
  public_key?: string;
  identity_key?: string;
  nickname?: string;
  is_blocked: boolean;
  is_verified: boolean;
  added_at: string;
}

export interface Conversation {
  user_id: number;
  username: string;
  public_key?: string;
  identity_key?: string;
  last_message_time?: string;
  last_message_preview?: string;
  unread_count: number;
  is_online: boolean;
}

export interface CallLog {
  id: number;
  caller_id: number;
  caller_username: string;
  receiver_id: number;
  receiver_username: string;
  call_type: 'audio' | 'video';
  status: 'completed' | 'missed' | 'rejected' | 'failed';
  start_time: string;
  end_time?: string;
  duration_seconds: number;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
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

  getToken(): string | null {
    return this.token;
  }

  // ============ Auth ============

  async register(
    username: string,
    email: string,
    password: string,
    deviceId: string
  ): Promise<User> {
    const response = await this.client.post('/api/auth/register', {
      username,
      email,
      password,
      device_id: deviceId,
      device_type: 'web',
    });
    return response.data;
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await this.client.post('/api/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.token = response.data.access_token;
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  async updateSettings(settings: any): Promise<User> {
    const response = await this.client.patch('/api/auth/me/settings', { settings });
    return response.data;
  }

  // ============ Keys ============

  async uploadKeys(keyData: {
    public_key: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
    one_time_prekeys: string[];
  }): Promise<void> {
    await this.client.post('/api/keys/upload', keyData);
  }

  async getPublicKey(username: string): Promise<{ public_key: string; identity_key: string }> {
    const response = await this.client.get(`/api/keys/${username}`);
    return response.data;
  }

  async getKeyBundle(username: string): Promise<{
    user_id: number;
    username: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
    one_time_prekey?: string;
  }> {
    const response = await this.client.get(`/api/keys/bundle/${username}`);
    return response.data;
  }

  // ============ Messages ============

  async sendMessage(
    recipientUsername: string,
    encryptedContent: string,
    encryptedKey?: string,
    expiryType: string = 'none',
    messageType: string = 'text',
    fileMetadata?: any,
    senderTheme?: any
  ): Promise<Message> {
    const response = await this.client.post('/api/messages/send', {
      recipient_username: recipientUsername,
      encrypted_content: encryptedContent,
      encrypted_key: encryptedKey,
      expiry_type: expiryType,
      message_type: messageType,
      file_metadata: fileMetadata,
      sender_theme: senderTheme,
    });
    return response.data;
  }

  async getConversation(username: string): Promise<Message[]> {
    const response = await this.client.get(`/api/messages/conversation/${username}`);
    return response.data;
  }

  async getUnreadMessages(): Promise<Message[]> {
    const response = await this.client.get('/api/messages/unread');
    return response.data;
  }

  async getCallHistory(): Promise<CallLog[]> {
    const response = await this.client.get('/api/messages/calls/history');
    return response.data;
  }

  async deleteMessage(messageId: number): Promise<void> {
    await this.client.delete(`/api/messages/${messageId}`);
  }

  async deleteConversation(username: string): Promise<void> {
    await this.client.delete(`/api/messages/conversation/${username}`);
  }

  async deleteCallHistory(username: string): Promise<void> {
    await this.client.delete(`/api/messages/calls/history/${username}`);
  }

  // ============ Contacts ============

  async getContacts(): Promise<Contact[]> {
    const response = await this.client.get('/api/contacts/');
    return response.data;
  }

  async addContact(username: string, nickname?: string): Promise<Contact> {
    const response = await this.client.post('/api/contacts/', {
      username,
      nickname,
    });
    return response.data;
  }

  async removeContact(contactId: number): Promise<void> {
    await this.client.delete(`/api/contacts/${contactId}`);
  }

  async blockContact(contactId: number): Promise<void> {
    await this.client.post(`/api/contacts/${contactId}/block`);
  }

  async searchUsers(query: string): Promise<Array<{
    id: number;
    username: string;
    public_key?: string;
    identity_key?: string;
    is_online: boolean;
  }>> {
    const response = await this.client.get('/api/contacts/search', {
      params: { q: query },
    });
    return response.data;
  }

  async getConversations(): Promise<Conversation[]> {
    const response = await this.client.get('/api/contacts/conversations');
    return response.data;
  }

  async getAllConversationsWithMessages(): Promise<Record<string, Message[]>> {
    const response = await this.client.get('/api/messages/all-conversations');
    return response.data;
  }

  // ============ Vault ============

  async getVaultItems(): Promise<Array<{
    id: number;
    encrypted_content: string;
    encrypted_key: string;
    iv: string;
    item_type: string;
    encrypted_title?: string;
    created_at: string;
    updated_at: string;
  }>> {
    const response = await this.client.get('/api/vault/items');
    return response.data;
  }

  async createVaultItem(data: {
    encrypted_content: string;
    encrypted_key: string;
    iv: string;
    item_type: string;
    encrypted_title?: string;
    encrypted_tags?: string;
  }): Promise<void> {
    await this.client.post('/api/vault/items', data);
  }
}

export const api = new ApiClient();
