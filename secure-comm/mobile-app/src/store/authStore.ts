import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Keychain from 'react-native-keychain';
import { showMessage } from 'react-native-flash-message';

import { apiClient } from '../services/api';
import { generateKeyPair, generateSigningKeyPair } from '../utils/crypto';

interface User {
  id: number;
  username: string;
  email: string;
  publicKey: string;
  identityKey: string;
  // Snake-case aliases (backend field names used by some screens)
  public_key?: string;
  identity_key?: string;
  user_id?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirstLaunch: boolean;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setFirstLaunch: (value: boolean) => void;
}

const STORAGE_KEYS = {
  USER: '@cipherlink/user',
  TOKEN: '@cipherlink/token',
  FIRST_LAUNCH: '@cipherlink/first_launch',
  PRIVATE_KEY: 'cipherlink_private_key',
  IDENTITY_PRIVATE_KEY: 'cipherlink_identity_private_key',
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isFirstLaunch: true,

  login: async (username: string, password: string) => {
    set({ isLoading: true });

    try {
      const response = await apiClient.post('/auth/login', {
        username,
        password,
      });

      const { access_token, user } = response.data;

      // Store token securely
      await Keychain.setInternetCredentials(
        'cipherlink_token',
        username,
        access_token
      );

      // Store user data
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, access_token);

      // Update API client with token
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      set({
        user,
        token: access_token,
        isAuthenticated: true,
        isLoading: false,
      });

      showMessage({
        message: 'Welcome back!',
        description: 'Successfully signed in to CipherLink',
        type: 'success',
      });
    } catch (error: any) {
      set({ isLoading: false });

      const message = error.response?.data?.detail || 'Login failed';
      showMessage({
        message: 'Login Failed',
        description: message,
        type: 'danger',
      });

      throw error;
    }
  },

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true });

    try {
      // Generate cryptographic keys
      const keyPair = generateKeyPair();
      const signingKeyPair = generateSigningKeyPair();

      // Register user
      const response = await apiClient.post('/auth/register', {
        username,
        email,
        password,
        public_key: keyPair.publicKey,
        identity_key: signingKeyPair.publicKey,
      });

      const { access_token, user } = response.data;

      // Store keys securely
      await Keychain.setInternetCredentials(
        STORAGE_KEYS.PRIVATE_KEY,
        username,
        keyPair.privateKey
      );

      await Keychain.setInternetCredentials(
        STORAGE_KEYS.IDENTITY_PRIVATE_KEY,
        username,
        signingKeyPair.privateKey
      );

      // Store token and user data
      await Keychain.setInternetCredentials(
        'cipherlink_token',
        username,
        access_token
      );

      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, access_token);

      // Update API client
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      set({
        user,
        token: access_token,
        isAuthenticated: true,
        isLoading: false,
      });

      showMessage({
        message: 'Account Created!',
        description: 'Welcome to CipherLink',
        type: 'success',
      });
    } catch (error: any) {
      set({ isLoading: false });

      const message = error.response?.data?.detail || 'Registration failed';
      showMessage({
        message: 'Registration Failed',
        description: message,
        type: 'danger',
      });

      throw error;
    }
  },

  logout: async () => {
    try {
      // Clear secure storage
      await Keychain.resetInternetCredentials('cipherlink_token');
      await Keychain.resetInternetCredentials(STORAGE_KEYS.PRIVATE_KEY);
      await Keychain.resetInternetCredentials(STORAGE_KEYS.IDENTITY_PRIVATE_KEY);

      // Clear async storage
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.USER,
        STORAGE_KEYS.TOKEN,
      ]);

      // Clear API client token
      delete apiClient.defaults.headers.common['Authorization'];

      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });

      showMessage({
        message: 'Signed Out',
        description: 'You have been securely signed out',
        type: 'info',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  initializeAuth: async () => {
    try {
      // Check if first launch
      const firstLaunch = await AsyncStorage.getItem(STORAGE_KEYS.FIRST_LAUNCH);
      if (firstLaunch === null) {
        set({ isFirstLaunch: true });
        return;
      }

      set({ isFirstLaunch: false });

      // Try to restore authentication
      const credentials = await Keychain.getInternetCredentials('cipherlink_token');

      if (credentials && credentials.password) {
        const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);

        if (userJson) {
          const user = JSON.parse(userJson);
          const token = credentials.password;

          // Update API client
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          set({
            user,
            token,
            isAuthenticated: true,
          });
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      // Clear potentially corrupted data
      await get().logout();
    }
  },

  setFirstLaunch: (value: boolean) => {
    set({ isFirstLaunch: value });
    if (!value) {
      AsyncStorage.setItem(STORAGE_KEYS.FIRST_LAUNCH, 'false');
    }
  },
}));