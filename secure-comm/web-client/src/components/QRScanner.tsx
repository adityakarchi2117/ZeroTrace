'use client';

/**
 * QR Code Scanner Component
 * For scanning QR codes to add contacts securely
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { friendApi } from '@/lib/friendApi';
import { QRCodeData } from '@/lib/friendTypes';
import { X, Camera, Keyboard, Loader2, Check, AlertCircle, RefreshCw, Shield } from 'lucide-react';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess?: (data: QRCodeData) => void;
}

export default function QRScanner({ isOpen, onClose, onScanSuccess }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<QRCodeData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [success, setSuccess] = useState(false);
  
  const qrReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop scanning
  const stopScanning = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  // Start camera and scanning
  const startScanning = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      setError(null);
      setIsScanning(true);

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      // Set video source
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Initialize QR reader
      const qrReader = new BrowserQRCodeReader();
      qrReaderRef.current = qrReader;

      // Start decoding
      const controls = await qrReader.decodeFromVideoElement(
        videoRef.current,
        (result, _err, controls) => {
          if (result) {
            const text = result.getText();
            handleScanResult(text);
            controls.stop();
          }
        }
      );
      
      controlsRef.current = controls;
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Failed to access camera. Please grant camera permission or use manual input.');
      setIsScanning(false);
    }
  }, []);

  // Handle scan result
  const handleScanResult = async (data: string) => {
    if (isProcessing) return;
    
    stopScanning();
    setIsProcessing(true);

    try {
      // Parse QR code data
      const parsedData: QRCodeData & { signature?: string } = JSON.parse(data);
      
      // Validate structure
      if (!parsedData.user_id || !parsedData.username || !parsedData.public_key_fingerprint) {
        throw new Error('Invalid QR code format');
      }

      // Process the scan
      await processQRData(parsedData);
    } catch (err: any) {
      console.error('Parse error:', err);
      setError(err.message || 'Invalid QR code data');
      setIsProcessing(false);
    }
  };

  // Process scanned QR data
  const processQRData = async (data: QRCodeData & { signature?: string }) => {
    try {
      // Validate timestamp (QR codes expire after 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (now - data.timestamp > 300) {
        setError('QR code has expired. Please ask for a fresh one.');
        setIsProcessing(false);
        return;
      }

      // Send to backend
      const result = await friendApi.processQRScan(data as QRCodeData & { signature: string });

      setScannedData(data);
      setSuccess(true);
      onScanSuccess?.(data);

      // Close after short delay
      setTimeout(() => {
        onClose();
        // Reset state
        setSuccess(false);
        setScannedData(null);
      }, 2000);
    } catch (err: any) {
      console.error('Process error:', err);
      setError(err.response?.data?.detail || 'Failed to process QR code');
      setIsProcessing(false);
    }
  };

  // Handle manual input
  const handleManualInput = async () => {
    if (!manualInput.trim()) return;
    await handleScanResult(manualInput.trim());
  };

  // Start scanning when opened
  useEffect(() => {
    if (isOpen) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isOpen, startScanning, stopScanning]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
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
              <Camera className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Scan QR Code</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Scanner Area */}
          {!showManualInput && (
            <div className="relative aspect-square bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />

              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 border-2 border-white/30 rounded-lg relative">
                  {/* Corner markers */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500" />

                  {/* Scanning line animation */}
                  {isScanning && !isProcessing && !success && (
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-blue-500 shadow-lg shadow-blue-500/50"
                      initial={{ top: 0 }}
                      animate={{ top: '100%' }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Success overlay */}
              {success && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-green-500/20 flex items-center justify-center"
                >
                  <div className="bg-green-500 rounded-full p-4">
                    <Check className="w-12 h-12 text-white" />
                  </div>
                </motion.div>
              )}

              {/* Processing overlay */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-2" />
                    <p className="text-white text-sm">Processing...</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status Messages */}
          <div className="p-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && scannedData && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm mb-4"
              >
                <p className="font-medium">Friend request sent!</p>
                <p className="text-green-400/70">Connected with {scannedData.username}</p>
              </motion.div>
            )}

            {/* Manual Input */}
            <AnimatePresence mode="wait">
              {showManualInput ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <p className="text-xs text-gray-500 mb-2">
                    Paste the QR code JSON data manually:
                  </p>
                  <textarea
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder={`{"user_id": 123, "username": "...", "public_key_fingerprint": "...", "timestamp": 1234567890, "signature": "..."}`}
                    className="w-full h-32 bg-gray-800 text-white text-xs font-mono rounded-lg p-3 border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowManualInput(false)}
                      className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
                    >
                      Back to Camera
                    </button>
                    <button
                      onClick={handleManualInput}
                      disabled={!manualInput.trim() || isProcessing}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Submit'
                      )}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-3"
                >
                  {/* Instructions */}
                  <p className="text-sm text-gray-400 text-center">
                    Align the QR code within the frame to scan
                  </p>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowManualInput(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
                    >
                      <Keyboard className="w-4 h-4" />
                      Manual Input
                    </button>
                    {error && (
                      <button
                        onClick={startScanning}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Retry Camera
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Security Note */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-800">
            <p className="text-xs text-gray-500 flex items-center justify-center gap-2">
              <Shield className="w-3 h-3" />
              QR codes contain signed key fingerprints for secure contact exchange
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
