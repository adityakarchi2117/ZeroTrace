'use client';

/**
 * Blocked Users Panel Component
 * Manages blocked users list with block/unblock functionality
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, ShieldOff, AlertTriangle, Loader2, Search, UserX } from 'lucide-react';
import { friendApi } from '../lib/friendApi';
import { BlockedUser, BlockReason } from '../lib/friendTypes';
import { useStore } from '../lib/store';

interface BlockedUsersPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BlockedUsersPanel({ isOpen, onClose }: BlockedUsersPanelProps) {
  const { token, loadContacts } = useStore();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unblockingUserId, setUnblockingUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmUnblock, setConfirmUnblock] = useState<number | null>(null);

  // Ensure friendApi has the token
  useEffect(() => {
    if (token) {
      friendApi.setToken(token);
    }
  }, [token]);

  // Load blocked users
  const loadBlockedUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const users = await friendApi.getBlockedUsers();
      setBlockedUsers(users);
    } catch (err: any) {
      setError('Failed to load blocked users');
      console.error('Error loading blocked users:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadBlockedUsers();
    }
  }, [isOpen, loadBlockedUsers]);

  // Handle unblock
  const handleUnblock = async (userId: number) => {
    setUnblockingUserId(userId);
    setError(null);
    setSuccess(null);

    try {
      await friendApi.unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((u) => u.blocked_user_id !== userId));
      setSuccess('User unblocked successfully. Contact relationship restored.');
      setConfirmUnblock(null);
      
      // Reload contacts to show the restored contact
      await loadContacts();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to unblock user');
    } finally {
      setUnblockingUserId(null);
    }
  };

  // Filter blocked users by search
  const filteredUsers = blockedUsers.filter((user) =>
    user.blocked_username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get reason display text
  const getReasonDisplay = (reason: BlockReason): string => {
    switch (reason) {
      case 'spam':
        return '🚫 Spam';
      case 'harassment':
        return '⚠️ Harassment';
      case 'unwanted':
        return '👤 Unwanted contact';
      default:
        return '📋 Other';
    }
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!isOpen) return null;

  return (
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
                <Shield className="w-6 h-6 text-red-400" />
                Blocked Users
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                title="Close"
              >
              </button>
            </div>

            {/* Info Text */}
            <p className="mt-2 text-sm text-gray-400">
              Blocked users cannot send you messages, friend requests, or see your profile.
            </p>

            {/* Search */}
            {blockedUsers.length > 0 && (
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search blocked users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg pl-10 pr-4 py-2 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none placeholder-gray-500"
                />
              </div>
            )}
          </div>

          {/* Messages */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-6 mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm flex items-center gap-2"
              >
                <ShieldOff className="w-4 h-4" />
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[50vh]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-4" />
                <p className="text-gray-400">Loading blocked users...</p>
              </div>
            ) : blockedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                  <UserX className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400 mb-2">No blocked users</p>
                <p className="text-gray-500 text-sm">
                  You haven't blocked anyone yet
                </p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No users found matching "{searchQuery}"
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                          <span className="text-white font-medium">
                            {user.blocked_username.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        <div>
                          <p className="font-medium text-white">{user.blocked_username}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{getReasonDisplay(user.reason)}</span>
                            <span>•</span>
                            <span>Blocked {formatDate(user.blocked_at)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Unblock Button */}
                      {confirmUnblock === user.blocked_user_id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUnblock(user.blocked_user_id)}
                            disabled={unblockingUserId === user.blocked_user_id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                          >
                            {unblockingUserId === user.blocked_user_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Confirm'
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmUnblock(null)}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmUnblock(user.blocked_user_id)}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors flex items-center gap-1"
                        >
                          <ShieldOff className="w-4 h-4" />
                          Unblock
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-800 bg-gray-900/50">
            <p className="text-xs text-gray-500 text-center">
              Unblocking a user will allow them to send you friend requests again.
              You'll need to accept their request to communicate.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
