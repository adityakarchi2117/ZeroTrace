import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { showMessage } from 'react-native-flash-message';

// API Configuration
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:8000/api'  // Development
  : 'https://api.cipherlink.app/api';  // Production

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`✅ ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('Response error:', error.response?.status, error.response?.data);
    
    // Handle common errors
    if (error.response?.status === 401) {
      showMessage({
        message: 'Session Expired',
        description: 'Please sign in again',
        type: 'warning',
      });
      // TODO: Trigger logout
    } else if (error.response?.status >= 500) {
      showMessage({
        message: 'Server Error',
        description: 'Please try again later',
        type: 'danger',
      });
    } else if (!error.response) {
      showMessage({
        message: 'Network Error',
        description: 'Please check your internet connection',
        type: 'danger',
      });
    }
    
    return Promise.reject(error);
  }
);

// API Endpoints
export const authAPI = {
  login: (username: string, password: string) =>
    apiClient.post('/auth/login', { username, password }),
  
  register: (userData: {
    username: string;
    email: string;
    password: string;
    public_key: string;
    identity_key: string;
  }) => apiClient.post('/auth/register', userData),
  
  me: () => apiClient.get('/auth/me'),
};

export const keysAPI = {
  uploadKeys: (keyData: {
    public_key: string;
    identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
    one_time_prekeys: string[];
  }) => apiClient.post('/keys/upload', keyData),
  
  getKeyBundle: (username: string) =>
    apiClient.get(`/keys/bundle/${username}`),
  
  getPublicKey: (username: string) =>
    apiClient.get(`/keys/${username}`),
  
  getPrekeyCount: () =>
    apiClient.get('/keys/prekeys/count'),
  
  refillPrekeys: (prekeys: string[]) =>
    apiClient.post('/keys/prekeys/refill', { one_time_prekeys: prekeys }),
};

export const messagesAPI = {
  send: (messageData: {
    recipient_username: string;
    encrypted_content: string;
    message_type: string;
    expiry_type?: string;
  }) => apiClient.post('/messages/send', messageData),
  
  getConversation: (username: string, page: number = 1, limit: number = 50) =>
    apiClient.get(`/messages/conversation/${username}`, {
      params: { page, limit }
    }),
  
  getUnread: () =>
    apiClient.get('/messages/unread'),
  
  markAsRead: (messageId: number) =>
    apiClient.post(`/messages/${messageId}/read`),
};

export const contactsAPI = {
  getContacts: () =>
    apiClient.get('/contacts'),
  
  addContact: (username: string, nickname?: string) =>
    apiClient.post('/contacts', { username, nickname }),
  
  removeContact: (contactId: number) =>
    apiClient.delete(`/contacts/${contactId}`),
  
  blockContact: (contactId: number) =>
    apiClient.post(`/contacts/${contactId}/block`),
  
  searchUsers: (query: string) =>
    apiClient.get('/contacts/search', { params: { q: query } }),
  
  getConversations: () =>
    apiClient.get('/contacts/conversations'),
};

export const vaultAPI = {
  getItems: (page: number = 1, limit: number = 50) =>
    apiClient.get('/vault/items', { params: { page, limit } }),
  
  createItem: (itemData: {
    encrypted_content: string;
    encrypted_key: string;
    iv: string;
    item_type: string;
    encrypted_title?: string;
    encrypted_tags?: string;
  }) => apiClient.post('/vault/items', itemData),
  
  getItem: (itemId: number) =>
    apiClient.get(`/vault/items/${itemId}`),
  
  updateItem: (itemId: number, itemData: any) =>
    apiClient.put(`/vault/items/${itemId}`, itemData),
  
  deleteItem: (itemId: number, permanent: boolean = false) =>
    apiClient.delete(`/vault/items/${itemId}`, { params: { permanent } }),
  
  syncItems: (lastSyncToken?: string) =>
    apiClient.post('/vault/sync', { last_sync_token: lastSyncToken }),
};

// WebSocket URL
export const WS_BASE_URL = API_BASE_URL.replace('http', 'ws').replace('/api', '/ws');

export default apiClient;