'use client';

/**
 * Trusted Contacts List Component
 * Displays all trusted contacts with verification status
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendApi, formatFingerprint, verifyFingerprint } from '../lib/friendApi';
import { TrustedContact, TrustLevel } from '../lib/friendTypes';

interface TrustedContactsListProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContact?: (contact: TrustedContact) => void;
  onContactRemoved?: () => void;
}

export default function TrustedContactsList({
  isOpen,
  onClose,
  onSelectContact,
  onContactRemoved,
}: TrustedContactsListProps) {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<TrustedContact | null>(null);
  const [verificationModal, setVerificationModal] = useState<{
    contact: TrustedContact;
    inputFingerprint: string;
  } | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  // Load contacts
  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const contactList = await friendApi.getTrustedContacts();
      setContacts(contactList);
    } catch (err: any) {
      setError('Failed to load contacts');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadContacts();
    }
  }, [isOpen, loadContacts]);

  // Handle verify contact
  const handleVerify = (contact: TrustedContact) => {
    setVerificationModal({
      contact,
      inputFingerprint: '',
    });
  };

  // Confirm verification
  const confirmVerification = async () => {
    if (!verificationModal) return;

    const { contact, inputFingerprint } = verificationModal;

    if (!verifyFingerprint(inputFingerprint, contact.public_key_fingerprint)) {
      setError('Fingerprint does not match! Keys may have changed.');
      return;
    }

    setProcessingId(contact.id);
    setError(null);

    try {
      await friendApi.verifyContact({
        contact_user_id: contact.contact_user_id,
        verified_fingerprint: inputFingerprint,
      });

      // Update local state
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id
            ? { ...c, is_verified: true, trust_level: 'verified' as TrustLevel }
            : c
        )
      );

      setVerificationModal(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to verify contact');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle remove contact
  const handleRemove = async (contact: TrustedContact) => {
    if (!confirm(`Remove ${contact.contact_username} from your contacts?`)) return;

    setProcessingId(contact.id);
    setError(null);

    try {
      await friendApi.removeContact(contact.contact_user_id);

      // Update local state
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      onContactRemoved?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove contact');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle block contact
  const handleBlock = async (contact: TrustedContact) => {
    if (!confirm(`Block ${contact.contact_username}? They won't be able to contact you.`)) return;

    setProcessingId(contact.id);
    setError(null);

    try {
      await friendApi.blockUser({
        user_id: contact.contact_user_id,
        reason: 'other',
      });

      // Update local state
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      onContactRemoved?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to block contact');
    } finally {
      setProcessingId(null);
    }
  };

  // Filter contacts
  const filteredContacts = contacts.filter((contact) => {
    if (filter === 'verified') return contact.is_verified;
    if (filter === 'unverified') return !contact.is_verified;
    return true;
  });

  // Get trust level badge
  const getTrustBadge = (trustLevel: TrustLevel, isVerified: boolean) => {
    if (trustLevel === 'trusted' || isVerified) {
      return (
        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs flex items-center gap-1">
          <span>✓</span> Verified
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs flex items-center gap-1">
        <span>⚠</span> Unverified
      </span>
    );
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
                <span className="text-2xl">👥</span>
                Trusted Contacts
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex mt-4 bg-gray-800 rounded-lg p-1">
              {(['all', 'verified', 'unverified'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors capitalize ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {f}
                  <span className="ml-2 text-xs opacity-60">
                    ({contacts.filter((c) => 
                      f === 'all' ? true : 
                      f === 'verified' ? c.is_verified : 
                      !c.is_verified
                    ).length})
                  </span>
                </button>
              ))}
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
            ) : filteredContacts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {contacts.length === 0
                  ? 'No trusted contacts yet. Send a friend request to get started!'
                  : `No ${filter} contacts found.`}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContacts.map((contact) => (
                  <motion.div
                    key={contact.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                          contact.is_verified
                            ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                            : 'bg-gradient-to-br from-gray-500 to-gray-600'
                        }`}>
                          {contact.contact_username[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white flex items-center gap-2">
                            {contact.nickname || contact.contact_username}
                            {contact.nickname && (
                              <span className="text-xs text-gray-500">@{contact.contact_username}</span>
                            )}
                          </div>
                          {getTrustBadge(contact.trust_level, contact.is_verified)}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedContact(selectedContact?.id === contact.id ? null : contact)}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${selectedContact?.id === contact.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {selectedContact?.id === contact.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          {/* Fingerprint */}
                          <div className="mb-3 p-2 bg-gray-900 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">Public Key Fingerprint</div>
                            <div className="font-mono text-xs text-blue-400 break-all">
                              🔑 {contact.public_key_fingerprint}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => onSelectContact?.(contact)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors flex items-center gap-1"
                            >
                              💬 Chat
                            </button>
                            {!contact.is_verified && (
                              <button
                                onClick={() => handleVerify(contact)}
                                className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-sm transition-colors flex items-center gap-1"
                              >
                                ✓ Verify
                              </button>
                            )}
                            <button
                              onClick={() => handleRemove(contact)}
                              disabled={processingId === contact.id}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                            >
                              Remove
                            </button>
                            <button
                              onClick={() => handleBlock(contact)}
                              disabled={processingId === contact.id}
                              className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                            >
                              Block
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-800">
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span className="text-lg">🔐</span>
              Only verified contacts have confirmed key fingerprints.
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
                Verify {verificationModal.contact.contact_username}
              </h3>

              <p className="text-sm text-gray-400 mb-4">
                Compare the fingerprint below with your contact's fingerprint. 
                Ask them to share their fingerprint in-person or via a secure channel.
              </p>

              <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                <div className="text-xs text-gray-500 mb-2">Their Key Fingerprint</div>
                <div className="font-mono text-sm text-blue-400 break-all">
                  {verificationModal.contact.public_key_fingerprint}
                </div>
              </div>

              <input
                type="text"
                placeholder="Enter fingerprint to verify..."
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
                  onClick={confirmVerification}
                  disabled={!verificationModal.inputFingerprint || processingId !== null}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Verify
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
