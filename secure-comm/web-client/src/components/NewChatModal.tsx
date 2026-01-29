'use client';

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { X, Search, UserPlus, Loader2, AlertCircle, MessageSquare } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: number;
  username: string;
  email?: string;
  public_key?: string;
  identity_key?: string;
  is_online?: boolean;
}

type SearchState = 'idle' | 'searching' | 'success' | 'error' | 'not_found';

export default function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [addingUser, setAddingUser] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const {
    addContact,
    setCurrentConversation,
    searchUsers,
    loadContacts,
    loadConversations,
    conversations,
    contacts
  } = useStore();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    // Reset state when modal closes
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchState('idle');
      setErrorMessage('');
      setAddingUser(null);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    if (query.length < 2) {
      setErrorMessage('Please enter at least 2 characters');
      setSearchState('error');
      return;
    }

    setSearchState('searching');
    setErrorMessage('');
    setSearchResults([]);

    try {
      const results = await searchUsers(query);

      if (results.length === 0) {
        setSearchState('not_found');
      } else {
        setSearchResults(results);
        setSearchState('success');
      }
    } catch (error: any) {
      console.error('Search failed:', error);
      setErrorMessage(error?.response?.data?.detail || 'Search failed. Please try again.');
      setSearchState('error');
    }
  };

  const handleStartChat = async (user: SearchResult) => {
    setAddingUser(user.id);
    setErrorMessage('');

    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(c => c.username === user.username);

      if (existingConversation) {
        // Just open the existing conversation
        setCurrentConversation(user.username);
        onClose();
        return;
      }

      // Fetch user's public key to verify they exist and have keys
      try {
        const keyData = await api.getPublicKey(user.username);
        if (!keyData.public_key) {
          setErrorMessage(`${user.username} hasn't set up their encryption keys yet.`);
          setAddingUser(null);
          return;
        }
      } catch (keyError: any) {
        // User might not have keys yet, but we can still add as contact
        console.log('Key fetch failed, proceeding with contact addition:', keyError);
      }

      // Check if already a contact
      const existingContact = contacts.find(c => c.contact_username === user.username);

      if (!existingContact) {
        // Add as contact first
        await addContact(user.username);
        // Reload contacts to get the updated list
        await loadContacts();
      }

      // Reload conversations to ensure the new one appears
      await loadConversations();

      // Set as current conversation and open chat
      setCurrentConversation(user.username);

      // Close modal
      onClose();
    } catch (error: any) {
      console.error('Failed to start chat:', error);
      const message = error?.response?.data?.detail || 'Failed to start chat. Please try again.';
      setErrorMessage(message);
      setAddingUser(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-cipher-dark border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700 bg-gradient-to-r from-cipher-primary/10 to-cipher-secondary/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                New Conversation
              </h2>
              <p className="text-xs text-gray-400">Search for users to start chatting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                className="w-full pl-10 pr-4 py-3 bg-cipher-darker border border-gray-700 rounded-lg focus:ring-2 focus:ring-cipher-primary focus:border-transparent text-white placeholder-gray-500 transition-all"
                disabled={searchState === 'searching'}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchState === 'searching' || !searchQuery.trim()}
              className="px-5 py-3 bg-gradient-to-r from-cipher-primary to-cipher-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium"
            >
              {searchState === 'searching' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Search</span>
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {searchState === 'error' && errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* General Error */}
          {addingUser === null && errorMessage && searchState !== 'error' && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Results Area */}
          <div className="min-h-[200px] max-h-[320px] overflow-y-auto">
            {/* Idle State */}
            {searchState === 'idle' && (
              <div className="flex flex-col items-center justify-center h-[200px] text-gray-500">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <UserPlus className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-center text-sm">
                  Search for a username to start a new<br />encrypted conversation
                </p>
              </div>
            )}

            {/* Searching State */}
            {searchState === 'searching' && (
              <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-cipher-primary" />
                <p className="text-sm">Searching for users...</p>
              </div>
            )}

            {/* Not Found State */}
            {searchState === 'not_found' && (
              <div className="flex flex-col items-center justify-center h-[200px] text-gray-500">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-amber-500/70" />
                </div>
                <p className="text-center font-medium text-amber-400 mb-1">No users found</p>
                <p className="text-center text-sm text-gray-500">
                  No users match "{searchQuery}".<br />
                  Check the username and try again.
                </p>
              </div>
            )}

            {/* Results List */}
            {searchState === 'success' && searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((user) => {
                  const isExistingChat = conversations.some(c => c.username === user.username);
                  const isAdding = addingUser === user.id;

                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 border border-gray-700 rounded-lg hover:bg-cipher-darker/70 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-11 h-11 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                            {user.username[0].toUpperCase()}
                          </div>
                          {user.is_online && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-cipher-dark" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-white flex items-center gap-2">
                            {user.username}
                            {isExistingChat && (
                              <span className="text-xs px-1.5 py-0.5 bg-cipher-primary/20 text-cipher-primary rounded">
                                Existing
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            {user.public_key ? 'Encryption ready' : 'User available'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleStartChat(user)}
                        disabled={isAdding}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                          ${isExistingChat
                            ? 'bg-cipher-primary/20 text-cipher-primary hover:bg-cipher-primary/30'
                            : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90'
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isAdding ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Starting...</span>
                          </>
                        ) : isExistingChat ? (
                          <>
                            <MessageSquare className="w-4 h-4" />
                            <span>Open</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            <span>Chat</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 bg-cipher-darker/50">
          <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            All conversations are end-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}