'use client';

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { friendApi, computeKeyFingerprintSync } from '@/lib/friendApi';
import { X, Search, UserPlus, Loader2, AlertCircle, MessageSquare, UserCheck, Clock } from 'lucide-react';

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
  is_friend?: boolean;
  has_pending_request?: boolean;
}

type SearchState = 'idle' | 'searching' | 'success' | 'error' | 'not_found';

export default function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [addingUser, setAddingUser] = useState<number | null>(null);
  const [sendingRequest, setSendingRequest] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const {
    setCurrentConversation,
    searchUsers,
    loadContacts,
    loadConversations,
    conversations,
    contacts,
    publicKey
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
      setSendingRequest(null);
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
        // Enrich results with friend status
        const enrichedResults = results.map(user => {
          const isFriend = contacts.some(c => c.contact_username === user.username);
          return {
            ...user,
            is_friend: isFriend,
            has_pending_request: false // Will be updated if we check pending requests
          };
        });
        setSearchResults(enrichedResults);
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

      // Check if already a friend/contact
      const isFriend = contacts.some(c => c.contact_username === user.username);

      if (!isFriend) {
        // Not a friend - they need to send a friend request first
        setErrorMessage(`You must be friends with ${user.username} to chat. Send them a friend request first!`);
        setAddingUser(null);
        return;
      }

      // They are friends, reload conversations and open chat
      await loadConversations();
      setCurrentConversation(user.username);
      onClose();
    } catch (error: any) {
      console.error('Failed to start chat:', error);
      const message = error?.response?.data?.detail || 'Failed to start chat. Please try again.';
      setErrorMessage(message);
      setAddingUser(null);
    }
  };

  // Send friend request
  const handleSendFriendRequest = async (user: SearchResult) => {
    if (!publicKey) {
      setErrorMessage('Your encryption keys are not set up. Please refresh the page.');
      return;
    }

    setSendingRequest(user.id);
    setErrorMessage('');

    try {
      const fingerprint = computeKeyFingerprintSync(publicKey);
      await friendApi.sendFriendRequest({
        receiver_username: user.username,
        sender_public_key_fingerprint: fingerprint,
      });

      // Update the result to show pending
      setSearchResults(prev => 
        prev.map(u => u.id === user.id ? { ...u, has_pending_request: true } : u)
      );

      setErrorMessage(`Friend request sent to ${user.username}!`);
    } catch (error: any) {
      console.error('Failed to send friend request:', error);
      const message = error?.response?.data?.detail || 'Failed to send friend request. Please try again.';
      setErrorMessage(message);
    } finally {
      setSendingRequest(null);
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

          {/* General Error/Success */}
          {addingUser === null && sendingRequest === null && errorMessage && searchState !== 'error' && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              errorMessage.includes('sent') 
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {errorMessage.includes('sent') ? (
                <UserCheck className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
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
                  const isSending = sendingRequest === user.id;
                  const isFriend = user.is_friend || contacts.some(c => c.contact_username === user.username);

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
                            {isFriend && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded flex items-center gap-1">
                                <UserCheck className="w-3 h-3" />
                                Friend
                              </span>
                            )}
                            {user.has_pending_request && !isFriend && (
                              <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Pending
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            {isFriend 
                              ? 'You can chat with this user' 
                              : user.has_pending_request 
                                ? 'Friend request sent' 
                                : 'Send friend request to chat'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Action Button */}
                      {isFriend ? (
                        <button
                          onClick={() => handleStartChat(user)}
                          disabled={isAdding}
                          className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Opening...</span>
                            </>
                          ) : (
                            <>
                              <MessageSquare className="w-4 h-4" />
                              <span>Chat</span>
                            </>
                          )}
                        </button>
                      ) : user.has_pending_request ? (
                        <span className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-400 flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Pending</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSendFriendRequest(user)}
                          disabled={isSending}
                          className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-gradient-to-r from-cipher-primary to-cipher-secondary text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              <span>Add Friend</span>
                            </>
                          )}
                        </button>
                      )}
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