'use client';

/**
 * QR Code Display Component
 * Shows user's QR code for others to scan
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { friendApi } from '@/lib/friendApi';
import { QRCodeData } from '@/lib/friendTypes';
import { X, RefreshCw, Clock, Shield, Copy, Check } from 'lucide-react';

interface QRCodeDisplayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QRCodeDisplay({ isOpen, onClose }: QRCodeDisplayProps) {
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [signature, setSignature] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes in seconds
  const [copied, setCopied] = useState(false);

  // Fetch QR data from backend
  const fetchQRData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await friendApi.getQRData();
      setQrData(data);
      
      // Generate signature (in production, this would be signed with private key)
      // For now, we'll create a simple signature placeholder
      const sig = await generateSignature(data);
      setSignature(sig);
      
      // Reset timer
      setTimeLeft(300);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate QR code');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate signature for QR data
  const generateSignature = async (data: QRCodeData): Promise<string> => {
    // In a real implementation, this would use the user's private key
    // For now, we create a hash of the data + timestamp
    const encoder = new TextEncoder();
    const dataString = `${data.user_id}:${data.username}:${data.timestamp}`;
    const encoded = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 64);
  };

  // Load QR data when opened
  useEffect(() => {
    if (isOpen) {
      fetchQRData();
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-refresh when expired
          fetchQRData();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, timeLeft]);

  // Format time left
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Copy QR data as JSON
  const handleCopy = async () => {
    if (!qrData) return;
    
    const fullData = {
      ...qrData,
      signature,
    };
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(fullData));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Get QR value
  const getQRValue = (): string => {
    if (!qrData) return '';
    return JSON.stringify({
      ...qrData,
      signature,
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
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
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">My QR Code</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchQRData}
                disabled={isLoading}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh QR Code"
              >
                <RefreshCw className={`w-5 h-5 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {error ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={fetchQRData}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-400">Generating QR code...</p>
              </div>
            ) : qrData ? (
              <div className="flex flex-col items-center">
                {/* QR Code */}
                <div className="bg-white p-4 rounded-2xl mb-6">
                  <QRCodeSVG
                    value={getQRValue()}
                    size={240}
                    level="H"
                    includeMargin={false}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>

                {/* User Info */}
                <div className="text-center mb-4">
                  <p className="text-white font-medium text-lg">{qrData.username}</p>
                  <p className="text-gray-500 text-sm">
                    Scan to add as contact
                  </p>
                </div>

                {/* Fingerprint */}
                <div className="w-full bg-gray-800/50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-500 mb-1">Key Fingerprint</p>
                  <p className="text-xs font-mono text-gray-400 break-all">
                    {qrData.public_key_fingerprint}
                  </p>
                </div>

                {/* Timer */}
                <div className={`flex items-center gap-2 text-sm ${timeLeft < 60 ? 'text-red-400' : 'text-yellow-400'}`}>
                  <Clock className="w-4 h-4" />
                  <span>Expires in {formatTime(timeLeft)}</span>
                </div>

                {/* Copy Button */}
                <button
                  onClick={handleCopy}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm text-gray-300"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy QR Data</span>
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-2">
              <Shield className="w-3 h-3" />
              This QR code contains your public key fingerprint for secure verification
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
