'use client';

/**
 * Profile Actions Menu Component
 * Dropdown menu for contact profile actions: unfriend, block, verify, etc.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MoreVertical,
  UserMinus,
  Shield,
  ShieldCheck,
  Key,
  Copy,
  Bell,
  BellOff,
  AlertTriangle,
  Loader2,
  Check,
  Fingerprint,
  QrCode,
} from 'lucide-react';
import { friendApi } from '../lib/friendApi';
import { useStore } from '../lib/store';

interface ProfileActionsMenuProps {
  contactUserId: number;
  contactUsername: string;
  isVerified?: boolean;
  trustLevel?: string;
  fingerprint?: string;
  onUnfriend?: () => void;
  onBlock?: () => void;
  onVerify?: () => void;
  onShowQR?: () => void;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

export default function ProfileActionsMenu({
  contactUserId,
  contactUsername,
  isVerified = false,
  trustLevel = 'unverified',
  fingerprint,
  onUnfriend,
  onBlock,
  onVerify,
  onShowQR,
}: ProfileActionsMenuProps) {
  const { token } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'unfriend' | 'block' | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ensure friendApi has token
  useEffect(() => {
    if (token) {
      friendApi.setToken(token);
    }
  }, [token]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setConfirmAction(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle unfriend
  const handleUnfriend = async () => {
    if (confirmAction !== 'unfriend') {
      setConfirmAction('unfriend');
      return;
    }

    setActionState('loading');
    try {
      await friendApi.unfriendUser(contactUserId, true);
      setActionState('success');
      onUnfriend?.();
      setTimeout(() => {
        setIsOpen(false);
        setConfirmAction(null);
        setActionState('idle');
      }, 1000);
    } catch (error) {
      setActionState('error');
      setTimeout(() => setActionState('idle'), 2000);
    }
  };

  // Handle block
  const handleBlock = async () => {
    if (confirmAction !== 'block') {
      setConfirmAction('block');
      return;
    }

    setActionState('loading');
    try {
      await friendApi.blockUser(contactUserId, 'other');
      setActionState('success');
      onBlock?.();
      setTimeout(() => {
        setIsOpen(false);
        setConfirmAction(null);
        setActionState('idle');
      }, 1000);
    } catch (error) {
      setActionState('error');
      setTimeout(() => setActionState('idle'), 2000);
    }
  };

  // Copy fingerprint
  const handleCopyFingerprint = () => {
    if (fingerprint) {
      navigator.clipboard.writeText(fingerprint);
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
    }
  };

  // Cancel action
  const handleCancel = () => {
    setConfirmAction(null);
    setActionState('idle');
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-64 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="p-3 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {contactUsername.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{contactUsername}</p>
                  <div className="flex items-center gap-1">
                    {isVerified ? (
                      <ShieldCheck className="w-3 h-3 text-green-400" />
                    ) : (
                      <Shield className="w-3 h-3 text-yellow-400" />
                    )}
                    <span className="text-xs text-gray-400 capitalize">{trustLevel}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-2">
              {/* Verification Section */}
              <div className="mb-2">
                <p className="px-2 py-1 text-xs text-gray-500 uppercase font-medium">Security</p>

                {/* Verify Contact */}
                {!isVerified && (
                  <button
                    onClick={onVerify}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 rounded-lg transition-colors text-left"
                  >
                    <Fingerprint className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-white">Verify Contact</span>
                  </button>
                )}

                {/* Show QR Code */}
                <button
                  onClick={onShowQR}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 rounded-lg transition-colors text-left"
                >
                  <QrCode className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-white">Show QR Code</span>
                </button>

                {/* Copy Fingerprint */}
                {fingerprint && (
                  <button
                    onClick={handleCopyFingerprint}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 rounded-lg transition-colors text-left"
                  >
                    {copiedFingerprint ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-sm text-white">
                      {copiedFingerprint ? 'Copied!' : 'Copy Fingerprint'}
                    </span>
                  </button>
                )}
              </div>

              <div className="border-t border-gray-800 my-2" />

              {/* Danger Zone */}
              <div>
                <p className="px-2 py-1 text-xs text-gray-500 uppercase font-medium">Actions</p>

                {/* Unfriend */}
                {confirmAction === 'unfriend' ? (
                  <div className="px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                    <div className="flex items-center gap-2 text-red-400 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs">Remove this contact?</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUnfriend}
                        disabled={actionState === 'loading'}
                        className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-xs rounded transition-colors flex items-center justify-center gap-1"
                      >
                        {actionState === 'loading' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : actionState === 'success' ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          'Confirm'
                        )}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleUnfriend}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-500/10 rounded-lg transition-colors text-left group"
                  >
                    <UserMinus className="w-4 h-4 text-orange-400 group-hover:text-red-400" />
                    <span className="text-sm text-white group-hover:text-red-400">Unfriend</span>
                  </button>
                )}

                {/* Block */}
                {confirmAction === 'block' ? (
                  <div className="px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20 mt-2">
                    <div className="flex items-center gap-2 text-red-400 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs">Block this user?</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleBlock}
                        disabled={actionState === 'loading'}
                        className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-xs rounded transition-colors flex items-center justify-center gap-1"
                      >
                        {actionState === 'loading' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : actionState === 'success' ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          'Block'
                        )}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleBlock}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-500/10 rounded-lg transition-colors text-left group"
                  >
                    <Shield className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-white group-hover:text-red-400">Block User</span>
                  </button>
                )}
              </div>
            </div>

            {/* Footer Note */}
            <div className="p-2 border-t border-gray-800 bg-gray-800/30">
              <p className="text-[10px] text-gray-500 text-center">
                Blocking prevents all communication
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
