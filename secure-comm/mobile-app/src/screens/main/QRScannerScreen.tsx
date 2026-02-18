/**
 * QR Scanner Screen
 * Scan and share contact QR codes
 */

import React, { useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import QRCode from 'react-native-qrcode-svg';
import { showMessage } from 'react-native-flash-message';
import { useAuthStore } from '../../store/authStore';
import {
  friendAPI,
  QRCodeData,
  computeKeyFingerprint,
} from '../../services/friendApi';
import { deviceLinkService } from '../../services/deviceLinkService';
import { colors } from '../../theme/colors';

interface QRScannerScreenProps {
  navigation: any;
}

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

export default function QRScannerScreen({ navigation }: QRScannerScreenProps) {
  const { user } = useAuthStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const getMyQRData = (): QRCodeData | null => {
    const pubKey = user?.public_key || user?.publicKey;
    if (!pubKey) return null;

    return {
      user_id: user.user_id || user.id,
      username: user.username,
      public_key_fingerprint: computeKeyFingerprint(pubKey),
      identity_key_fingerprint: '',
      timestamp: Date.now(),
      expires_in: 300,
    };
  };

  const handleScan = async (data: string) => {
    if (isProcessing || hasScanned) return;

    setHasScanned(true);
    setIsProcessing(true);

    try {
      const qrData: any = JSON.parse(data);

      // 1. Device Pairing
      if (qrData.type === 'zerotrace_pair') {
        const pubKey = user?.public_key || user?.publicKey;
        if (!pubKey) throw new Error('Public Key not found. Please log in again.');

        showMessage({
          message: 'Verifying QR...',
          type: 'info',
        });

        try {
          // Note: scanPairingQR returns { challenge, fingerprint, device_public_key }
          const result = await deviceLinkService.scanPairingQR(qrData, pubKey);

          Alert.alert(
            'Link New Device?',
            `A new device is requesting access.\n\nFingerprint: ${result.fingerprint.substring(0, 16)}...`,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  setIsProcessing(false);
                  navigation.goBack();
                }
              },
              {
                text: 'Link Device',
                onPress: async () => {
                  try {
                    showMessage({ message: 'Securely Linking...', type: 'info' });
                    await deviceLinkService.approvePairing(
                      qrData.token,
                      user.username,
                      result.device_public_key
                    );
                    showMessage({ message: 'Device Linked Successfully', type: 'success' });
                    navigation.replace('DeviceManagement');
                  } catch (err: any) {
                    showMessage({
                      message: 'Linking Failed',
                      description: err.message,
                      type: 'danger'
                    });
                    setIsProcessing(false);
                  }
                }
              }
            ]
          );
        } catch (e: any) {
          // If scan fails
          showMessage({
            message: 'Invalid Pairing QR',
            description: e.message,
            type: 'danger'
          });
          setIsProcessing(false);
        }
        return;
      }

      // 2. Add Contact
      if (!qrData.user_id || !qrData.username || !qrData.public_key_fingerprint) {
        throw new Error('Invalid QR code format');
      }

      if (qrData.user_id === (user?.user_id || user?.id)) {
        showMessage({
          message: 'Invalid QR Code',
          description: 'You scanned your own QR code',
          type: 'warning',
        });
        return;
      }

      const timestamp = typeof qrData.timestamp === 'number' ? new Date(qrData.timestamp) : new Date(qrData.timestamp);
      const now = new Date();
      const diffMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
      if (diffMinutes > 5) {
        showMessage({
          message: 'QR Code Expired',
          description: 'Please ask them to generate a new QR code',
          type: 'warning',
        });
        return;
      }

      await friendAPI.processQRScan({ ...qrData, signature: '' });
      showMessage({
        message: 'Contact Added',
        description: `You are now connected with ${qrData.username}`,
        type: 'success',
      });
      navigation.goBack();
    } catch (error: any) {
      showMessage({
        message: 'Scan Failed',
        description: error?.response?.data?.detail || error?.message || 'Invalid QR payload',
        type: 'danger',
      });
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setHasScanned(false);
      }, 1200);
    }
  };

  if (showMyCode) {
    const myQRData = getMyQRData();
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setShowMyCode(false)}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My QR Code</Text>
        </View>

        <View style={styles.qrContainer}>
          <View style={styles.qrCard}>
            {myQRData ? (
              <QRCode value={JSON.stringify(myQRData)} size={SCAN_SIZE - 48} />
            ) : (
              <Text style={styles.emptyText}>Generate encryption keys first</Text>
            )}
          </View>
          <Text style={styles.note}>This code expires in 5 minutes.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan QR Code</Text>
      </View>

      <View style={styles.scannerContainer}>
        <Text style={styles.instructions}>Align QR code within the frame</Text>
        <View style={styles.cameraWrapper}>
          <RNCamera
            style={styles.camera}
            type={RNCamera.Constants.Type.back}
            captureAudio={false}
            onBarCodeRead={(event) => {
              if (event?.data) {
                handleScan(event.data);
              }
            }}
            barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
          >
            <View style={styles.marker} />
          </RNCamera>
        </View>
        <TouchableOpacity style={styles.showMyCodeButton} onPress={() => setShowMyCode(true)}>
          <Text style={styles.showMyCodeText}>Show My QR Code</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: colors.primary.main,
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  scannerContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  instructions: {
    color: colors.text.primary,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  cameraWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  marker: {
    width: SCAN_SIZE * 0.75,
    height: SCAN_SIZE * 0.75,
    borderColor: colors.primary.main,
    borderWidth: 2,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  camera: {
    height: SCAN_SIZE + 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMyCodeButton: {
    marginTop: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  showMyCodeText: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  qrContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  qrCard: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  note: {
    color: colors.text.secondary,
    fontSize: 13,
  },
  emptyText: {
    color: '#111827',
  },
});
