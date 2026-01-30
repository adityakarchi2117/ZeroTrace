/**
 * CipherLink Local Storage Manager
 * Production-grade IndexedDB implementation for persistent chat history
 */

export interface StoredMessage {
  id: number;
  sender_id: number;
  sender_username: string;
  recipient_id: number;
  recipient_username: string;
  encrypted_content: string;
  encrypted_key?: string;
  message_type: string;
  status: string;
  created_at: string;
  delivered_at?: string;
  read_at?: string;
  expiry_type: string;
  expires_at?: string;
  file_metadata?: any;
}

export interface StoredConversation {
  username: string;
  user_id: number;
  public_key?: string;
  identity_key?: string;
  last_message_time?: string;
  last_message_preview?: string;
  unread_count: number;
  is_online: boolean;
}

export interface StoredContact {
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

class LocalStorageManager {
  private db: IDBDatabase | null = null;
  private dbName = 'CipherLinkDB';
  private version = 1;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('conversation', ['sender_username', 'recipient_username'], { unique: false });
          messageStore.createIndex('recipient', 'recipient_username', { unique: false });
          messageStore.createIndex('sender', 'sender_username', { unique: false });
          messageStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'username' });
          convStore.createIndex('last_message_time', 'last_message_time', { unique: false });
        }

        // Contacts store
        if (!db.objectStoreNames.contains('contacts')) {
          const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactStore.createIndex('contact_username', 'contact_username', { unique: false });
        }

        // Sync metadata store
        if (!db.objectStoreNames.contains('sync_metadata')) {
          db.createObjectStore('sync_metadata', { keyPath: 'key' });
        }
      };
    });
  }

  // ============ Messages ============

  async saveMessage(message: StoredMessage): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.put(message);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveMessages(messages: StoredMessage[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      let completed = 0;
      const total = messages.length;

      if (total === 0) {
        resolve();
        return;
      }

      messages.forEach(message => {
        const request = store.put(message);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async getConversationMessages(username: string, currentUsername: string, limit: number = 50): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const messages: StoredMessage[] = [];

      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const message = cursor.value as StoredMessage;

          // Check if message is part of conversation
          const isConversationMessage =
            (message.sender_username === username && message.recipient_username === currentUsername) ||
            (message.sender_username === currentUsername && message.recipient_username === username);

          if (isConversationMessage) {
            messages.push(message);
          }

          cursor.continue();
        } else {
          // Sort by created_at and limit
          messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          resolve(messages.slice(-limit)); // Get last N messages
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAllMessages(): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ============ Conversations ============

  async saveConversation(conversation: StoredConversation): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readwrite');
      const store = transaction.objectStore('conversations');
      const request = store.put(conversation);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveConversations(conversations: StoredConversation[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readwrite');
      const store = transaction.objectStore('conversations');

      let completed = 0;
      const total = conversations.length;

      if (total === 0) {
        resolve();
        return;
      }

      conversations.forEach(conversation => {
        const request = store.put(conversation);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async getAllConversations(): Promise<StoredConversation[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readonly');
      const store = transaction.objectStore('conversations');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ============ Contacts ============

  async saveContact(contact: StoredContact): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readwrite');
      const store = transaction.objectStore('contacts');
      const request = store.put(contact);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveContacts(contacts: StoredContact[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readwrite');
      const store = transaction.objectStore('contacts');

      let completed = 0;
      const total = contacts.length;

      if (total === 0) {
        resolve();
        return;
      }

      contacts.forEach(contact => {
        const request = store.put(contact);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async getAllContacts(): Promise<StoredContact[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readonly');
      const store = transaction.objectStore('contacts');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ============ Sync Metadata ============

  async setSyncTimestamp(key: string, timestamp: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_metadata'], 'readwrite');
      const store = transaction.objectStore('sync_metadata');
      const request = store.put({ key, timestamp });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSyncTimestamp(key: string): Promise<string | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sync_metadata'], 'readonly');
      const store = transaction.objectStore('sync_metadata');
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.timestamp : null);
      };
    });
  }

  // ============ Cleanup ============

  async clearAllData(): Promise<void> {
    if (!this.db) await this.init();

    const stores = ['messages', 'conversations', 'contacts', 'sync_metadata'];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(stores, 'readwrite');
      let completed = 0;

      stores.forEach(storeName => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          completed++;
          if (completed === stores.length) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async deleteConversation(username: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations', 'messages'], 'readwrite');

      // Delete conversation
      const convStore = transaction.objectStore('conversations');
      convStore.delete(username);

      // Delete all messages in conversation
      const msgStore = transaction.objectStore('messages');
      const request = msgStore.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const message = cursor.value as StoredMessage;
          if (message.sender_username === username || message.recipient_username === username) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ============ Message Deletion ============

  async deleteMessage(messageId: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.delete(messageId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async markMessageAsDeleted(messageId: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const getRequest = store.get(messageId);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          // Mark as deleted but preserve metadata
          message.encrypted_content = JSON.stringify({ deleted: true });
          message.message_type = 'deleted';
          message.status = 'deleted';

          const updateRequest = store.put(message);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clearConversationMessages(username: string, currentUsername: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const message = cursor.value as StoredMessage;
          // Check if message is part of conversation
          const isConversationMessage =
            (message.sender_username === username && message.recipient_username === currentUsername) ||
            (message.sender_username === currentUsername && message.recipient_username === username);

          if (isConversationMessage) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const localStorageManager = new LocalStorageManager();

// Auto-initialize on import
if (typeof window !== 'undefined') {
  localStorageManager.init().catch(console.error);
}