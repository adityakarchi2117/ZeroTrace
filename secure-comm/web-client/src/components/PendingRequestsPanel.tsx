'use client';

/**
 * Pending Friend Requests Panel
 * Shows incoming and outgoing friend requests
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendApi, formatFingerprint, verifyFingerprint, computeKeyFingerprintSync } from '../lib/friendApi';
import { FriendRequest, PendingRequests, AcceptFriendRequestData } from '../lib/friendTypes';
import { useStore } from '../lib/store';

interface PendingRequestsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserPublicKey: string;
  onRequestAccepted?: () => void;
  onRequestRejected?: () => void;
}

export default function PendingRequestsPanel({
  isOpen,
  onClose,
  currentUserPublicKey,
  onRequestAccepted,
  onRequestRejected,
}: PendingRequestsPanelProps) {
  const { token } = useStore();
  const [pendingRequests, setPendingRequests] = useState<PendingRequests | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationModal, setVerificationModal] = useState<{
    request: FriendRequest;
    inputFingerprint: string;
  } | null>(null);

  // Ensure friendApi has the token synced
  useEffect(() => {
    if (token) {
      friendApi.setToken(token);
    }
  }, [token]);

  // Load pending requests
  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const requests = await friendApi.getPendingRequests();
      setPendingRequests(requests);
    } catch (err: any) {
      setError('Failed to load pending requests');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRequests();
    }
  }, [isOpen, loadRequests]);

  // Handle accepting a request
  const handleAccept = async (request: FriendRequest) => {
    // Open verification modal
    setVerificationModal({
      request,
      inputFingerprint: '',
    });
  };

  // Confirm acceptance with fingerprint verification
  const confirmAccept = async () => {
    if (!verificationModal) return;
    
    const { request, inputFingerprint } = verificationModal;
    
    // Verify the fingerprint matches
    if (!verifyFingerprint(inputFingerprint, request.sender_public_key_fingerprint)) {
      setError('Fingerprint does not match! This could indicate a man-in-the-middle attack.');
      return;
    }

    setProcessingId(request.id);
    setError(null);

    try {
      const acceptData: AcceptFriendRequestData = {
        request_id: request.id,
        receiver_public_key_fingerprint: computeKeyFingerprintSync(currentUserPublicKey),
        verify_sender_fingerprint: inputFingerprint,
      };

      await friendApi.acceptFriendRequest(acceptData);
      
      // Remove from list
      setPendingRequests((prev) =>
        prev
          ? {
              ...prev,
              incoming: prev.incoming.filter((r) => r.id !== request.id),
              total_incoming: prev.total_incoming - 1,
            }
          : null
      );
      
      setVerificationModal(null);
      onRequestAccepted?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to accept request');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle rejecting a request
  const handleReject = async (request: FriendRequest) => {
    setProcessingId(request.id);
    setError(null);

    try {
      await friendApi.rejectFriendRequest({ request_id: request.id });
      
      // Remove from list
      setPendingRequests((prev) =>
        prev
          ? {
              ...prev,
              incoming: prev.incoming.filter((r) => r.id !== request.id),
              total_incoming: prev.total_incoming - 1,
            }
          : null
      );
      
      onRequestRejected?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle canceling an outgoing request
  const handleCancel = async (request: FriendRequest) => {
    setProcessingId(request.id);
    setError(null);

    try {
      await friendApi.cancelFriendRequest(request.id);
      
      // Remove from list
      setPendingRequests((prev) =>
        prev
          ? {
              ...prev,
              outgoing: prev.outgoing.filter((r) => r.id !== request.id),
              total_outgoing: prev.total_outgoing - 1,
            }
          : null
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel request');
    } finally {
      setProcessingId(null);
    }
  };

  // Format time remaining until expiry
  const formatTimeRemaining = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
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
                <span className="text-2xl">📨</span>
                Friend Requests
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex mt-4 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('incoming')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'incoming'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Incoming
                {pendingRequests && pendingRequests.total_incoming > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-500 rounded-full text-xs">
                    {pendingRequests.total_incoming}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('outgoing')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'outgoing'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Outgoing
                {pendingRequests && pendingRequests.total_outgoing > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-gray-600 rounded-full text-xs">
                    {pendingRequests.total_outgoing}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[50vh]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg className="w-8 h-8 animate-spin text-blue-500" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : activeTab === 'incoming' ? (
              pendingRequests?.incoming.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No incoming friend requests
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests?.incoming.map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center text-white font-semibold">
                            {request.sender_username[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-white">{request.sender_username}</div>
                            <div className="text-xs text-gray-500">
                              {formatTimeRemaining(request.expires_at)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Fingerprint */}
                      <div className="mb-3 p-2 bg-gray-900 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Sender's Key Fingerprint</div>
                        <div className="font-mono text-xs text-blue-400 break-all">
                          🔑 {request.sender_public_key_fingerprint}
                        </div>
                      </div>

                      {/* Message */}
                      {request.message && (
                        <div className="mb-3 p-2 bg-gray-900 rounded-lg">
                          <div className="text-xs text-gray-500 mb-1">Message</div>
                          <div className="text-sm text-gray-300">{request.message}</div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(request)}
                          disabled={processingId === request.id}
                          className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          {processingId === request.id ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            '✓'
                          )}
                          Accept
                        </button>
                        <button
                          onClick={() => handleReject(request)}
                          disabled={processingId === request.id}
                          className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )
            ) : pendingRequests?.outgoing.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No outgoing friend requests
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests?.outgoing.map((request) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                          {request.receiver_username[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white">{request.receiver_username}</div>
                          <div className="text-xs text-gray-500">
                            {formatTimeRemaining(request.expires_at)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancel(request)}
                        disabled={processingId === request.id}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Security Note */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-800">
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span className="text-lg">🔒</span>
              Verify fingerprints in-person or via secure channel to prevent MITM attacks.
            </p>
          </div>
        </motion.div>

        {/* Verification Modal */}
        {verificationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/70 z-60 flex items-center justify-center p-4"
            onClick={() => setVerificationModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-xl">🔐</span>
                Verify Fingerprint
              </h3>
              
              <p className="text-sm text-gray-400 mb-4">
                To ensure secure communication, please verify {verificationModal.request.sender_username}'s 
                key fingerprint. Ask them to share their fingerprint in-person or via another secure channel.
              </p>

              <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                <div className="text-xs text-gray-500 mb-2">Expected Fingerprint</div>
                <div className="font-mono text-sm text-blue-400 break-all">
                  {verificationModal.request.sender_public_key_fingerprint}
                </div>
              </div>

              <input
                type="text"
                placeholder="Enter the fingerprint to verify..."
                value={verificationModal.inputFingerprint}
                onChange={(e) =>
                  setVerificationModal({
                    ...verificationModal,
                    inputFingerprint: e.target.value,
                  })
                }
                className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm mb-4"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setVerificationModal(null)}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAccept}
                  disabled={!verificationModal.inputFingerprint}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Verify & Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
