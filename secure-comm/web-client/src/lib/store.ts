/**
 * ZeroTrace Global State Store
 * Uses Zustand for state management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, User, Contact, Conversation, Message, CallLog } from './api';
import profileApi from './profileApi';
import { Profile, PrivacySettings } from './profileTypes';
import { friendApi } from './friendApi';
import {
  generateKeyPair,
  generateSigningKeyPair,
  generateKeyBundle,
  KeyStorage,
  encryptMessage,
  decryptMessage,
  EncryptedMessage,
  verifyKeyPair,
  derivePublicKeyFromPrivate
} from './crypto';
import { wsManager } from './websocket';
import { localStorageManager, StoredMessage, StoredConversation, StoredContact } from './storage';
import { buildCurrentMessageTheme } from './themeSync';
import { playMessageSound, initAudioContext } from './sound';
import { secureProfileService } from './secureProfileApi';
import { deviceLinkService } from './deviceLinkService';
import { LegacyMigrationHandler } from './encryptedVault';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface CryptoState {
  privateKey: string | null;
  publicKey: string | null;
  identityKey: string | null;
  identityPrivateKey: string | null;
}

interface ChatState {
  contacts: Contact[];
  conversations: Conversation[];
  currentConversation: string | null;
  messages: Map<string, Message[]>;
  onlineUsers: Set<number>;
  typingUsers: Map<string, boolean>;
  callHistory: CallLog[];
}

interface AppState extends AuthState, CryptoState, ChatState {
  profile: Profile | null;
  privacy: PrivacySettings | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadStoredAuth: () => Promise<void>;

  generateAndUploadKeys: () => Promise<void>;
  loadStoredKeys: () => void;

  loadContacts: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadMessages: (username: string) => Promise<void>;
  loadAllConversationHistory: () => Promise<void>;
  syncWithServer: () => Promise<void>;
  persistMessage: (message: Message) => Promise<void>;
  persistConversation: (conversation: Conversation) => Promise<void>;
  loadPersistedData: () => Promise<void>;
  sendMessage: (recipientUsername: string, content: string, messageType?: string, fileData?: any) => Promise<void>;
  setCurrentConversation: (username: string | null) => void;
  addContact: (username: string) => Promise<void>;
  searchUsers: (query: string) => Promise<Array<{ id: number; username: string }>>;
  addIncomingMessage: (message: Message) => Promise<void>;
  loadCallHistory: () => Promise<void>;
  loadPendingRequests: () => Promise<void>;
  loadProfile: (userId?: number) => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  updatePrivacy: (data: Partial<PrivacySettings>) => Promise<void>;
  loadPrivacy: () => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  blockUser: (username: string) => Promise<void>;
  unblockUser: (username: string) => Promise<void>;
  removeAvatar: () => Promise<void>;
  reportUser: (username: string, reason: string, description?: string) => Promise<string>;

  deleteMessageForMe: (messageId: number, conversationUsername: string) => Promise<void>;
  deleteMessageForEveryone: (messageId: number, conversationUsername: string) => Promise<void>;
  clearChat: (username: string) => Promise<void>;
  deleteConversationForEveryone: (username: string) => Promise<void>;
  handleRemoteDeleteMessage: (messageId: number, senderUsername: string) => void;
  handleRemoteDeleteConversation: (senderUsername: string) => void;

  setUserOnline: (userId: number, isOnline: boolean) => void;
  setUserTyping: (username: string, isTyping: boolean) => void;

  clearError: () => void;
  initializeWebSocket: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({

      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      privateKey: null,
      publicKey: null,
      identityKey: null,
      identityPrivateKey: null,
      contacts: [],
      conversations: [],
      currentConversation: null,
      messages: new Map(),
      onlineUsers: new Set(),
      typingUsers: new Map(),
      callHistory: [],
      profile: null,
      privacy: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login(username, password);

          friendApi.setToken(response.access_token);
          let user = await api.getCurrentUser();

          if (user.settings) {
            try {
              const existing = localStorage.getItem('zerotrace_appearance');
              const localSettings = existing ? JSON.parse(existing) : {};
              const newSettings = { ...localSettings, ...user.settings };
              const newValue = JSON.stringify(newSettings);

              localStorage.setItem('zerotrace_appearance', newValue);

              window.dispatchEvent(new StorageEvent('storage', {
                key: 'zerotrace_appearance',
                newValue: newValue,
                storageArea: localStorage,
                url: window.location.href
              }));
            } catch (e) {
              console.error('Failed to sync settings', e);
            }
          }

          localStorage.setItem('zerotrace_token', response.access_token);
          localStorage.setItem('zerotrace_username', username);

          let keys = KeyStorage.load(username);
          let needsUpload = !user.public_key;
          let keyMismatch = false;

          if (keys && user.public_key) {
            const isConsistent = KeyStorage.verifyKeyConsistency(username, user.public_key);
            if (!isConsistent) {
              console.warn('⚠️ Key mismatch detected! Local key differs from server key.');
              console.warn('This may happen if you logged in from a different device.');
              console.warn('Old messages encrypted with the server key may not decrypt correctly.');
              keyMismatch = true;

            }
          }

          if (!keys) {

            console.log('🔐 Generating new key bundle...');
            const { bundle, privateKeys } = generateKeyBundle(5);

            keys = {
              privateKey: privateKeys.signedPrekeyPrivate,
              publicKey: bundle.publicKey,
              identityKey: bundle.identityKey,
              signedPrekey: bundle.signedPrekey,
              signedPrekeySignature: bundle.signedPrekeySignature,
              identityPrivateKey: privateKeys.identityPrivate,
              oneTimePrekeys: bundle.oneTimePrekeys,
            };
            KeyStorage.save(username, keys);
            needsUpload = true;
            console.log('✅ Key bundle generated');
          }

          if (keys.privateKey && keys.publicKey) {
            const isValidPair = verifyKeyPair(keys.privateKey, keys.publicKey);
            console.log('🔑 Key pair verification:', isValidPair ? '✅ VALID' : '❌ INVALID');

            if (!isValidPair) {

              console.warn('⚠️ Key pair mismatch detected! Deriving correct public key...');
              const correctPublicKey = derivePublicKeyFromPrivate(keys.privateKey);
              console.log('🔧 Original publicKey:', keys.publicKey?.substring(0, 30));
              console.log('🔧 Derived publicKey:', correctPublicKey?.substring(0, 30));

              keys.publicKey = correctPublicKey;
              KeyStorage.save(username, keys);
              needsUpload = true;
              console.log('✅ Key pair corrected and saved');
            }
          }

          if (needsUpload && keys) {
            console.log('📤 Uploading keys to server...', {
              publicKeyToUpload: keys.publicKey?.substring(0, 30),
            });
            try {
              await api.uploadKeys({
                public_key: keys.publicKey || '',
                identity_key: keys.identityKey || '',
                signed_prekey: keys.signedPrekey || keys.publicKey || '',
                signed_prekey_signature: keys.signedPrekeySignature || '',
                one_time_prekeys: keys.oneTimePrekeys || [],
              });

              user = await api.getCurrentUser();
              console.log('✅ Keys uploaded successfully!', {
                serverNowHas: user.public_key?.substring(0, 30),
              });
            } catch (uploadError: any) {
              console.error('❌ Failed to upload keys:', uploadError?.response?.data || uploadError);
            }
          }

          const localServerMatch = keys?.publicKey === user.public_key;
          console.log('🔐 Final Key Status:', {
            username,
            localPubKey: keys?.publicKey?.substring(0, 30),
            serverPubKey: user.public_key?.substring(0, 30),
            localPrivKey: keys?.privateKey?.substring(0, 30),
            LOCAL_MATCHES_SERVER: localServerMatch ? '✅ YES' : '❌ NO',
          });

          if (!localServerMatch && keys?.publicKey && user.public_key) {
            console.error('🚨 CRITICAL: Local public key does not match server! This will cause decryption failures.');
            console.log('🔧 Attempting to force upload correct key...');
            try {
              await api.uploadKeys({
                public_key: keys.publicKey || '',
                identity_key: keys.identityKey || '',
                signed_prekey: keys.signedPrekey || keys.publicKey || '',
                signed_prekey_signature: keys.signedPrekeySignature || '',
                one_time_prekeys: keys.oneTimePrekeys || [],
              });
              user = await api.getCurrentUser();
              console.log('✅ Force upload complete, server now has:', user.public_key?.substring(0, 30));
            } catch (e) {
              console.error('❌ Force upload failed:', e);
            }
          }

          set({
            user,
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
            privateKey: keys.privateKey || null,
            publicKey: keys.publicKey || null,
            identityKey: keys.identityKey || null,
          });

          wsManager.connect(user.id.toString(), response.access_token);

          if (!(window as any)._wsHandlersRegistered) {
            setupWebSocketHandlers(get, set);
            (window as any)._wsHandlersRegistered = true;
          }

          // Load profile so display_name, avatar, bio etc. are available in state
          get().loadProfile().catch(err => console.warn('⚠️ Profile load on login (non-fatal):', err));

          // Initialize secure profile system (DEK, encrypted profile restore)
          if (keys?.publicKey && keys?.privateKey) {
            secureProfileService.initializeOnLogin(
              username,
              keys.publicKey,
              keys.privateKey,
            ).then(ok => {
              if (ok) console.log('🔐 Secure profile system initialized');
              else console.warn('⚠️ Secure profile init returned false');
            }).catch(err => {
              console.warn('⚠️ Secure profile init error (non-fatal):', err);
            });

            // Register primary device & restore keys on login
            deviceLinkService.registerPrimaryDevice(username)
              .then(() => deviceLinkService.restoreKeysOnLogin(username))
              .then(({ dekBundle, sessionKeyCount, deviceAuthorized }) => {
                console.log(`📱 Device sync: authorized=${deviceAuthorized}, sessions=${sessionKeyCount}`);
                // Migrate legacy session keys if needed
                if (LegacyMigrationHandler.needsMigration()) {
                  LegacyMigrationHandler.migrate(username).then(report => {
                    console.log(`📦 Legacy migration: ${report.sessionKeysMigrated} keys migrated`);
                  }).catch(err => console.warn('⚠️ Legacy migration error:', err));
                }
              })
              .catch(err => console.warn('⚠️ Device sync init error (non-fatal):', err));
          }

        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Login failed',
          });
          throw error;
        }
      },

      register: async (username: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const deviceId = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await api.register(username, email, password, deviceId);

          await get().login(username, password);

        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Registration failed',
          });
          throw error;
        }
      },

      logout: () => {
        wsManager.disconnect();
        (window as any)._wsHandlersRegistered = false;
        localStorage.removeItem('zerotrace_token');
        localStorage.removeItem('zerotrace_username');
        api.setToken(null);
        friendApi.setToken(null);

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          privateKey: null,
          publicKey: null,
          identityKey: null,
          identityPrivateKey: null,
          contacts: [],
          conversations: [],
          currentConversation: null,
          messages: new Map(),
          onlineUsers: new Set(),
          typingUsers: new Map(),
          callHistory: [],
        });
      },

      initializeWebSocket: () => {
        const { user, token } = get();
        if (user && token) {

          wsManager.connect(user.id.toString(), token);

          const globalWindow = window as any;
          if (!globalWindow._zerotraceWsHandlersRegistered) {
            setupWebSocketHandlers(get, set);
            globalWindow._zerotraceWsHandlersRegistered = true;
            console.log('🔌 WebSocket handlers registered');
          }
        }
      },

      loadStoredAuth: async () => {
        const token = localStorage.getItem('zerotrace_token');
        const username = localStorage.getItem('zerotrace_username');

        if (token && username) {
          api.setToken(token);
          friendApi.setToken(token);
          try {
            const user = await api.getCurrentUser();

            if (user.settings) {
              try {
                const existing = localStorage.getItem('cipherlink_appearance');
                const localSettings = existing ? JSON.parse(existing) : {};
                const newSettings = { ...localSettings, ...user.settings };
                const newValue = JSON.stringify(newSettings);

                localStorage.setItem('cipherlink_appearance', newValue);

                window.dispatchEvent(new StorageEvent('storage', {
                  key: 'cipherlink_appearance',
                  newValue: newValue,
                  storageArea: localStorage,
                  url: window.location.href
                }));
              } catch (e) {
                console.error('Failed to sync settings', e);
              }
            }

            const keys = KeyStorage.load(username);

            set({
              user,
              token,
              isAuthenticated: true,
              privateKey: keys?.privateKey || null,
              publicKey: keys?.publicKey || null,
              identityKey: keys?.identityKey || null,
            });

            wsManager.connect(user.id.toString(), token);

            if (!(window as any)._wsHandlersRegistered) {
              setupWebSocketHandlers(get, set);
              (window as any)._wsHandlersRegistered = true;
            }

            // Initialize secure profile on session restore
            if (keys?.publicKey && keys?.privateKey) {
              secureProfileService.initializeOnLogin(
                username,
                keys.publicKey,
                keys.privateKey,
              ).catch(err => {
                console.warn('⚠️ Secure profile init error (non-fatal):', err);
              });

              // Restore device keys on session reload
              deviceLinkService.restoreKeysOnLogin(username)
                .then(({ dekBundle, sessionKeyCount, deviceAuthorized }) => {
                  console.log(`📱 Session restore: device authorized=${deviceAuthorized}, sessions=${sessionKeyCount}`);
                })
                .catch(err => console.warn('⚠️ Device key restore error (non-fatal):', err));
            }

            // Load profile so display_name, avatar, bio etc. are available in state
            get().loadProfile().catch(err => console.warn('⚠️ Profile load on restore (non-fatal):', err));

            await get().loadPersistedData();

            get().syncWithServer().catch(console.error);

            return;
          } catch {

            localStorage.removeItem('zerotrace_token');
            localStorage.removeItem('zerotrace_username');
          }
        }
      },

      generateAndUploadKeys: async () => {
        const { user } = get();
        if (!user) return;

        const keyPair = generateKeyPair();
        const signingPair = generateSigningKeyPair();

        KeyStorage.save(user.username, {
          privateKey: keyPair.privateKey,
          publicKey: keyPair.publicKey,
          identityKey: signingPair.publicKey,
        });

        await api.uploadKeys({
          public_key: keyPair.publicKey,
          identity_key: signingPair.publicKey,
          signed_prekey: keyPair.publicKey,
          signed_prekey_signature: signingPair.publicKey,
          one_time_prekeys: [],
        });

        set({
          privateKey: keyPair.privateKey,
          publicKey: keyPair.publicKey,
          identityKey: signingPair.publicKey,
        });
      },

      loadStoredKeys: () => {
        const { user } = get();
        if (!user) return;

        const keys = KeyStorage.load(user.username);
        if (keys) {
          set({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            identityKey: keys.identityKey,
          });
        }
      },

      loadContacts: async () => {
        try {

          const trustedContacts = await friendApi.getTrustedContacts();

          const contacts: Contact[] = trustedContacts.map(tc => ({
            id: tc.id,
            user_id: tc.user_id,
            contact_id: tc.contact_user_id,
            contact_username: tc.contact_username,
            contact_email: '',
            public_key: tc.public_key,
            identity_key: tc.identity_key,
            nickname: tc.nickname,
            is_blocked: false,
            is_verified: tc.is_verified,
            added_at: tc.created_at,
          }));

          set({ contacts });
          console.log(`✅ Loaded ${contacts.length} trusted contacts`);
        } catch (error) {
          console.error('Failed to load contacts:', error);

          try {
            const contacts = await api.getContacts();
            set({ contacts });
          } catch (fallbackError) {
            console.error('Fallback contacts load also failed:', fallbackError);
          }
        }
      },

      loadConversations: async () => {
        try {
          const conversations = await api.getConversations();
          set({ conversations });
        } catch (error) {
          console.error('Failed to load conversations:', error);
        }
      },

      loadMessages: async (username: string) => {
        try {
          const messages = await api.getConversation(username);
          console.log(`📥 Loaded ${messages.length} messages from server for ${username}`);

          const currentMessages = get().messages.get(username) || [];
          const existingIds = new Set(currentMessages.map(m => m.id));

          const newEncryptedMessages = [];
          for (const msg of messages) {
            if (!existingIds.has(msg.id)) {
              newEncryptedMessages.push(msg);
            }
          }

          if (newEncryptedMessages.length > 0) {
            const optimisticallyMergedMessages = [...currentMessages, ...newEncryptedMessages];

            optimisticallyMergedMessages.sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            const optimisticMap = new Map(get().messages);
            optimisticMap.set(username, optimisticallyMergedMessages);
            set({ messages: optimisticMap });
          }

          const { privateKey, contacts, user, publicKey } = get();

          if (privateKey) {

            let contactPublicKey: string | undefined;
            try {
              const keyData = await api.getPublicKey(username);
              contactPublicKey = keyData.public_key;
              console.log(`📥 Got public key for ${username}:`, contactPublicKey?.substring(0, 30));
            } catch (e) {
              console.warn(`Could not fetch public key for ${username}:`, e);

              const contact = contacts.find(c => c.contact_username === username);
              contactPublicKey = contact?.public_key;
            }

            for (const msg of messages) {

              if (msg.encrypted_content && !msg._decryptedContent) {
                try {
                  const encryptedData = JSON.parse(msg.encrypted_content) as EncryptedMessage;
                  const isMine = msg.sender_username === user?.username;

                  // For both sent and received messages, the contact's public key is correct:
                  // - Sent: I encrypted with (contactPub, myPriv), decrypt needs (contactPub, myPriv)
                  // - Received: Sender encrypted with (myPub, senderPriv), decrypt needs (senderPub, myPriv)
                  // For sent messages, strip the embedded senderPublicKey (which is MY key, not the contact's)
                  const encForDecrypt = isMine
                    ? { ...encryptedData, senderPublicKey: undefined }
                    : encryptedData;

                  const decrypted = decryptMessage(encForDecrypt, contactPublicKey || '', privateKey);
                  msg._decryptedContent = decrypted;
                } catch (e) {
                  console.warn('Failed to decrypt message:', msg.id, e);
                  msg._decryptedContent = '[Decryption Failed]';
                }
              }
            }
          }

          const finalMessages = [...currentMessages];

          for (const msg of messages) {
            const existingIndex = finalMessages.findIndex(m => m.id === msg.id);
            if (existingIndex >= 0) {

              finalMessages[existingIndex] = { ...finalMessages[existingIndex], ...msg };
            } else {

              if (!existingIds.has(msg.id)) {
                finalMessages.push(msg);
              }
            }
          }

          finalMessages.sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          const newMessages = new Map(get().messages);
          newMessages.set(username, finalMessages);
          set({ messages: newMessages });

          console.log(`✅ Merged and decrypted messages for ${username}: ${finalMessages.length} total`);
        } catch (error) {
          console.error('Failed to load messages:', error);
        }
      },

      sendMessage: async (recipientUsername: string, content: string, messageType: string = 'text', fileData?: any) => {
        console.log('📤 sendMessage called:', { recipientUsername, content: content.substring(0, 50), messageType });

        let { privateKey, publicKey, user, contacts } = get();
        if (!privateKey || !publicKey || !user) {
          console.error('Cannot send message: missing keys or user', { hasPrivateKey: !!privateKey, hasPublicKey: !!publicKey, hasUser: !!user });
          return;
        }

        let isFriend = contacts.some(c => c.contact_username === recipientUsername && !c.is_blocked);

        if (!isFriend) {
          console.log('🔄 Friend not found in local state, refreshing contacts from server...');
          await get().loadContacts();

          const freshContacts = get().contacts;
          isFriend = freshContacts.some(c => c.contact_username === recipientUsername && !c.is_blocked);
          console.log('🔄 After refresh - isFriend:', isFriend, 'contacts:', freshContacts.map(c => c.contact_username));
        }

        if (!isFriend) {
          console.error('❌ Cannot send message: Not friends with', recipientUsername);
          throw new Error('You must be friends with this user to send messages. Send a friend request first.');
        }

        const isValidPair = verifyKeyPair(privateKey, publicKey);
        if (!isValidPair) {
          console.warn('⚠️ Invalid key pair detected in sendMessage! Deriving correct public key...');
          publicKey = derivePublicKeyFromPrivate(privateKey);
          console.log('🔧 Using derived publicKey:', publicKey?.substring(0, 30));

          set({ publicKey });
        }

        console.log('📤 Fetching public key from server for:', recipientUsername);
        let recipientPublicKey: string | undefined;
        try {
          const keyData = await api.getPublicKey(recipientUsername);
          recipientPublicKey = keyData.public_key;
          console.log('📤 Got recipient public key from server:', recipientPublicKey?.substring(0, 30));
        } catch (error) {
          console.error('Failed to get recipient public key:', error);
          throw new Error('Could not get recipient encryption key');
        }

        if (!recipientPublicKey) {
          throw new Error('Recipient has not set up encryption');
        }

        console.log('📤 Encrypting with:', {
          recipientPubKey: recipientPublicKey?.substring(0, 30),
          senderPrivKey: privateKey?.substring(0, 30),
          senderPubKey: publicKey?.substring(0, 30),
        });
        const encrypted = encryptMessage(content, recipientPublicKey, privateKey, publicKey);
        const encryptedContent = JSON.stringify(encrypted);

        const senderTheme = buildCurrentMessageTheme();

        const currentMessages = get().messages.get(recipientUsername) || [];
        const optimisticId = -Date.now();
        const optimisticMessage: Message = {
          id: optimisticId,
          sender_id: user.id,
          sender_username: user.username,
          recipient_id: 0,
          recipient_username: recipientUsername,
          encrypted_content: encryptedContent,
          message_type: messageType,
          status: 'sending',
          expiry_type: 'none',
          created_at: new Date().toISOString(),
          _decryptedContent: content,
          sender_theme: senderTheme,
        };

        const newMessages = new Map(get().messages);
        newMessages.set(recipientUsername, [...currentMessages, optimisticMessage]);
        set({ messages: newMessages });

        try {
          console.log('📤 Sending to API...');
          const sentMessage = await api.sendMessage(
            recipientUsername,
            encryptedContent,
            undefined,
            'none',
            messageType,
            fileData,
            senderTheme
          );

          console.log('✅ Message sent successfully', sentMessage);

          sentMessage._decryptedContent = content;

          const updatedMessages = new Map(get().messages);
          const userMessages = updatedMessages.get(recipientUsername) || [];
          const index = userMessages.findIndex(m => m.id === optimisticId);

          if (index !== -1) {
            userMessages[index] = sentMessage;
          } else {
            userMessages.push(sentMessage);
          }

          updatedMessages.set(recipientUsername, userMessages);
          set({ messages: updatedMessages });

          try {
            await get().persistMessage(sentMessage);
          } catch (e) {
            console.error('❌ Failed to persist sent message:', e);
          }

          const stateAfterSend = get();
          const existingConvIndex = stateAfterSend.conversations.findIndex(c => c.username === recipientUsername);
          if (existingConvIndex >= 0) {
            const conversations = [...stateAfterSend.conversations];
            const conv = conversations[existingConvIndex];
            const updatedConv = {
              ...conv,
              last_message_time: sentMessage.created_at,
              last_message_preview: messageType === 'image' ? '📷 Image' : content,
            };
            conversations[existingConvIndex] = updatedConv;
            set({ conversations });

            try {
              await get().persistConversation(updatedConv);
            } catch (e) {
              console.error('❌ Failed to persist conversation after send:', e);
            }
          }

        } catch (error) {
          console.error('Failed to send message:', error);

          const updatedMessages = new Map(get().messages);
          const userMessages = updatedMessages.get(recipientUsername) || [];
          const index = userMessages.findIndex(m => m.id === optimisticId);
          if (index !== -1) {
            userMessages[index].status = 'failed';
            updatedMessages.set(recipientUsername, userMessages);
            set({ messages: updatedMessages });
          }
          throw error;
        }
      },

      setCurrentConversation: (username: string | null) => {
        set({ currentConversation: username });
        if (username) {
          get().loadMessages(username);

          const state = get();
          const newTypingUsers = new Map(state.typingUsers);
          newTypingUsers.delete(username);
          set({ typingUsers: newTypingUsers });

          // Mark all messages from this user as "notified" so they
          // never re-pop a browser Notification on reconnect.
          const conversationMessages = state.messages.get(username) || [];
          conversationMessages.forEach(m => {
            localStorageManager.markMessageNotified(m.id).catch(() => {});
          });
        }
      },

      addContact: async (username: string) => {
        try {
          const contact = await api.addContact(username);
          const state = get();
          set({ contacts: [...state.contacts, contact] });

          const existingConv = state.conversations.find(c => c.username === username);
          if (!existingConv) {
            const newConversation: Conversation = {
              user_id: contact.contact_id,
              username: contact.contact_username,
              public_key: contact.public_key,
              identity_key: contact.identity_key,
              last_message_time: undefined,
              last_message_preview: undefined,
              unread_count: 0,
              is_online: false
            };
            set({ conversations: [newConversation, ...state.conversations] });
          }
        } catch (error) {
          console.error('Failed to add contact:', error);
          throw error;
        }
      },

      searchUsers: async (query: string) => {
        try {
          return await api.searchUsers(query);
        } catch (error) {
          console.error('Failed to search users:', error);
          return [];
        }
      },

      addIncomingMessage: async (message: Message) => {
        const state = get();
        const senderUsername = message.sender_username;
        const currentConversation = get().currentConversation;

        const currentMessages = get().messages.get(senderUsername) || [];
        const exists = currentMessages.some(m => m.id === message.id);

        if (!exists) {

          const { privateKey, contacts } = get();
          if (privateKey && message.encrypted_content) {
            try {
              const encryptedData = JSON.parse(message.encrypted_content) as EncryptedMessage;

              let fallbackPublicKey = '';
              const contact = contacts.find(
                c => c.contact_username === message.sender_username
              );

              if (contact?.public_key) {
                fallbackPublicKey = contact.public_key;
              } else if (!encryptedData.senderPublicKey) {

                try {
                  const keyData = await api.getPublicKey(message.sender_username);
                  fallbackPublicKey = keyData.public_key || '';
                  console.log('📥 Fetched sender public key for decryption:', fallbackPublicKey?.substring(0, 30));
                } catch (e) {
                  console.warn('Could not fetch sender public key:', e);
                }
              }

              message._decryptedContent = decryptMessage(
                encryptedData,
                fallbackPublicKey,
                privateKey
              );

              if (message._decryptedContent) {
                console.log('✅ Successfully decrypted incoming message');
              } else {
                console.warn('⚠️ Decryption returned null for message:', message.id);
              }
            } catch (e) {
              console.error('❌ Decryption failed for incoming:', e);
            }
          }

          const newMessages = new Map(get().messages);
          newMessages.set(senderUsername, [...currentMessages, message]);
          set({ messages: newMessages });

          const convIndex = state.conversations.findIndex(c => c.username === senderUsername);
          if (convIndex >= 0) {
            const conversations = [...state.conversations];
            const updatedConv = {
              ...conversations[convIndex],
              last_message_time: message.created_at,
              last_message_preview: message._decryptedContent
                ? (message.message_type === 'image' ? '📷 Image' : message._decryptedContent)
                : '[Encrypted Message]',
              unread_count: (conversations[convIndex].unread_count || 0) + 1
            };
            conversations[convIndex] = updatedConv;
            set({ conversations });

            get().persistMessage(message).catch(err =>
              console.error('❌ Failed to persist incoming message:', err)
            );
            get().persistConversation(updatedConv).catch(err =>
              console.error('❌ Failed to persist conversation for incoming message:', err)
            );

            initAudioContext();
            playMessageSound();

            if (state.contacts.some(c => c.contact_username === senderUsername) && message.status !== 'read' && state.currentConversation !== senderUsername && 'Notification' in window && Notification.permission === 'granted') {
              // De-dup: only notify if we haven't already shown a notification for this ID
              localStorageManager.wasMessageNotified(message.id).then(alreadyNotified => {
                if (!alreadyNotified) {
                  new Notification(`New message from ${senderUsername}`, {
                    body: message._decryptedContent || 'New encrypted message',
                    icon: '/favicon.ico',
                    tag: `msg-${message.id}`,
                  });
                  localStorageManager.markMessageNotified(message.id).catch(() => {});
                }
              }).catch(() => {});
            }
          } else {

            const newConversation = {
              user_id: message.sender_id,
              username: senderUsername,
              public_key: undefined,
              identity_key: undefined,
              last_message_time: message.created_at,
              last_message_preview: message._decryptedContent
                ? (message.message_type === 'image' ? '📷 Image' : message._decryptedContent)
                : '[Encrypted Message]',
              unread_count: 1,
              is_online: false,
            };
            set({ conversations: [newConversation, ...state.conversations] });

            get().persistMessage(message).catch(err =>
              console.error('❌ Failed to persist incoming message:', err)
            );
            get().persistConversation(newConversation).catch(err =>
              console.error('❌ Failed to persist new conversation for incoming message:', err)
            );

            initAudioContext();
            playMessageSound();

            if (state.contacts.some(c => c.contact_username === senderUsername) && message.status !== 'read' && state.currentConversation !== senderUsername && 'Notification' in window && Notification.permission === 'granted') {
              // De-dup: only notify if we haven't already shown a notification for this ID
              localStorageManager.wasMessageNotified(message.id).then(alreadyNotified => {
                if (!alreadyNotified) {
                  new Notification(`New message from ${senderUsername}`, {
                    body: message._decryptedContent || 'New encrypted message',
                    icon: '/favicon.ico',
                    tag: `msg-${message.id}`,
                  });
                  localStorageManager.markMessageNotified(message.id).catch(() => {});
                }
              }).catch(() => {});
            }
          }
        }
      },

      loadCallHistory: async () => {
        try {
          const history = await api.getCallHistory();
          set({ callHistory: history });
        } catch (error) {
          console.error('Failed to load call history:', error);
        }
      },

      loadProfile: async (userId?: number) => {
        const targetId = userId ?? get().user?.id;
        if (!targetId) return;
        try {
          const profile = await profileApi.getProfile(targetId);
          set({ profile });
        } catch (error) {
          console.error('Failed to load profile', error);
        }
      },

      updateProfile: async (data: Partial<Profile>) => {
        try {
          const profile = await profileApi.updateProfile(data);
          set({ profile });
        } catch (error) {
          console.error('Failed to update profile', error);
          throw error;
        }
      },

      uploadAvatar: async (file: File) => {
        try {
          const res = await profileApi.uploadAvatar(file);
          const profile = get().profile;
          set({ profile: { ...(profile || {}), avatar_url: res.avatar_url } as Profile });
        } catch (error) {
          console.error('Upload failed:', error);
          throw error;
        }
      },

      updatePrivacy: async (data: Partial<PrivacySettings>) => {
        try {
          const privacy = await profileApi.updatePrivacy(data);
          set({ privacy });
        } catch (error) {
          console.error('Failed to update privacy', error);
          throw error;
        }
      },

      loadPrivacy: async () => {
        try {
          const privacy = await profileApi.getPrivacy();
          set({ privacy });
        } catch (error) {
          console.error('Failed to load privacy settings', error);
        }
      },

      blockUser: async (username: string) => {
        await profileApi.block(username);
        set(state => ({
          contacts: state.contacts.map(c =>
            c.contact_username === username ? { ...c, is_blocked: true } : c
          ),
        }));
      },

      unblockUser: async (username: string) => {
        await profileApi.unblock(username);
        set(state => ({
          contacts: state.contacts.map(c =>
            c.contact_username === username ? { ...c, is_blocked: false } : c
          ),
        }));
      },

      removeAvatar: async () => {
        await profileApi.removeAvatar();
        const profile = get().profile;
        if (profile) {
          set({ profile: { ...profile, avatar_url: undefined, avatar_blur: undefined } });
        }
      },

      reportUser: async (username: string, reason: string, description?: string) => {
        const result = await profileApi.report({
          reported_username: username,
          reason: reason as any,
          description,
        });
        return result.report_id;
      },

      loadPendingRequests: async () => {
        try {
          const pending = await friendApi.getPendingRequests();
          console.log('📋 Pending friend requests:', pending);

        } catch (error) {
          console.error('Failed to load pending requests:', error);
        }
      },

      setUserOnline: (userId: number, isOnline: boolean) => {
        const state = get();
        const newOnlineUsers = new Set(state.onlineUsers);
        if (isOnline) {
          newOnlineUsers.add(userId);
        } else {
          newOnlineUsers.delete(userId);
        }
        set({ onlineUsers: newOnlineUsers });
      },

      setUserTyping: (username: string, isTyping: boolean) => {
        const state = get();
        const newTypingUsers = new Map(state.typingUsers);
        if (isTyping) {
          newTypingUsers.set(username, true);
        } else {
          newTypingUsers.delete(username);
        }
        set({ typingUsers: newTypingUsers });
      },

      clearError: () => set({ error: null }),

      deleteMessageForMe: async (messageId: number, conversationUsername: string) => {

        try {

          const currentMessages = new Map(get().messages);
          const convMessages = currentMessages.get(conversationUsername) || [];
          const updatedMessages = convMessages.filter(m => m.id !== messageId);
          currentMessages.set(conversationUsername, updatedMessages);
          set({ messages: currentMessages });

          await localStorageManager.deleteMessage(messageId);
          console.log('🗑️ Message deleted locally:', messageId);
        } catch (error) {
          console.error('Failed to delete message locally:', error);
        }
      },

      deleteMessageForEveryone: async (messageId: number, conversationUsername: string) => {

        try {

          const currentMessages = new Map(get().messages);
          const convMessages = currentMessages.get(conversationUsername) || [];
          const updatedMessages = convMessages.map(m => {
            if (m.id === messageId) {
              return {
                ...m,
                _decryptedContent: null,
                encrypted_content: JSON.stringify({ deleted: true }),
                message_type: 'deleted',
              };
            }
            return m;
          });
          currentMessages.set(conversationUsername, updatedMessages);
          set({ messages: currentMessages });

          await localStorageManager.markMessageAsDeleted(messageId);

          wsManager.sendDeleteMessage(messageId, conversationUsername);

          try {
            await api.deleteMessage(messageId);
          } catch (e) {
            console.warn('Could not delete message on server:', e);
          }

          console.log('🗑️ Message deleted for everyone:', messageId);
        } catch (error) {
          console.error('Failed to delete message for everyone:', error);
        }
      },

      clearChat: async (username: string) => {

        try {
          const { user } = get();
          if (!user) return;

          const currentMessages = new Map(get().messages);
          currentMessages.set(username, []);
          set({ messages: currentMessages });

          await localStorageManager.clearConversationMessages(username, user.username);

          const currentCalls = get().callHistory;
          const filteredCalls = currentCalls.filter(call =>
            call.caller_username !== username && call.receiver_username !== username
          );
          set({ callHistory: filteredCalls });

          try {

            await api.deleteCallHistory(username);
          } catch (e) {
            console.warn('Failed to delete call history on server:', e);
          }

          const conversations = [...get().conversations];
          const convIndex = conversations.findIndex(c => c.username === username);
          if (convIndex >= 0) {
            conversations[convIndex] = {
              ...conversations[convIndex],
              last_message_preview: undefined,
              last_message_time: undefined,
              unread_count: 0,
            };
            set({ conversations });
          }

          console.log('🧹 Chat cleared locally:', username);
        } catch (error) {
          console.error('Failed to clear chat:', error);
        }
      },

      deleteConversationForEveryone: async (username: string) => {

        try {
          const { user } = get();
          if (!user) return;

          const currentMessages = new Map(get().messages);
          currentMessages.set(username, []);
          set({ messages: currentMessages });

          const conversations = [...get().conversations];
          const convIndex = conversations.findIndex(c => c.username === username);
          if (convIndex >= 0) {
            conversations[convIndex] = {
              ...conversations[convIndex],
              last_message_preview: 'Chat cleared',
              last_message_time: new Date().toISOString(),
              unread_count: 0,
            };
            set({ conversations });
          }

          await localStorageManager.clearConversationMessages(username, user.username);

          wsManager.sendDeleteConversation(username);

          try {
            await api.deleteConversation(username);
          } catch (e) {
            console.warn('Could not delete conversation messages on server:', e);
          }

          console.log('🗑️ Conversation messages deleted for everyone:', username);
        } catch (error) {
          console.error('Failed to delete conversation messages for everyone:', error);
        }
      },

      handleRemoteDeleteMessage: (messageId: number, senderUsername: string) => {

        const currentMessages = new Map(get().messages);
        const convMessages = currentMessages.get(senderUsername) || [];
        const updatedMessages = convMessages.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              _decryptedContent: null,
              encrypted_content: JSON.stringify({ deleted: true }),
              message_type: 'deleted',
            };
          }
          return m;
        });
        currentMessages.set(senderUsername, updatedMessages);
        set({ messages: currentMessages });

        localStorageManager.markMessageAsDeleted(messageId).catch(console.error);
        console.log('📨 Remote message deletion received:', messageId);
      },

      handleRemoteDeleteConversation: (senderUsername: string) => {

        const currentMessages = new Map(get().messages);
        currentMessages.set(senderUsername, []);
        set({ messages: currentMessages });

        const conversations = [...get().conversations];
        const convIndex = conversations.findIndex(c => c.username === senderUsername);
        if (convIndex >= 0) {
          conversations[convIndex] = {
            ...conversations[convIndex],
            last_message_preview: 'Chat cleared',
            last_message_time: new Date().toISOString(),
            unread_count: 0,
          };
          set({ conversations });
        }

        const user = get().user;
        if (user) {
          localStorageManager.clearConversationMessages(senderUsername, user.username).catch(console.error);
        }

        console.log('📨 Remote conversation cleared:', senderUsername);
      },

      loadPersistedData: async () => {
        try {
          console.log('📂 Loading persisted data from IndexedDB...');

          const storedConversations = await localStorageManager.getAllConversations();
          if (storedConversations.length > 0) {
            const conversations = storedConversations.map(conv => ({
              user_id: conv.user_id,
              username: conv.username,
              public_key: conv.public_key,
              identity_key: conv.identity_key,
              last_message_time: conv.last_message_time,
              last_message_preview: conv.last_message_preview,
              unread_count: conv.unread_count,
              is_online: conv.is_online
            }));
            set({ conversations });
            console.log(`📂 Loaded ${conversations.length} conversations from storage`);
          }

          const storedContacts = await localStorageManager.getAllContacts();
          if (storedContacts.length > 0) {
            const contacts = storedContacts.map(contact => ({
              id: contact.id,
              user_id: contact.user_id,
              contact_id: contact.contact_id,
              contact_username: contact.contact_username,
              contact_email: contact.contact_email,
              public_key: contact.public_key,
              identity_key: contact.identity_key,
              nickname: contact.nickname,
              is_blocked: contact.is_blocked,
              is_verified: contact.is_verified,
              added_at: contact.added_at
            }));
            set({ contacts });
            console.log(`📂 Loaded ${contacts.length} contacts from storage`);
          }

          const { user, privateKey, contacts: loadedContacts, publicKey } = get();
          if (user) {
            const messagesMap = new Map();
            for (const conv of storedConversations) {
              const storedMessages = await localStorageManager.getConversationMessages(
                conv.username,
                user.username,
                50
              );

              if (storedMessages.length > 0) {
                const messages: Message[] = storedMessages.map(msg => ({
                  id: msg.id,
                  sender_id: msg.sender_id,
                  sender_username: msg.sender_username,
                  recipient_id: msg.recipient_id,
                  recipient_username: msg.recipient_username,
                  encrypted_content: msg.encrypted_content,
                  encrypted_key: msg.encrypted_key,
                  message_type: msg.message_type,
                  status: msg.status,
                  created_at: msg.created_at,
                  delivered_at: msg.delivered_at,
                  read_at: msg.read_at,
                  expiry_type: msg.expiry_type,
                  expires_at: msg.expires_at,
                  file_metadata: msg.file_metadata,
                  _decryptedContent: (msg as any).decrypted_content
                }));

                if (privateKey) {

                  let contactPublicKey = conv.public_key;
                  if (!contactPublicKey) {
                    const contact = loadedContacts.find(c => c.contact_username === conv.username);
                    contactPublicKey = contact?.public_key;
                  }

                  for (const msg of messages) {
                    if (msg.encrypted_content && !msg._decryptedContent) {
                      try {
                        const encryptedData = JSON.parse(msg.encrypted_content) as EncryptedMessage;
                        const isMine = msg.sender_username === user?.username;

                        // For sent messages, strip embedded senderPublicKey (it's MY key, not contact's)
                        const encForDecrypt = isMine
                          ? { ...encryptedData, senderPublicKey: undefined }
                          : encryptedData;
                        const decrypted = decryptMessage(encForDecrypt, contactPublicKey || '', privateKey);
                        msg._decryptedContent = decrypted;
                      } catch (e) {

                        msg._decryptedContent = null;
                      }
                    }
                  }
                }

                messagesMap.set(conv.username, messages);
              }
            }
            set({ messages: messagesMap });
            console.log(`📂 Loaded messages for ${messagesMap.size} conversations`);
          }

        } catch (error) {
          console.error('❌ Failed to load persisted data:', error);
        }
      },

      syncWithServer: async () => {
        try {
          console.log('🔄 Syncing with server...');

          await get().loadContacts();
          await get().loadConversations();

          const allConversationsData = await api.getAllConversationsWithMessages();

          const { user, contacts, conversations, privateKey, publicKey } = get();
          if (user) {

            const storedConversations: StoredConversation[] = conversations.map(conv => ({
              username: conv.username,
              user_id: conv.user_id,
              public_key: conv.public_key,
              identity_key: conv.identity_key,
              last_message_time: conv.last_message_time,
              last_message_preview: conv.last_message_preview,
              unread_count: conv.unread_count,
              is_online: conv.is_online
            }));
            await localStorageManager.saveConversations(storedConversations);

            const storedContacts: StoredContact[] = contacts.map(contact => ({
              id: contact.id,
              user_id: contact.user_id,
              contact_id: contact.contact_id,
              contact_username: contact.contact_username,
              contact_email: contact.contact_email,
              public_key: contact.public_key,
              identity_key: contact.identity_key,
              nickname: contact.nickname,
              is_blocked: contact.is_blocked,
              is_verified: contact.is_verified,
              added_at: contact.added_at
            }));
            await localStorageManager.saveContacts(storedContacts);

            const messagesMap = new Map();
            for (const [username, messages] of Object.entries(allConversationsData)) {

              if (privateKey) {

                let contactPublicKey: string | undefined;
                try {
                  const keyData = await api.getPublicKey(username);
                  contactPublicKey = keyData.public_key;
                } catch (e) {

                  const contact = contacts.find(c => c.contact_username === username);
                  contactPublicKey = contact?.public_key;
                }

                for (const msg of (messages as Message[])) {
                  if (msg.encrypted_content && !msg._decryptedContent) {
                    try {
                      const encryptedData = JSON.parse(msg.encrypted_content) as EncryptedMessage;
                      const isMine = msg.sender_username === user?.username;

                      // For sent messages, strip embedded senderPublicKey (it's MY key, not contact's)
                      const encForDecrypt = isMine
                        ? { ...encryptedData, senderPublicKey: undefined }
                        : encryptedData;
                      const decrypted = decryptMessage(encForDecrypt, contactPublicKey || '', privateKey);
                      msg._decryptedContent = decrypted;
                    } catch (e) {
                      console.warn('Failed to decrypt message during sync:', msg.id, e);
                      msg._decryptedContent = '[Decryption Failed]';
                    }
                  }
                }
              }

              const storedMessages: StoredMessage[] = (messages as Message[]).map(msg => ({
                id: msg.id,
                sender_id: msg.sender_id,
                sender_username: msg.sender_username,
                recipient_id: msg.recipient_id,
                recipient_username: msg.recipient_username,
                encrypted_content: msg.encrypted_content,
                encrypted_key: msg.encrypted_key,
                decrypted_content: msg._decryptedContent ?? undefined,
                message_type: msg.message_type,
                status: msg.status,
                created_at: msg.created_at,
                delivered_at: msg.delivered_at,
                read_at: msg.read_at,
                expiry_type: msg.expiry_type,
                expires_at: msg.expires_at,
                file_metadata: msg.file_metadata
              }));
              await localStorageManager.saveMessages(storedMessages);

              messagesMap.set(username, messages);
            }
            set({ messages: messagesMap });

            console.log('✅ Sync completed successfully');
          }
        } catch (error) {
          console.error('❌ Sync failed:', error);
        }
      },

      persistMessage: async (message: Message) => {
        try {
          const storedMessage: StoredMessage = {
            id: message.id,
            sender_id: message.sender_id,
            sender_username: message.sender_username,
            recipient_id: message.recipient_id,
            recipient_username: message.recipient_username,
            encrypted_content: message.encrypted_content,
            encrypted_key: message.encrypted_key,
            message_type: message.message_type,
            status: message.status,
            created_at: message.created_at,
            delivered_at: message.delivered_at,
            read_at: message.read_at,
            expiry_type: message.expiry_type,
            expires_at: message.expires_at,
            file_metadata: message.file_metadata
          };
          await localStorageManager.saveMessage(storedMessage);
        } catch (error) {
          console.error('❌ Failed to persist message:', error);
        }
      },

      persistConversation: async (conversation: Conversation) => {
        try {
          const storedConversation: StoredConversation = {
            username: conversation.username,
            user_id: conversation.user_id,
            public_key: conversation.public_key,
            identity_key: conversation.identity_key,
            last_message_time: conversation.last_message_time,
            last_message_preview: conversation.last_message_preview,
            unread_count: conversation.unread_count,
            is_online: conversation.is_online
          };
          await localStorageManager.saveConversation(storedConversation);
        } catch (error) {
          console.error('❌ Failed to persist conversation:', error);
        }
      },

      loadAllConversationHistory: async () => {
        try {
          const { conversations } = get();
          console.log(`📚 Loading history for ${conversations.length} conversations...`);

          for (const conv of conversations) {
            await get().loadMessages(conv.username);

            await new Promise(resolve => setTimeout(resolve, 100));
          }

          console.log('✅ All conversation history loaded');
        } catch (error) {
          console.error('❌ Failed to load conversation history:', error);
        }
      },
    }),
    {
      name: 'zerotrace-store',
      partialize: (state) => ({

        currentConversation: state.currentConversation,
      }),
    }
  )
);

function setupWebSocketHandlers(get: () => AppState, set: (state: Partial<AppState>) => void) {

  const processedMessageIds = new Set<string | number>();

  const emitToast = (detail: any) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zerotrace-toast', { detail }));
      if ('vibrate' in navigator) navigator.vibrate(5);
    }
  };

  const processedNotificationIds = new Set<number>();

  wsManager.on('message', (data) => {
    console.log('📨 Received message via WebSocket:', data);

    const messageId = data.message_id;

    if (processedMessageIds.has(messageId)) {
      console.log(`⏩ Skipping duplicate message ${messageId}`);
      return;
    }
    processedMessageIds.add(messageId);

    if (processedMessageIds.size > 1000) {
      const firstItem = processedMessageIds.values().next().value;
      if (firstItem !== undefined) {
        processedMessageIds.delete(firstItem);
      }
    }

    const state = get();
    const senderUsername = data.sender_username;

    const message: Message = {
      id: messageId,
      sender_id: data.sender_id,
      sender_username: senderUsername,
      recipient_id: state.user?.id || 0,
      recipient_username: state.user?.username || '',
      encrypted_content: data.content || data.encrypted_content,
      encrypted_key: data.encrypted_key,
      message_type: data.message_type || 'text',
      status: data.status || 'delivered',
      expiry_type: data.expiry_type || 'none',
      sender_theme: data.sender_theme,
      created_at: data.timestamp || new Date().toISOString(),
    };

    get().addIncomingMessage(message);

    wsManager.sendDeliveryReceipt(messageId, data.sender_id);
  });

  wsManager.on('typing', (data) => {
    get().setUserTyping(data.sender_username, data.is_typing);

    if (data.is_typing) {
      setTimeout(() => {
        get().setUserTyping(data.sender_username, false);
      }, 3000);
    }
  });

  wsManager.on('presence', (data) => {
    get().setUserOnline(data.user_id, data.is_online);
  });

  wsManager.on('message_sent', (data) => {
    console.log('✅ Message sent confirmation:', data);
  });

  wsManager.on('read_receipt', (data) => {
    console.log('👁️ Read receipt:', data);

  });

  wsManager.on('delivery_receipt', (data) => {
    console.log('📬 Delivery receipt:', data);

  });

  wsManager.on('connected', (data) => {
    console.log('✅ WebSocket connected:', data);
  });

  wsManager.on('error', (data) => {
    console.error('❌ WebSocket error:', data);
  });

  wsManager.on('notification', (data) => {
    const notificationId = data.notification_id;
    if (notificationId && processedNotificationIds.has(notificationId)) {
      return;
    }
    if (notificationId) {
      processedNotificationIds.add(notificationId);
      if (processedNotificationIds.size > 500) {
        const first = processedNotificationIds.values().next().value;
        if (first !== undefined) processedNotificationIds.delete(first);
      }
    }

    window.dispatchEvent(new CustomEvent('zerotrace-notification', { detail: data }));

    switch (data.notification_type) {
      case 'friend_request':
        get().loadPendingRequests?.();
        window.dispatchEvent(new CustomEvent('friend_request', { detail: data }));
        emitToast({
          type: 'friend_request',
          title: 'New friend request',
          message: data.title || data.message,
          username: data.related_username || data.username,
          priority: 'medium',
        });
        break;
      case 'friend_request_accepted':
        get().loadContacts();
        get().loadConversations();
        window.dispatchEvent(new CustomEvent('friend_accepted', { detail: data }));
        emitToast({
          type: 'friend_request_accepted',
          title: 'Request accepted',
          message: data.title || data.message,
          username: data.related_username || data.username,
          priority: 'low',
        });
        break;
      case 'friend_request_rejected':
        get().loadPendingRequests?.();
        emitToast({
          type: 'friend_request_rejected',
          title: 'Request rejected',
          message: data.title || data.message,
          username: data.related_username || data.username,
          priority: 'low',
        });
        break;
      case 'contact_removed':
        get().loadContacts();
        window.dispatchEvent(new CustomEvent('contact_removed', { detail: data }));
        emitToast({
          type: 'contact_removed',
          title: 'Contact removed',
          message: data.title || data.message || 'You were removed',
          username: data.related_username || data.username,
          priority: 'medium',
        });
        break;
      case 'user_blocked':
        window.dispatchEvent(new CustomEvent('blocked', { detail: data }));
        emitToast({
          type: 'user_blocked',
          title: 'You were blocked',
          message: 'Messaging is disabled',
          priority: 'medium',
        });
        break;
      case 'user_unblocked':
        get().loadContacts();
        emitToast({
          type: 'user_unblocked',
          title: 'Unblocked',
          message: 'You can message again',
          priority: 'low',
        });
        break;
      case 'key_changed':
        get().loadContacts();
        emitToast({
          type: 'key_changed',
          title: 'Security alert',
          message: 'A contact changed their key',
          priority: 'high',
          sticky: true,
        });
        break;
      default:
        break;
    }
  });

  wsManager.on('delete_message_received', (data) => {
    console.log('🗑️ Remote delete message received:', data);
    const messageId = data.message_id || data.data?.message_id;
    const senderUsername = data.sender_username || data.data?.sender_username;
    if (messageId && senderUsername) {
      get().handleRemoteDeleteMessage(messageId, senderUsername);
    }
  });

  wsManager.on('delete_conversation_received', (data) => {
    console.log('🗑️ Remote delete conversation received:', data);
    const senderUsername = data.sender_username || data.data?.sender_username;
    if (senderUsername) {
      get().handleRemoteDeleteConversation(senderUsername);
    }
  });

  wsManager.on('friend_request', (data) => {
    console.log('📨 New friend request received:', data);

    get().loadPendingRequests?.();
    const username = data.sender_username || data.data?.sender_username || 'Someone';
    emitToast({
      type: 'friend_request',
      title: 'New friend request',
      message: `${username} wants to connect`,
      username,
      priority: 'medium',
    });
  });

  wsManager.on('friend_request_accepted', (data) => {
    console.log('✅ Friend request accepted:', data);
    const accepterUsername = data.accepter_username || data.data?.accepter_username;

    console.log(`🎉 ${accepterUsername} accepted your friend request!`);
    if (accepterUsername) {
      emitToast({
        type: 'friend_request_accepted',
        title: 'You are now friends',
        message: `${accepterUsername} accepted your request`,
        username: accepterUsername,
        priority: 'low',
      });
    }

    get().loadContacts();

    get().loadConversations();
  });

  wsManager.on('friend_request_rejected', (data) => {
    console.log('❌ Friend request rejected:', data);

    get().loadPendingRequests?.();
    const username = data.username || data.data?.username;
    if (username) {
      emitToast({
        type: 'friend_request_rejected',
        title: 'Request declined',
        message: `${username} declined your friend request`,
        username,
        priority: 'low',
      });
    }
  });

  // Handle contacts_sync message from server (triggered after friend request accept, block, unblock, etc.)
  wsManager.on('contacts_sync', (data) => {
    console.log('🔄 Contacts sync received from server:', data);
    // Refresh contacts and conversations
    get().loadContacts();
    get().loadConversations();
    // Dispatch custom event for UI components that listen to it (like Sidebar)
    window.dispatchEvent(new CustomEvent('contacts_sync', { detail: data }));
  });

  // Handle contact_removed_self — sent to the initiator's other devices when THEY unfriend someone
  wsManager.on('contact_removed_self', (data) => {
    console.log('🔄 Contact removed (self-sync):', data);
    get().loadContacts();
    get().loadConversations();
    // If we're currently chatting with the removed user, close the conversation
    const state = get();
    const removedUsername = data.removed_username || data.data?.removed_username;
    if (removedUsername && state.activeConversation === removedUsername) {
      set({ activeConversation: null, messages: [] });
    }
    window.dispatchEvent(new CustomEvent('contacts_sync', { detail: { reason: 'contact_removed_self', ...data } }));
  });

  // Track read message IDs synced from other devices
  const syncedReadMessageIds = new Set<number>();

  // Handle read_state_sync — bulk read state pushed on connect for cross-device consistency
  wsManager.on('read_state_sync', (data) => {
    console.log('📖 Read state sync received:', data);
    const messageIds: number[] = data.read_message_ids || data.data?.read_message_ids || [];
    for (const id of messageIds) {
      syncedReadMessageIds.add(id);
    }
    // Keep the set bounded
    if (syncedReadMessageIds.size > 5000) {
      const iter = syncedReadMessageIds.values();
      for (let i = 0; i < 1000; i++) {
        const val = iter.next().value;
        if (val !== undefined) syncedReadMessageIds.delete(val);
      }
    }
  });

  // Handle read_sync — individual read receipt synced from another device
  wsManager.on('read_sync', (data) => {
    console.log('📖 Read sync from other device:', data);
    const messageId = data.message_id || data.data?.message_id;
    if (messageId) {
      syncedReadMessageIds.add(messageId);
      // Update local message state to reflect read status
      const state = get();
      const updatedMessages = state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, status: 'read' as const } : msg
      );
      if (updatedMessages !== state.messages) {
        set({ messages: updatedMessages });
      }
    }
  });
}

declare module './api' {
  interface Message {
    _decryptedContent?: string | null;
  }
}
