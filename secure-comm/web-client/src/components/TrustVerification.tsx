'use client';

/**
 * Trust Verification Screen Component
 * For manually verifying contact key fingerprints
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendApi, formatFingerprint } from '../lib/friendApi';
import { TrustedContact } from '../lib/friendTypes';

interface TrustVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  contact: TrustedContact | null;
  currentUserPublicKey: string;
  currentUsername: string;
  onVerified?: () => void;
}

export default function TrustVerification({
  isOpen,
  onClose,
  contact,
  currentUserPublicKey,
  currentUsername,
  onVerified,
}: TrustVerificationProps) {
  const [step, setStep] = useState<'show' | 'verify'>('show');
  const [inputFingerprint, setInputFingerprint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('show');
      setInputFingerprint('');
      setError(null);
      setVerified(false);
    }
  }, [isOpen]);

  // Get current user's fingerprint
  const myFingerprint = React.useMemo(() => {
    if (!currentUserPublicKey) return '';
    // Simple fingerprint computation
    let cleanKey = currentUserPublicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');
    
    let hash = 0;
    for (let i = 0; i < cleanKey.length; i++) {
      const char = cleanKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(32, '0');
    return hex.match(/.{1,2}/g)?.slice(0, 16).join(':') || '';
  }, [currentUserPublicKey]);

  // Handle verification
  const handleVerify = async () => {
    if (!contact) return;

    // Compare fingerprints (case-insensitive, ignore whitespace)
    const input = inputFingerprint.toUpperCase().replace(/\s/g, '');
    const expected = contact.public_key_fingerprint.toUpperCase().replace(/\s/g, '');

    if (input !== expected) {
      setError(
        'Fingerprint does not match! This could indicate a man-in-the-middle attack. ' +
        'DO NOT communicate sensitive information with this contact until verified.'
      );
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await friendApi.verifyContact({
        contact_user_id: contact.contact_user_id,
        verified_fingerprint: inputFingerprint,
      });

      setVerified(true);
      onVerified?.();

      // Close after short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to verify contact');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen || !contact) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-gray-900 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="text-2xl">🔐</span>
                Key Verification
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

            <p className="text-sm text-gray-400">
              Verify {contact.contact_username}'s identity to ensure secure communication.
              Compare fingerprints in-person or via a trusted channel.
            </p>
          </div>

          {/* Success State */}
          {verified && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 text-center"
            >
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Contact Verified!
              </h3>
              <p className="text-gray-400">
                {contact.contact_username} is now a trusted contact.
              </p>
            </motion.div>
          )}

          {/* Step 1: Show Fingerprints */}
          {!verified && step === 'show' && (
            <div className="p-6">
              {/* Your Fingerprint */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm">
                    {currentUsername[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm text-white">Your Fingerprint</div>
                    <div className="text-xs text-gray-500">Share this with {contact.contact_username}</div>
                  </div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg font-mono text-sm text-blue-400 break-all select-all">
                  {myFingerprint}
                </div>
              </div>

              {/* Their Fingerprint */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-semibold text-sm">
                    {contact.contact_username[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm text-white">{contact.contact_username}'s Fingerprint</div>
                    <div className="text-xs text-gray-500">Ask them to verify this matches</div>
                  </div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg font-mono text-sm text-purple-400 break-all select-all">
                  {contact.public_key_fingerprint}
                </div>
              </div>

              {/* Instructions */}
              <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20 mb-6">
                <h4 className="text-yellow-400 font-medium mb-2 flex items-center gap-2">
                  <span>⚠️</span> Important
                </h4>
                <ul className="text-sm text-yellow-200/80 space-y-1">
                  <li>• Compare fingerprints in-person if possible</li>
                  <li>• Use a different secure channel (phone call, etc.)</li>
                  <li>• Never verify over the same channel you're trying to secure</li>
                  <li>• If fingerprints don't match, do NOT proceed</li>
                </ul>
              </div>

              <button
                onClick={() => setStep('verify')}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                I've Verified the Fingerprints
              </button>
            </div>
          )}

          {/* Step 2: Enter Fingerprint */}
          {!verified && step === 'verify' && (
            <div className="p-6">
              <p className="text-sm text-gray-400 mb-4">
                Enter {contact.contact_username}'s fingerprint as they shared it with you 
                to complete verification.
              </p>

              <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                <div className="text-xs text-gray-500 mb-2">Expected Fingerprint</div>
                <div className="font-mono text-sm text-purple-400 break-all">
                  {contact.public_key_fingerprint}
                </div>
              </div>

              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-2 block">
                  Enter the fingerprint to verify:
                </label>
                <textarea
                  value={inputFingerprint}
                  onChange={(e) => setInputFingerprint(e.target.value)}
                  placeholder="XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm resize-none"
                  rows={3}
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('show')}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleVerify}
                  disabled={!inputFingerprint || isVerifying}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying...
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      Verify Contact
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
