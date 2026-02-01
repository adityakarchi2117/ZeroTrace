'use client';

/**
 * Add Friend Panel Component
 * Allows users to search and send friend requests, or scan QR codes
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendApi, computeKeyFingerprintSync, formatFingerprint } from '../lib/friendApi';
import { UserSearchResult, SendFriendRequestData } from '../lib/friendTypes';
import { useStore } from '../lib/store';
import { Search, QrCode, Keyboard, X, Loader2, UserPlus, Shield } from 'lucide-react';
import QRScanner from './QRScanner';

interface AddFriendPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserPublicKey: string;
  onRequestSent?: () => void;
}

type TabType = 'search' | 'scan';

export default function AddFriendPanel({
  isOpen,
  onClose,
  currentUserPublicKey,
  onRequestSent,
}: AddFriendPanelProps) {
  const { token } = useStore();
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [showScanner, setShowScanner] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'username' | 'user_id' | 'fingerprint'>('username');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  // Ensure friendApi has the token synced
  useEffect(() => {
    if (token) {
      friendApi.setToken(token);
    }
  }, [token]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab('search');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  // Debounced search
  const handleSearch = useCallback(async () => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const results = await friendApi.searchUsers(searchQuery, searchType);
      setSearchResults(results);
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Search rate limit reached. Please wait before searching again.');
      } else {
        setError('Failed to search users. Please try again.');
      }
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchType]);

  // Handle sending friend request
  const handleSendRequest = async (user: UserSearchResult) => {
    if (isSending) return;

    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      const senderFingerprint = computeKeyFingerprintSync(currentUserPublicKey);
      
      const requestData: SendFriendRequestData = {
        receiver_username: user.username,
        sender_public_key_fingerprint: senderFingerprint,
        message: message || undefined,
      };

      await friendApi.sendFriendRequest(requestData);
      
      setSuccess(`Friend request sent to ${user.username}!`);
      setMessage('');
      
      // Update search results to show pending status
      setSearchResults((prev) =>
        prev.map((u) =>
          u.user_id === user.user_id ? { ...u, has_pending_request: true } : u
        )
      );
      
      onRequestSent?.();
    } catch (err: any) {
      if (err.response?.status === 429) {
        setError('Friend request rate limit reached. Please wait before sending more requests.');
      } else if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Failed to send friend request. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

  // Handle QR scan success
  const handleScanSuccess = () => {
    setSuccess('Friend request sent via QR code!');
    onRequestSent?.();
  };

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <UserPlus className="w-6 h-6 text-blue-400" />
                  Add Friend
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mt-4 p-1 bg-gray-800/50 rounded-lg">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'search'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  Search
                </button>
                <button
                  onClick={() => setActiveTab('scan')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'scan'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Scan QR
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'search' ? (
                  <motion.div
                    key="search"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    {/* Search Input */}
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <select
                          value={searchType}
                          onChange={(e) => setSearchType(e.target.value as any)}
                          className="bg-gray-800 text-gray-300 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                          <option value="username">Username</option>
                          <option value="user_id">User ID</option>
                          <option value="fingerprint">Fingerprint</option>
                        </select>
                        <input
                          type="text"
                          placeholder={`Search by ${searchType}...`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder-gray-500"
                        />
                        <button
                          onClick={handleSearch}
                          disabled={isSearching || searchQuery.length < 2}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          {isSearching ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                          Search
                        </button>
                      </div>

                      {/* Optional Message */}
                      <input
                        type="text"
                        placeholder="Add a message (optional)"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={200}
                        className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder-gray-500 text-sm"
                      />
                    </div>

                    {/* Messages */}
                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                        {success}
                      </div>
                    )}

                    {/* Results */}
                    <div className="overflow-y-auto max-h-[40vh]">
                      {searchResults.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                          {searchQuery.length >= 2
                            ? 'No users found. Try a different search.'
                            : 'Enter at least 2 characters to search.'}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {searchResults.map((user) => (
                            <motion.div
                              key={user.user_id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                                  {user.username[0].toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-white">{user.username}</div>
                                  {user.public_key_fingerprint && (
                                    <div className="text-xs text-gray-500 font-mono">
                                      🔑 {formatFingerprint(user.public_key_fingerprint, true)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div>
                                {user.is_contact ? (
                                  <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm">
                                    ✓ Contact
                                  </span>
                                ) : user.has_pending_request ? (
                                  <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-sm">
                                    ⏳ Pending
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleSendRequest(user)}
                                    disabled={isSending}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                                  >
                                    {isSending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <UserPlus className="w-4 h-4" />
                                    )}
                                    Add
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="scan"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="text-center py-8"
                  >
                    <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <QrCode className="w-10 h-10 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">
                      Scan QR Code
                    </h3>
                    <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
                      Scan another user's QR code to quickly add them as a contact without searching
                    </p>
                    
                    <div className="space-y-3">
                      <button
                        onClick={() => setShowScanner(true)}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-medium"
                      >
                        <QrCode className="w-5 h-5" />
                        Open QR Scanner
                      </button>
                      
                      <button
                        onClick={() => setActiveTab('search')}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
                      >
                        <Keyboard className="w-5 h-5" />
                        Enter Code Manually
                      </button>
                    </div>

                    {success && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm"
                      >
                        {success}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Security Note */}
            <div className="p-4 bg-gray-800/50 border-t border-gray-800">
              <p className="text-xs text-gray-500 flex items-center justify-center gap-2">
                <Shield className="w-3 h-3" />
                {activeTab === 'search' 
                  ? 'Friend requests include your public key fingerprint for secure key exchange.'
                  : 'QR codes contain signed key fingerprints and expire after 5 minutes for security.'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
