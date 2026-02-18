/**
 * Trust Verification Screen
 * Verify contact's identity through fingerprint comparison
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { useAuthStore } from '../../store/authStore';
import {
  friendAPI,
  TrustedContact,
  formatFingerprint,
  computeKeyFingerprint,
} from '../../services/friendApi';
import { colors } from '../../theme/colors';

interface TrustVerificationScreenProps {
  navigation: any;
  route: {
    params: {
      contact: TrustedContact;
    };
  };
}

export default function TrustVerificationScreen({
  navigation,
  route,
}: TrustVerificationScreenProps) {
  const { contact } = route.params;
  const { user } = useAuthStore();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<'instructions' | 'compare' | 'complete'>('instructions');

  // Get my fingerprint
  const myFingerprint = (user?.public_key || user?.publicKey)
    ? computeKeyFingerprint(user?.public_key || user?.publicKey || '')
    : '';

  // Format fingerprint for display
  const formatForDisplay = (fp: string) => {
    return formatFingerprint(fp, false);
  };

  // Handle verification confirmation
  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await friendAPI.verifyContact({
        contact_user_id: contact.contact_user_id,
        verified_fingerprint: contact.public_key_fingerprint,
      });

      setVerificationStep('complete');

      showMessage({
        message: 'Contact Verified!',
        description: `${contact.contact_username} is now a verified contact`,
        type: 'success',
      });

    } catch (error: any) {
      showMessage({
        message: 'Verification Failed',
        description: error.response?.data?.detail || 'Please try again',
        type: 'danger',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle mismatch report
  const handleMismatch = () => {
    Alert.alert(
      '⚠️ Security Warning',
      'If the fingerprints don\'t match, this could indicate a man-in-the-middle attack. The contact\'s keys may have been compromised.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Contact',
          style: 'destructive',
          onPress: async () => {
            try {
              await friendAPI.removeContact(contact.contact_user_id);
              showMessage({
                message: 'Contact Removed',
                description: 'For your security, the contact has been removed',
                type: 'info',
              });
              navigation.goBack();
            } catch (error) {
              showMessage({
                message: 'Error',
                description: 'Failed to remove contact',
                type: 'danger',
              });
            }
          },
        },
      ]
    );
  };

  // Instructions step
  if (verificationStep === 'instructions') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Verify Identity</Text>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔐</Text>
          </View>

          <Text style={styles.heading}>
            Verify {contact.contact_username}'s Identity
          </Text>

          <Text style={styles.description}>
            To ensure you're communicating with the real {contact.contact_username}
            and not an impersonator, you should verify their key fingerprint through
            a trusted channel.
          </Text>

          <View style={styles.stepsContainer}>
            <Text style={styles.stepsTitle}>Verification Steps:</Text>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={styles.stepText}>
                Contact {contact.contact_username} through a trusted channel
                (in person, phone call, video chat)
              </Text>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={styles.stepText}>
                Ask them to read their key fingerprint to you
              </Text>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.stepText}>
                Compare it with the fingerprint shown in this app
              </Text>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>4</Text>
              </View>
              <Text style={styles.stepText}>
                If they match exactly, mark the contact as verified
              </Text>
            </View>
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ Never verify fingerprints over an unencrypted channel or text message,
              as these can be intercepted.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setVerificationStep('compare')}
          >
            <Text style={styles.primaryButtonText}>Start Verification</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Compare step
  if (verificationStep === 'compare') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setVerificationStep('instructions')}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Compare Fingerprints</Text>
        </View>

        <ScrollView style={styles.content}>
          {/* Their fingerprint */}
          <View style={styles.fingerprintSection}>
            <Text style={styles.fingerprintLabel}>
              {contact.contact_username}'s Fingerprint:
            </Text>
            <View style={styles.fingerprintBox}>
              <Text style={styles.fingerprintValue}>
                {formatForDisplay(contact.public_key_fingerprint)}
              </Text>
            </View>
            <Text style={styles.fingerprintHint}>
              Ask {contact.contact_username} to read this fingerprint aloud
            </Text>
          </View>

          {/* My fingerprint (for them to verify) */}
          <View style={styles.fingerprintSection}>
            <Text style={styles.fingerprintLabel}>Your Fingerprint:</Text>
            <View style={[styles.fingerprintBox, styles.myFingerprintBox]}>
              <Text style={styles.fingerprintValue}>
                {formatForDisplay(myFingerprint)}
              </Text>
            </View>
            <Text style={styles.fingerprintHint}>
              Read this to {contact.contact_username} so they can verify you too
            </Text>
          </View>

          {/* Verification question */}
          <View style={styles.questionBox}>
            <Text style={styles.questionText}>
              Does the fingerprint {contact.contact_username} read match exactly
              what's shown above?
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.matchButton]}
              onPress={handleVerify}
              disabled={isVerifying}
            >
              <Text style={styles.matchButtonText}>
                {isVerifying ? 'Verifying...' : '✓ Yes, They Match'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.mismatchButton]}
              onPress={handleMismatch}
              disabled={isVerifying}
            >
              <Text style={styles.mismatchButtonText}>✗ No, They Don't Match</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Complete step
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.completeContent}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>

        <Text style={styles.completeHeading}>Verification Complete!</Text>

        <Text style={styles.completeText}>
          {contact.contact_username} is now a verified contact.
          You can be confident you're communicating with the real person.
        </Text>

        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedBadgeText}>
            ✓ Verified Contact
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryButtonText}>Done</Text>
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
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  stepsContainer: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  stepsTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  stepText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  warningText: {
    color: '#eab308',
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: colors.primary.main,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fingerprintSection: {
    marginBottom: 24,
  },
  fingerprintLabel: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  fingerprintBox: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  myFingerprintBox: {
    borderColor: colors.primary.main,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  fingerprintValue: {
    color: colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 20,
  },
  fingerprintHint: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  questionBox: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  questionText: {
    color: colors.text.primary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  actionButtons: {
    gap: 12,
  },
  actionButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  matchButton: {
    backgroundColor: '#22c55e',
  },
  matchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mismatchButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  mismatchButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  completeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIconText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  completeHeading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 16,
  },
  completeText: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 32,
  },
  verifiedBadgeText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
});

