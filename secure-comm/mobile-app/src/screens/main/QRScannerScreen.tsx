/**
 * QR Scanner Screen
 * Scan QR codes to add contacts securely
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Camera, useCameraDevices, useCodeScanner } from 'react-native-vision-camera';
import { showMessage } from 'react-native-flash-message';
import { useAuthStore } from '../../store/authStore';
import {
  friendAPI,
  QRCodeData,
  computeKeyFingerprint,
} from '../../services/friendApi';
import { colors } from '../../theme/colors';

interface QRScannerScreenProps {
  navigation: any;
}

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

export default function QRScannerScreen({ navigation }: QRScannerScreenProps) {
  const { user } = useAuthStore();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);
  
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back');

  // Request camera permission
  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Generate my QR code data
  const getMyQRData = (): QRCodeData | null => {
    if (!user?.public_key) return null;
    
    return {
      user_id: user.user_id,
      username: user.username,
      public_key_fingerprint: computeKeyFingerprint(user.public_key),
      timestamp: new Date().toISOString(),
      nonce: Math.random().toString(36).substring(2, 15),
    };
  };

  // Handle scanned QR code
  const handleScan = async (data: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // Parse QR code data
      const qrData: QRCodeData = JSON.parse(data);
      
      // Validate QR code structure
      if (!qrData.user_id || !qrData.username || !qrData.public_key_fingerprint) {
        throw new Error('Invalid QR code format');
      }
      
      // Check if scanning own code
      if (qrData.user_id === user?.user_id) {
        showMessage({
          message: 'Invalid QR Code',
          description: 'You scanned your own QR code',
          type: 'warning',
        });
        setIsProcessing(false);
        return;
      }
      
      // Check timestamp (QR codes valid for 5 minutes)
      const timestamp = new Date(qrData.timestamp);
      const now = new Date();
      const diffMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
      
      if (diffMinutes > 5) {
        showMessage({
          message: 'QR Code Expired',
          description: 'Please ask them to generate a new QR code',
          type: 'warning',
        });
        setIsProcessing(false);
        return;
      }
      
      // Process QR scan
      const response = await friendAPI.processQRScan(qrData);
      
      showMessage({
        message: 'Contact Added!',
        description: `You're now connected with ${qrData.username}`,
        type: 'success',
      });
      
      navigation.goBack();
      
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        showMessage({
          message: 'Invalid QR Code',
          description: 'This is not a valid ZeroTrace contact code',
          type: 'danger',
        });
      } else {
        showMessage({
          message: 'Scan Failed',
          description: error.response?.data?.detail || error.message,
          type: 'danger',
        });
      }
    } finally {
      // Add delay before allowing next scan
      setTimeout(() => setIsProcessing(false), 2000);
    }
  };

  // Code scanner hook
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && codes[0].value) {
        handleScan(codes[0].value);
      }
    },
  });

  // Permission states
  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.messageText}>Requesting camera permission...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.messageText}>Camera permission denied</Text>
          <Text style={styles.subText}>
            Please enable camera access in settings to scan QR codes
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // My QR Code view
  if (showMyCode) {
    const myQRData = getMyQRData();
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setShowMyCode(false)}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My QR Code</Text>
        </View>

        <View style={styles.qrContainer}>
          <View style={styles.qrPlaceholder}>
            {/* In production, use react-native-qrcode-svg */}
            <Text style={styles.qrPlaceholderText}>
              {myQRData ? JSON.stringify(myQRData, null, 2) : 'No key available'}
            </Text>
          </View>
          
          <Text style={styles.qrInstructions}>
            Let others scan this code to add you as a contact
          </Text>
          
          <Text style={styles.qrNote}>
            ⚠️ This code expires in 5 minutes for security
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Scanner view
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan QR Code</Text>
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        {device && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!isProcessing}
            codeScanner={codeScanner}
          />
        )}
        
        {/* Scan overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Processing indicator */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Align the QR code within the frame to scan
        </Text>
      </View>

      {/* Show my QR button */}
      <TouchableOpacity
        style={styles.showMyCodeButton}
        onPress={() => setShowMyCode(true)}
      >
        <Text style={styles.showMyCodeText}>Show My QR Code</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: '#fff',
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanArea: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.primary,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  instructions: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  showMyCodeButton: {
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  showMyCodeText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  messageText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  subText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  qrContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrPlaceholder: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    backgroundColor: '#fff',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    marginBottom: 24,
  },
  qrPlaceholderText: {
    color: '#000',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  qrInstructions: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  qrNote: {
    color: '#eab308',
    fontSize: 12,
    textAlign: 'center',
  },
});
