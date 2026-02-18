/**
 * ProfileActionsMenu — Bottom sheet menu for contact profile actions
 * Matches web's ProfileActionsMenu.tsx: verify, QR code, fingerprint, unfriend, block
 * Uses React Native Modal + Animated for slide-up with confirm-before-destructive pattern.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Clipboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { friendAPI } from '../../services/friendApi';
import { easings, durations } from '../motion/config';

interface ProfileActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
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

const ProfileActionsMenu: React.FC<ProfileActionsMenuProps> = ({
  isOpen,
  onClose,
  contactUserId,
  contactUsername,
  isVerified = false,
  trustLevel = 'unverified',
  fingerprint,
  onUnfriend,
  onBlock,
  onVerify,
  onShowQR,
}) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [confirmAction, setConfirmAction] = useState<'unfriend' | 'block' | null>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');

  useEffect(() => {
    if (isOpen) {
      setConfirmAction(null);
      setActionState('idle');
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 300,
        damping: 28,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: durations.fade,
        easing: easings.accelerate,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: durations.fade,
      easing: easings.accelerate,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleUnfriend = useCallback(async () => {
    if (confirmAction !== 'unfriend') {
      setConfirmAction('unfriend');
      return;
    }
    setActionState('loading');
    try {
      await friendAPI.removeContact(contactUserId);
      setActionState('success');
      showMessage({ message: `Removed ${contactUsername}`, type: 'success' });
      onUnfriend?.();
      setTimeout(handleClose, 800);
    } catch {
      setActionState('error');
      showMessage({ message: 'Failed to remove contact', type: 'danger' });
      setTimeout(() => setActionState('idle'), 2000);
    }
  }, [confirmAction, contactUserId, contactUsername]);

  const handleBlock = useCallback(async () => {
    if (confirmAction !== 'block') {
      setConfirmAction('block');
      return;
    }
    setActionState('loading');
    try {
      await friendAPI.blockUser({ user_id: contactUserId, reason: 'other' });
      setActionState('success');
      showMessage({ message: `Blocked ${contactUsername}`, type: 'success' });
      onBlock?.();
      setTimeout(handleClose, 800);
    } catch {
      setActionState('error');
      showMessage({ message: 'Failed to block user', type: 'danger' });
      setTimeout(() => setActionState('idle'), 2000);
    }
  }, [confirmAction, contactUserId, contactUsername]);

  const handleCopyFingerprint = () => {
    if (fingerprint) {
      Clipboard.setString(fingerprint);
      showMessage({ message: 'Fingerprint copied!', type: 'success' });
    }
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  if (!isOpen) return null;

  return (
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Drag handle */}
        <View style={styles.handleBar} />

        {/* Contact header */}
        <View style={styles.header}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {contactUsername.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>{contactUsername}</Text>
            <View style={styles.trustRow}>
              <Icon
                name={isVerified ? 'shield-checkmark' : 'shield'}
                size={12}
                color={isVerified ? '#4ADE80' : '#FACC15'}
              />
              <Text style={styles.trustText}>{trustLevel}</Text>
            </View>
          </View>
        </View>

        {/* Security section */}
        <Text style={styles.sectionTitle}>SECURITY</Text>

        {!isVerified && (
          <TouchableOpacity style={styles.actionRow} onPress={onVerify}>
            <Icon name="finger-print" size={18} color="#4ADE80" />
            <Text style={styles.actionText}>Verify Contact</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.actionRow} onPress={onShowQR}>
          <Icon name="qr-code" size={18} color="#60A5FA" />
          <Text style={styles.actionText}>Show QR Code</Text>
        </TouchableOpacity>

        {fingerprint && (
          <TouchableOpacity style={styles.actionRow} onPress={handleCopyFingerprint}>
            <Icon name="copy" size={18} color={colors.text.secondary} />
            <Text style={styles.actionText}>Copy Fingerprint</Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Danger section */}
        <Text style={styles.sectionTitle}>ACTIONS</Text>

        {/* Unfriend */}
        {confirmAction === 'unfriend' ? (
          <View style={styles.confirmBox}>
            <View style={styles.confirmHeader}>
              <Icon name="warning" size={14} color="#F87171" />
              <Text style={styles.confirmLabel}>Remove this contact?</Text>
            </View>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleUnfriend}
                disabled={actionState === 'loading'}
              >
                {actionState === 'loading' ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : actionState === 'success' ? (
                  <Icon name="checkmark" size={14} color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setConfirmAction(null); setActionState('idle'); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionRow} onPress={handleUnfriend}>
            <Icon name="person-remove" size={18} color="#FB923C" />
            <Text style={[styles.actionText, { color: '#FB923C' }]}>Unfriend</Text>
          </TouchableOpacity>
        )}

        {/* Block */}
        {confirmAction === 'block' ? (
          <View style={[styles.confirmBox, { marginTop: 8 }]}>
            <View style={styles.confirmHeader}>
              <Icon name="warning" size={14} color="#F87171" />
              <Text style={styles.confirmLabel}>Block this user?</Text>
            </View>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#DC2626' }]}
                onPress={handleBlock}
                disabled={actionState === 'loading'}
              >
                {actionState === 'loading' ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : actionState === 'success' ? (
                  <Icon name="checkmark" size={14} color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Block</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setConfirmAction(null); setActionState('idle'); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionRow} onPress={handleBlock}>
            <Icon name="shield" size={18} color="#F87171" />
            <Text style={[styles.actionText, { color: '#F87171' }]}>Block User</Text>
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Icon name="lock-closed" size={12} color={colors.text.muted} />
          <Text style={styles.footerText}>Blocking prevents all communication</Text>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.secondary,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    marginBottom: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
  },
  headerAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  trustText: {
    fontSize: 11,
    color: colors.text.muted,
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.primary,
    marginVertical: 8,
  },
  confirmBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    padding: 12,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  confirmLabel: {
    fontSize: 12,
    color: '#F87171',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#B91C1C',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: colors.background.tertiary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  footerText: {
    fontSize: 10,
    color: colors.text.muted,
  },
});

export default ProfileActionsMenu;
