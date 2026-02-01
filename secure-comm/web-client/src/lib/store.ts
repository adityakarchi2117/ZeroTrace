/**
 * ZeroTrace Global State Store
 * Uses Zustand for state management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, User, Contact, Conversation, Message, CallLog } from './api';
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
  currentConversation: string | null; // username
  messages: Map<string, Message[]>; // username -> messages
  onlineUsers: Set<number>;
  typingUsers: Map<string, boolean>; // username -> isTyping
  callHistory: CallLog[];
}

interface AppState extends AuthState, CryptoState, ChatState {
  // Auth actions
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadStoredAuth: () => Promise<void>;

  // Crypto actions
  generateAndUploadKeys: () => Promise<void>;
  loadStoredKeys: () => void;

  // Chat actions
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

  // Deletion actions
  deleteMessageForMe: (messageId: number, conversationUsername: string) => Promise<void>;
  deleteMessageForEveryone: (messageId: number, conversationUsername: string) => Promise<void>;
  clearChat: (username: string) => Promise<void>;
  deleteConversationForEveryone: (username: string) => Promise<void>;
  handleRemoteDeleteMessage: (messageId: number, senderUsername: string) => void;
  handleRemoteDeleteConversation: (senderUsername: string) => void;

  // Presence
  setUserOnline: (userId: number, isOnline: boolean) => void;
  setUserTyping: (username: string, isTyping: boolean) => void;

  // Clear state
  clearError: () => void;
  initializeWebSocket: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
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

      // ============ Auth Actions ============

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login(username, password);
          // Set token for friend API as well
          friendApi.setToken(response.access_token);
          let user = await api.getCurrentUser();

          // Sync settings from server
          if (user.settings) {
            try {
              const existing = localStorage.getItem('zerotrace_appearance');
              const localSettings = existing ? JSON.parse(existing) : {};
              const newSettings = { ...localSettings, ...user.settings };
              const newValue = JSON.stringify(newSettings);

              localStorage.setItem('zerotrace_appearance', newValue);

              // Dispatch proper StorageEvent for current window listeners
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

          // Store token
          localStorage.setItem('zerotrace_token', response.access_token);
          localStorage.setItem('zerotrace_username', username);

          // Load or generate keys
          let keys = KeyStorage.load(username);
          let needsUpload = !user.public_key;
          let keyMismatch = false;

          // Verify key consistency if both local and server keys exist
          if (keys && user.public_key) {
            const isConsistent = KeyStorage.verifyKeyConsistency(username, user.public_key);
            if (!isConsistent) {
              console.warn('⚠️ Key mismatch detected! Local key differs from server key.');
              console.warn('This may happen if you logged in from a different device.');
              console.warn('Old messages encrypted with the server key may not decrypt correctly.');
              keyMismatch = true;
              // Keep local keys but mark the mismatch
            }
          }

          if (!keys) {
            // Generate new proper key bundle
            console.log('🔐 Generating new key bundle...');
            const { bundle, privateKeys } = generateKeyBundle(5);

            keys = {
              privateKey: privateKeys.signedPrekeyPrivate, // Use signed prekey private for encryption
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

          // CRITICAL: Verify that privateKey and publicKey form a valid pair
          if (keys.privateKey && keys.publicKey) {
            const isValidPair = verifyKeyPair(keys.privateKey, keys.publicKey);
            console.log('🔑 Key pair verification:', isValidPair ? '✅ VALID' : '❌ INVALID');

            if (!isValidPair) {
              // The stored public key doesn't match the private key!
              // Derive the correct public key from the private key
              console.warn('⚠️ Key pair mismatch detected! Deriving correct public key...');
              const correctPublicKey = derivePublicKeyFromPrivate(keys.privateKey);
              console.log('🔧 Original publicKey:', keys.publicKey?.substring(0, 30));
              console.log('🔧 Derived publicKey:', correctPublicKey?.substring(0, 30));

              // Update the keys with the correct public key
              keys.publicKey = correctPublicKey;
              KeyStorage.save(username, keys);
              needsUpload = true; // Need to upload the corrected key
              console.log('✅ Key pair corrected and saved');
            }
          }

          // Upload keys if not on server OR if we corrected the key pair
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
              // Refresh user to get updated public_key
              user = await api.getCurrentUser();
              console.log('✅ Keys uploaded successfully!', {
                serverNowHas: user.public_key?.substring(0, 30),
              });
            } catch (uploadError: any) {
              console.error('❌ Failed to upload keys:', uploadError?.response?.data || uploadError);
            }
          }

          // Final verification: ensure local key matches server key
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

          // Connect WebSocket
          wsManager.connect(user.id.toString(), response.access_token);

          // Setup message handlers
          if (!(window as any)._wsHandlersRegistered) {
            setupWebSocketHandlers(get, set);
            (window as any)._wsHandlersRegistered = true;
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

          // Auto-login after registration
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
          // Connect WebSocket
          wsManager.connect(user.id.toString(), token);

          // Setup handlers only once using a module-level flag
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

            // Sync settings from server
            if (user.settings) {
              try {
                const existing = localStorage.getItem('cipherlink_appearance');
                const localSettings = existing ? JSON.parse(existing) : {};
                const newSettings = { ...localSettings, ...user.settings };
                const newValue = JSON.stringify(newSettings);

                localStorage.setItem('cipherlink_appearance', newValue);

                // Dispatch proper StorageEvent for current window listeners
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

            // Connect WebSocket
            wsManager.connect(user.id.toString(), token);

            // Setup message handlers
            if (!(window as any)._wsHandlersRegistered) {
              setupWebSocketHandlers(get, set);
              (window as any)._wsHandlersRegistered = true;
            }

            // Load persistent data from IndexedDB
            await get().loadPersistedData();

            // Sync with server in background
            get().syncWithServer().catch(console.error);

            return;
          } catch {
            // Token expired or invalid
            localStorage.removeItem('zerotrace_token');
            localStorage.removeItem('zerotrace_username');
          }
        }
      },

      // ============ Crypto Actions ============

      generateAndUploadKeys: async () => {
        const { user } = get();
        if (!user) return;

        const keyPair = generateKeyPair();
        const signingPair = generateSigningKeyPair();

        // Save locally
        KeyStorage.save(user.username, {
          privateKey: keyPair.privateKey,
          publicKey: keyPair.publicKey,
          identityKey: signingPair.publicKey,
        });

        // Upload to server
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

      // ============ Chat Actions ============

      loadContacts: async () => {
        try {
          // Load trusted contacts from friend system (primary source)
          const trustedContacts = await friendApi.getTrustedContacts();
          
          // Map trusted contacts to the Contact interface
          const contacts: Contact[] = trustedContacts.map(tc => ({
            id: tc.id,
            user_id: tc.user_id,
            contact_id: tc.contact_user_id,
            contact_username: tc.contact_username,
            contact_email: '', // Not available in TrustedContact
            public_key: tc.public_key,
            identity_key: tc.identity_key,
            nickname: tc.nickname,
            is_blocked: false, // Blocked users are separate
            is_verified: tc.is_verified,
            added_at: tc.created_at,
          }));
          
          set({ contacts });
          console.log(`✅ Loaded ${contacts.length} trusted contacts`);
        } catch (error) {
          console.error('Failed to load contacts:', error);
          // Fallback to old contacts API if friend system fails
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

          // Get current messages to merge with (prevent duplication)
          const currentMessages = get().messages.get(username) || [];
          const existingIds = new Set(currentMessages.map(m => m.id));

          // 1. First Pass: Merge NEW messages as ENCRYPTED (Optimistic UI Update)
          // This ensures the UI shows something immediately while we decrypt in background
          const newEncryptedMessages = [];
          for (const msg of messages) {
            if (!existingIds.has(msg.id)) {
              newEncryptedMessages.push(msg);
            }
          }

          if (newEncryptedMessages.length > 0) {
            const optimisticallyMergedMessages = [...currentMessages, ...newEncryptedMessages];
            // Sort by timestamp
            optimisticallyMergedMessages.sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            const optimisticMap = new Map(get().messages);
            optimisticMap.set(username, optimisticallyMergedMessages);
            set({ messages: optimisticMap });
          }

          // 2. Second Pass: Decrypt messages in background (non-blocking if possible)
          const { privateKey, contacts, user } = get();

          if (privateKey) {
            // Fetch the contact's public key from server to use as fallback
            // This ensures decryption works even if contacts aren't loaded yet
            let contactPublicKey: string | undefined;
            try {
              const keyData = await api.getPublicKey(username);
              contactPublicKey = keyData.public_key;
              console.log(`📥 Got public key for ${username}:`, contactPublicKey?.substring(0, 30));
            } catch (e) {
              console.warn(`Could not fetch public key for ${username}:`, e);
              // Fall back to contacts array
              const contact = contacts.find(c => c.contact_username === username);
              contactPublicKey = contact?.public_key;
            }

            // Decrypt ALL messages from server response that need it
            for (const msg of messages) {
              // Only decrypt if we haven't already
              if (msg.encrypted_content && !msg._decryptedContent) {
                try {
                  const encryptedData = JSON.parse(msg.encrypted_content) as EncryptedMessage;

                  // v2 protocol: senderPublicKey is embedded in message
                  // v1 protocol: use contact's cached public key as fallback
                  let fallbackPublicKey: string | undefined;

                  if (msg.sender_username === user?.username) {
                    // Sent by me -> fallback is recipient's public key (the contact we're chatting with)
                    fallbackPublicKey = contactPublicKey;
                  } else {
                    // Received by me -> fallback is sender's public key (the contact we're chatting with)
                    fallbackPublicKey = contactPublicKey;
                  }

                  // decryptMessage handles v2 (embedded key) and v1 (fallback key)
                  const decrypted = decryptMessage(encryptedData, fallbackPublicKey || '', privateKey);
                  msg._decryptedContent = decrypted;
                } catch (e) {
                  console.warn('Failed to decrypt message:', msg.id, e);
                  msg._decryptedContent = '[Decryption Failed]';
                }
              }
            }
          }

          // 3. Final Pass: Update state with DECRYPTED content
          const finalMessages = [...currentMessages];

          for (const msg of messages) {
            const existingIndex = finalMessages.findIndex(m => m.id === msg.id);
            if (existingIndex >= 0) {
              // Update existing message (now with decrypted content if available)
              finalMessages[existingIndex] = { ...finalMessages[existingIndex], ...msg };
            } else {
              // Should have been added in optimistic step, but double check
              if (!existingIds.has(msg.id)) {
                finalMessages.push(msg);
              }
            }
          }

          // Sort again to be safe
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

        // Check if recipient is a trusted contact (friend)
        let isFriend = contacts.some(c => c.contact_username === recipientUsername && !c.is_blocked);
        
        // If not found in local state, try refreshing contacts from server
        // This handles cases where friend request was just accepted
        if (!isFriend) {
          console.log('🔄 Friend not found in local state, refreshing contacts from server...');
          await get().loadContacts();
          // Re-check with fresh data
          const freshContacts = get().contacts;
          isFriend = freshContacts.some(c => c.contact_username === recipientUsername && !c.is_blocked);
          console.log('🔄 After refresh - isFriend:', isFriend, 'contacts:', freshContacts.map(c => c.contact_username));
        }
        
        if (!isFriend) {
          console.error('❌ Cannot send message: Not friends with', recipientUsername);
          throw new Error('You must be friends with this user to send messages. Send a friend request first.');
        }

        // CRITICAL: Verify our key pair is valid before sending
        const isValidPair = verifyKeyPair(privateKey, publicKey);
        if (!isValidPair) {
          console.warn('⚠️ Invalid key pair detected in sendMessage! Deriving correct public key...');
          publicKey = derivePublicKeyFromPrivate(privateKey);
          console.log('🔧 Using derived publicKey:', publicKey?.substring(0, 30));
          // Update store with corrected key
          set({ publicKey });
        }

        // Always fetch the latest recipient public key from the server
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

        // Encrypt message using static key pair (X25519)
        // v2 protocol: includes sender's public key in the payload for reliable decryption
        console.log('📤 Encrypting with:', {
          recipientPubKey: recipientPublicKey?.substring(0, 30),
          senderPrivKey: privateKey?.substring(0, 30),
          senderPubKey: publicKey?.substring(0, 30),
        });
        const encrypted = encryptMessage(content, recipientPublicKey, privateKey, publicKey);
        const encryptedContent = JSON.stringify(encrypted);

        // Build sender's theme for theme sync
        const senderTheme = buildCurrentMessageTheme();

        // Add to local messages optimistically
        const currentMessages = get().messages.get(recipientUsername) || [];
        const optimisticId = -Date.now();
        const optimisticMessage: Message = {
          id: optimisticId,
          sender_id: user.id,
          sender_username: user.username,
          recipient_id: 0, // Unknown ID for now
          recipient_username: recipientUsername,
          encrypted_content: encryptedContent,
          message_type: messageType,
          status: 'sending',
          expiry_type: 'none',
          created_at: new Date().toISOString(),
          _decryptedContent: content, // We know what we sent
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
            undefined, // encryptedKey
            'none',
            messageType,
            fileData,
            senderTheme // Include sender's theme for theme sync
          );

          console.log('✅ Message sent successfully', sentMessage);

          // Update optimistic message with real one while preserving decrypted content
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

          // Persist message and update/persist conversation snapshot for history
          try {
            await get().persistMessage(sentMessage);
          } catch (e) {
            console.error('❌ Failed to persist sent message:', e);
          }

          // Update conversation preview & persist
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
          // Mark as failed
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

          // Clear typing indicator for this user
          const state = get();
          const newTypingUsers = new Map(state.typingUsers);
          newTypingUsers.delete(username);
          set({ typingUsers: newTypingUsers });
        }
      },

      addContact: async (username: string) => {
        try {
          const contact = await api.addContact(username);
          const state = get();
          set({ contacts: [...state.contacts, contact] });

          // Also add to conversations immediately
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
        // Check if message already exists
        const currentMessages = get().messages.get(senderUsername) || [];
        const exists = currentMessages.some(m => m.id === message.id);

        if (!exists) {
          // Decrypt immediately if possible
          // v2 protocol: senderPublicKey is embedded in the message payload
          const { privateKey, contacts } = get();
          if (privateKey && message.encrypted_content) {
            try {
              const encryptedData = JSON.parse(message.encrypted_content) as EncryptedMessage;

              // Get fallback public key - first try contacts, then fetch from server
              let fallbackPublicKey = '';
              const contact = contacts.find(
                c => c.contact_username === message.sender_username
              );
              
              if (contact?.public_key) {
                fallbackPublicKey = contact.public_key;
              } else if (!encryptedData.senderPublicKey) {
                // v1 message needs fallback key - try to fetch from server
                try {
                  const keyData = await api.getPublicKey(message.sender_username);
                  fallbackPublicKey = keyData.public_key || '';
                  console.log('📥 Fetched sender public key for decryption:', fallbackPublicKey?.substring(0, 30));
                } catch (e) {
                  console.warn('Could not fetch sender public key:', e);
                }
              }

              // decryptMessage handles v2 (uses embedded senderPublicKey) and v1 (uses fallback)
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

          // Update conversation list
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

            // Persist latest conversation snapshot and message for history
            get().persistMessage(message).catch(err =>
              console.error('❌ Failed to persist incoming message:', err)
            );
            get().persistConversation(updatedConv).catch(err =>
              console.error('❌ Failed to persist conversation for incoming message:', err)
            );
          } else {
            // Message from user without an existing conversation entry – create a lightweight one
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

      loadPendingRequests: async () => {
        try {
          const pending = await friendApi.getPendingRequests();
          console.log('📋 Pending friend requests:', pending);
          // Could store this in state if needed
        } catch (error) {
          console.error('Failed to load pending requests:', error);
        }
      },

      // ============ Presence ============

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

      // ============ Deletion Actions ============

      deleteMessageForMe: async (messageId: number, conversationUsername: string) => {
        // Delete locally only - does not affect the other user
        try {
          // Remove from local state
          const currentMessages = new Map(get().messages);
          const convMessages = currentMessages.get(conversationUsername) || [];
          const updatedMessages = convMessages.filter(m => m.id !== messageId);
          currentMessages.set(conversationUsername, updatedMessages);
          set({ messages: currentMessages });

          // Remove from IndexedDB
          await localStorageManager.deleteMessage(messageId);
          console.log('🗑️ Message deleted locally:', messageId);
        } catch (error) {
          console.error('Failed to delete message locally:', error);
        }
      },

      deleteMessageForEveryone: async (messageId: number, conversationUsername: string) => {
        // Delete for everyone - sends delete event to recipient
        try {
          // First mark locally as deleted
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

          // Mark as deleted in IndexedDB
          await localStorageManager.markMessageAsDeleted(messageId);

          // Send delete event to recipient via WebSocket
          wsManager.sendDeleteMessage(messageId, conversationUsername);

          // Also try to delete on server
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
        // Clear local chat history only - does not affect the other user
        try {
          const { user } = get();
          if (!user) return;

          // Clear from local state
          const currentMessages = new Map(get().messages);
          currentMessages.set(username, []);
          set({ messages: currentMessages });

          // Clear from IndexedDB
          await localStorageManager.clearConversationMessages(username, user.username);

          // Clear calls from local state
          const currentCalls = get().callHistory;
          const filteredCalls = currentCalls.filter(call =>
            call.caller_username !== username && call.receiver_username !== username
          );
          set({ callHistory: filteredCalls });

          // Clear history on server (both messages and calls)
          try {
            // We treat clearChat as "Delete history for me".
            // We call the new endpoint to delete call history for this user
            await api.deleteCallHistory(username);
          } catch (e) {
            console.warn('Failed to delete call history on server:', e);
          }

          // Update conversation preview
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
        // Delete all messages for both sides, but keep the conversation in recents
        try {
          const { user } = get();
          if (!user) return;

          // Clear messages from local state (but keep empty array for the conversation)
          const currentMessages = new Map(get().messages);
          currentMessages.set(username, []);
          set({ messages: currentMessages });

          // Update conversation preview (keep in list but clear preview)
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

          // Clear messages from IndexedDB (but keep conversation entry)
          await localStorageManager.clearConversationMessages(username, user.username);

          // Send delete event to recipient via WebSocket
          wsManager.sendDeleteConversation(username);

          // Also try to delete messages on server
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
        // Handle incoming delete message event from another user
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

        // Update IndexedDB
        localStorageManager.markMessageAsDeleted(messageId).catch(console.error);
        console.log('📨 Remote message deletion received:', messageId);
      },

      handleRemoteDeleteConversation: (senderUsername: string) => {
        // Handle incoming delete conversation event from another user
        // Clear messages but keep the conversation in recents
        const currentMessages = new Map(get().messages);
        currentMessages.set(senderUsername, []);
        set({ messages: currentMessages });

        // Update conversation preview (keep in list but show cleared)
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

        // Clear messages from IndexedDB (but keep conversation entry)
        const user = get().user;
        if (user) {
          localStorageManager.clearConversationMessages(senderUsername, user.username).catch(console.error);
        }

        console.log('📨 Remote conversation cleared:', senderUsername);
      },

      // ============ Persistent Storage ============

      loadPersistedData: async () => {
        try {
          console.log('📂 Loading persisted data from IndexedDB...');

          // Load conversations
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

          // Load contacts
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

          // Load messages for all conversations
          const { user, privateKey, contacts: loadedContacts } = get();
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
                  file_metadata: msg.file_metadata
                }));

                // Decrypt messages if we have a private key
                if (privateKey) {
                  // Get public key from conversation or contacts
                  let contactPublicKey = conv.public_key;
                  if (!contactPublicKey) {
                    const contact = loadedContacts.find(c => c.contact_username === conv.username);
                    contactPublicKey = contact?.public_key;
                  }

                  for (const msg of messages) {
                    if (msg.encrypted_content && !msg._decryptedContent) {
                      try {
                        const encryptedData = JSON.parse(msg.encrypted_content) as EncryptedMessage;
                        const decrypted = decryptMessage(encryptedData, contactPublicKey || '', privateKey);
                        msg._decryptedContent = decrypted;
                      } catch (e) {
                        // Silent fail - will be retried during sync
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

          // Load fresh data from server
          await get().loadContacts();
          await get().loadConversations();

          // Get all conversations with messages from server
          const allConversationsData = await api.getAllConversationsWithMessages();

          // Update local storage with server data
          const { user, contacts, conversations, privateKey } = get();
          if (user) {
            // Save conversations to IndexedDB
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

            // Save contacts to IndexedDB
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

            // Save messages to IndexedDB
            for (const [username, messages] of Object.entries(allConversationsData)) {
              const storedMessages: StoredMessage[] = (messages as Message[]).map(msg => ({
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
                file_metadata: msg.file_metadata
              }));
              await localStorageManager.saveMessages(storedMessages);
            }

            // Update in-memory state WITH decryption
            const messagesMap = new Map();
            for (const [username, messages] of Object.entries(allConversationsData)) {
              // Decrypt messages if we have a private key
              if (privateKey) {
                // Fetch public key for this contact
                let contactPublicKey: string | undefined;
                try {
                  const keyData = await api.getPublicKey(username);
                  contactPublicKey = keyData.public_key;
                } catch (e) {
                  // Fallback to contacts array
                  const contact = contacts.find(c => c.contact_username === username);
                  contactPublicKey = contact?.public_key;
                }

                // Decrypt each message
                for (const msg of (messages as Message[])) {
                  if (msg.encrypted_content && !msg._decryptedContent) {
                    try {
                      const encryptedData = JSON.parse(msg.encrypted_content) as EncryptedMessage;
                      const decrypted = decryptMessage(encryptedData, contactPublicKey || '', privateKey);
                      msg._decryptedContent = decrypted;
                    } catch (e) {
                      console.warn('Failed to decrypt message during sync:', msg.id, e);
                      msg._decryptedContent = '[Decryption Failed]';
                    }
                  }
                }
              }
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
            // Small delay to prevent overwhelming the server
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
        // Only persist non-sensitive data
        currentConversation: state.currentConversation,
      }),
    }
  )
);

// Setup WebSocket message handlers
function setupWebSocketHandlers(get: () => AppState, set: (state: Partial<AppState>) => void) {
  // Track processed message IDs to prevent duplicates from WebSocket replay
  const processedMessageIds = new Set<string | number>();

  // Handle incoming messages
  wsManager.on('message', (data) => {
    console.log('📨 Received message via WebSocket:', data);

    const messageId = data.message_id;

    // Deduplication: Skip if we've already processed this message
    if (processedMessageIds.has(messageId)) {
      console.log(`⏩ Skipping duplicate message ${messageId}`);
      return;
    }
    processedMessageIds.add(messageId);

    // Limit the size of the processed IDs set to prevent memory leaks
    if (processedMessageIds.size > 1000) {
      const firstItem = processedMessageIds.values().next().value;
      if (firstItem !== undefined) {
        processedMessageIds.delete(firstItem);
      }
    }

    const state = get();
    const senderUsername = data.sender_username;

    // Create message object
    const message: Message = {
      id: messageId,
      sender_id: data.sender_id,
      sender_username: senderUsername,
      recipient_id: state.user?.id || 0,
      recipient_username: state.user?.username || '',
      encrypted_content: data.content || data.encrypted_content,
      encrypted_key: data.encrypted_key,
      message_type: data.message_type || 'text',
      status: 'delivered',
      expiry_type: data.expiry_type || 'none',
      sender_theme: data.sender_theme,
      created_at: data.timestamp || new Date().toISOString(),
    };

    get().addIncomingMessage(message);

    // Send delivery receipt
    wsManager.sendDeliveryReceipt(messageId, data.sender_id);
  });

  // Handle typing indicators
  wsManager.on('typing', (data) => {
    get().setUserTyping(data.sender_username, data.is_typing);

    // Auto-clear typing after 3 seconds
    if (data.is_typing) {
      setTimeout(() => {
        get().setUserTyping(data.sender_username, false);
      }, 3000);
    }
  });

  // Handle presence updates
  wsManager.on('presence', (data) => {
    get().setUserOnline(data.user_id, data.is_online);
  });

  // Handle message sent confirmations
  wsManager.on('message_sent', (data) => {
    console.log('✅ Message sent confirmation:', data);
  });

  // Handle read receipts
  wsManager.on('read_receipt', (data) => {
    console.log('👁️ Read receipt:', data);
    // Could update message status in UI here
  });

  // Handle delivery receipts
  wsManager.on('delivery_receipt', (data) => {
    console.log('📬 Delivery receipt:', data);
    // Could update message status in UI here
  });

  // Handle connection confirmation
  wsManager.on('connected', (data) => {
    console.log('✅ WebSocket connected:', data);
  });

  // Handle errors
  wsManager.on('error', (data) => {
    console.error('❌ WebSocket error:', data);
  });

  // Handle remote message deletion
  wsManager.on('delete_message_received', (data) => {
    console.log('🗑️ Remote delete message received:', data);
    const messageId = data.message_id || data.data?.message_id;
    const senderUsername = data.sender_username || data.data?.sender_username;
    if (messageId && senderUsername) {
      get().handleRemoteDeleteMessage(messageId, senderUsername);
    }
  });

  // Handle remote conversation deletion
  wsManager.on('delete_conversation_received', (data) => {
    console.log('🗑️ Remote delete conversation received:', data);
    const senderUsername = data.sender_username || data.data?.sender_username;
    if (senderUsername) {
      get().handleRemoteDeleteConversation(senderUsername);
    }
  });

  // Handle incoming friend request
  wsManager.on('friend_request', (data) => {
    console.log('📨 New friend request received:', data);
    // Refresh pending requests to show the new request
    get().loadPendingRequests?.();
  });

  // Handle friend request accepted
  wsManager.on('friend_request_accepted', (data) => {
    console.log('✅ Friend request accepted:', data);
    const accepterUsername = data.accepter_username || data.data?.accepter_username;
    
    // Show notification
    console.log(`🎉 ${accepterUsername} accepted your friend request!`);
    
    // Refresh contacts to show the new contact in sidebar
    get().loadContacts();
    
    // Also refresh conversations
    get().loadConversations();
  });

  // Handle friend request rejected
  wsManager.on('friend_request_rejected', (data) => {
    console.log('❌ Friend request rejected:', data);
    // Refresh pending requests
    get().loadPendingRequests?.();
  });
}

// Extend Message type to include decrypted content for local display
declare module './api' {
  interface Message {
    _decryptedContent?: string | null;
  }
}
