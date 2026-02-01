'use client';

/**
 * QR Code Scanner Component
 * For scanning QR codes to add contacts securely
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendApi } from '../lib/friendApi';
import { QRCodeData } from '../lib/friendTypes';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess?: (data: QRCodeData) => void;
}

export default function QRScanner({ isOpen, onClose, onScanSuccess }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<QRCodeData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start camera and scanning
  useEffect(() => {
    if (!isOpen) return;

    const startScanning = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsScanning(true);

          // Start scanning for QR codes
          scanIntervalRef.current = setInterval(() => {
            scanQRCode();
          }, 200);
        }
      } catch (err) {
        setError('Failed to access camera. Please grant camera permission.');
        console.error('Camera access error:', err);
      }
    };

    startScanning();

    // Cleanup
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [isOpen]);

  // Scan for QR code in video frame
  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // In a real implementation, you would use a QR code scanning library
    // like @zxing/library or jsQR. For this example, we'll simulate the detection.
    // The actual scanning would look like:
    // const code = jsQR(imageData.data, imageData.width, imageData.height);

    // Simulated QR code detection (in production, use actual QR library)
    // This is a placeholder - you would integrate a real QR scanning library
  };

  // Handle manual QR data input (fallback)
  const [manualInput, setManualInput] = useState('');

  const handleManualInput = async () => {
    try {
      const data = JSON.parse(manualInput) as QRCodeData & { signature: string };
      await processQRData(data);
    } catch (err) {
      setError('Invalid QR code data format');
    }
  };

  // Process scanned QR data
  const processQRData = async (data: QRCodeData & { signature: string }) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Validate timestamp (QR codes expire after 5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (now - data.timestamp > 300) {
        setError('QR code has expired. Please ask for a new one.');
        return;
      }

      // Send to backend to create friend request
      const result = await friendApi.processQRScan(data);

      setScannedData(data);
      onScanSuccess?.(data);

      // Close after short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process QR code');
    } finally {
      setIsProcessing(false);
    }
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
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-xl">📷</span>
              Scan QR Code
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

          {/* Scanner Area */}
          <div className="relative aspect-square bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-white/50 rounded-lg relative">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-blue-500" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-blue-500" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-blue-500" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-blue-500" />

                {/* Scanning line animation */}
                {isScanning && (
                  <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-blue-500"
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
            {scannedData && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-green-500/20 flex items-center justify-center"
              >
                <div className="bg-green-500 rounded-full p-4">
                  <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </motion.div>
            )}
          </div>

          {/* Status Messages */}
          <div className="p-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            {scannedData && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm mb-4">
                Friend request sent to {scannedData.username}!
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </div>
            )}

            {/* Manual Input Fallback */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">
                Can't scan? Paste QR code data manually:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste QR data JSON..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={handleManualInput}
                  disabled={!manualInput}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>

          {/* Security Note */}
          <div className="p-4 bg-gray-800/50 border-t border-gray-800">
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <span className="text-lg">🔒</span>
              QR codes contain signed key fingerprints for secure contact exchange.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
