/**
 * NotificationToast — Rich in-app toast notification system.
 * Mirrors web's NotificationToast.tsx with type-specific icons/colors,
 * swipe-to-dismiss, priority indicators, progress bar, and queue management.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  Vibration,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOAST_WIDTH = SCREEN_WIDTH - 32;
const SWIPE_THRESHOLD = 80;

// ==================== Types ====================

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'friend_rejected'
  | 'contact_removed'
  | 'key_changed'
  | 'message'
  | 'call'
  | 'error'
  | 'success'
  | 'warning'
  | 'info'
  | 'security'
  | 'system';

export type ToastPriority = 'low' | 'medium' | 'high';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  username?: string;
  duration?: number;
  priority?: ToastPriority;
  action?: { label: string; onPress: () => void };
  sticky?: boolean;
}

// ==================== Config ====================

const typeConfig: Record<NotificationType, { icon: string; color: string; bgTint: string }> = {
  friend_request: { icon: 'person-add', color: '#3B82F6', bgTint: 'rgba(59,130,246,0.1)' },
  friend_accepted: { icon: 'people', color: '#10B981', bgTint: 'rgba(16,185,129,0.1)' },
  friend_rejected: { icon: 'person-remove', color: '#EF4444', bgTint: 'rgba(239,68,68,0.1)' },
  contact_removed: { icon: 'person-remove', color: '#64748B', bgTint: 'rgba(100,116,139,0.1)' },
  key_changed: { icon: 'key', color: '#F59E0B', bgTint: 'rgba(245,158,11,0.1)' },
  message: { icon: 'chatbubble', color: '#06B6D4', bgTint: 'rgba(6,182,212,0.1)' },
  call: { icon: 'call', color: '#10B981', bgTint: 'rgba(16,185,129,0.1)' },
  error: { icon: 'alert-circle', color: '#EF4444', bgTint: 'rgba(239,68,68,0.1)' },
  success: { icon: 'checkmark-circle', color: '#10B981', bgTint: 'rgba(16,185,129,0.1)' },
  warning: { icon: 'warning', color: '#F59E0B', bgTint: 'rgba(245,158,11,0.1)' },
  info: { icon: 'information-circle', color: '#3B82F6', bgTint: 'rgba(59,130,246,0.1)' },
  security: { icon: 'shield', color: '#8B5CF6', bgTint: 'rgba(139,92,246,0.1)' },
  system: { icon: 'settings', color: '#64748B', bgTint: 'rgba(100,116,139,0.1)' },
};

// ==================== Toast Item ====================

const ToastItem: React.FC<{
  notification: ToastNotification;
  onDismiss: (id: string) => void;
  index: number;
}> = ({ notification, onDismiss, index }) => {
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const [isPaused, setIsPaused] = useState(false);

  const config = typeConfig[notification.type] || typeConfig.info;
  const duration = notification.duration || 4000;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss progress
    if (!notification.sticky) {
      Animated.timing(progress, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start(() => {
        dismissToast();
      });
    }
  }, []);

  const dismissToast = () => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss(notification.id);
    });
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
    onPanResponderGrant: () => setIsPaused(true),
    onPanResponderMove: (_, gs) => {
      if (gs.dx > 0) panX.setValue(gs.dx);
    },
    onPanResponderRelease: (_, gs) => {
      setIsPaused(false);
      if (gs.dx > SWIPE_THRESHOLD) {
        Vibration.vibrate(10);
        dismissToast();
      } else {
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  const isHigh = notification.priority === 'high';

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [
            { translateX: Animated.add(translateX, panX) },
          ],
          opacity,
          marginBottom: 8,
        },
        isHigh && styles.toastHighPriority,
      ]}
      {...panResponder.panHandlers}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: config.color }]} />

      <View style={styles.toastBody}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: config.bgTint }]}>
          <Icon name={config.icon} size={20} color={config.color} />
        </View>

        {/* Content */}
        <View style={styles.toastContent}>
          <View style={styles.toastHeader}>
            <Text style={styles.toastTitle} numberOfLines={1}>
              {notification.title}
            </Text>
            {isHigh && <View style={styles.priorityDot} />}
          </View>
          {notification.username && (
            <Text style={styles.toastUsername}>@{notification.username}</Text>
          )}
          {notification.message && (
            <Text style={styles.toastMessage} numberOfLines={2}>
              {notification.message}
            </Text>
          )}
          {notification.action && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: config.bgTint }]}
              onPress={() => {
                notification.action!.onPress();
                dismissToast();
              }}
            >
              <Text style={[styles.actionText, { color: config.color }]}>
                {notification.action.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Close */}
        <TouchableOpacity onPress={dismissToast} style={styles.closeButton}>
          <Icon name="close" size={16} color={colors.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      {!notification.sticky && (
        <Animated.View
          style={[
            styles.progressBar,
            {
              backgroundColor: config.color,
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      )}
    </Animated.View>
  );
};

// ==================== Toast Manager Hook ====================

export function useNotificationToasts(maxVisible = 4) {
  const [visible, setVisible] = useState<ToastNotification[]>([]);
  const queueRef = useRef<ToastNotification[]>([]);

  const show = useCallback((notification: Omit<ToastNotification, 'id'> & { id?: string }) => {
    const toast: ToastNotification = {
      ...notification,
      id: notification.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };

    setVisible((prev) => {
      if (prev.length >= maxVisible) {
        queueRef.current.push(toast);
        return prev;
      }
      return [toast, ...prev];
    });
  }, [maxVisible]);

  const dismiss = useCallback((id: string) => {
    setVisible((prev) => {
      const next = prev.filter((t) => t.id !== id);
      // Promote from queue
      if (queueRef.current.length > 0 && next.length < maxVisible) {
        const promoted = queueRef.current.shift()!;
        return [promoted, ...next];
      }
      return next;
    });
  }, [maxVisible]);

  // Helper methods matching web API
  const showFriendRequest = useCallback((username: string) => {
    show({ type: 'friend_request', title: 'Friend Request', message: `${username} wants to connect`, username });
  }, [show]);

  const showFriendAccepted = useCallback((username: string) => {
    show({ type: 'friend_accepted', title: 'Friend Added', message: `${username} accepted your request`, username });
  }, [show]);

  const showKeyChanged = useCallback((username: string) => {
    show({ type: 'key_changed', title: 'Key Changed', message: `${username}'s encryption key has changed`, username, priority: 'high' });
  }, [show]);

  const showSuccess = useCallback((title: string, message?: string) => {
    show({ type: 'success', title, message });
  }, [show]);

  const showError = useCallback((title: string, message?: string) => {
    show({ type: 'error', title, message, priority: 'high' });
  }, [show]);

  const showMessage = useCallback((username: string, preview: string) => {
    show({ type: 'message', title: 'New Message', message: preview, username });
  }, [show]);

  const showCall = useCallback((username: string) => {
    show({ type: 'call', title: 'Incoming Call', message: `${username} is calling`, username, priority: 'high', sticky: true });
  }, [show]);

  return {
    visible,
    show,
    dismiss,
    showFriendRequest,
    showFriendAccepted,
    showKeyChanged,
    showSuccess,
    showError,
    showMessage,
    showCall,
  };
}

// ==================== Toast Container Component ====================

interface NotificationToastContainerProps {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
}

const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {notifications.map((notification, index) => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
          index={index}
        />
      ))}
    </View>
  );
};

// ==================== Global Toast API ====================

export const TOAST_EVENT = 'zerotrace-toast';

export function emitToast(notification: Omit<ToastNotification, 'id'>) {
  DeviceEventEmitter.emit(TOAST_EVENT, notification);
}

// ==================== Styles ====================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    right: 16,
    left: 16,
    zIndex: 99999,
    elevation: 99999,
  },
  toastContainer: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  toastHighPriority: {
    borderColor: 'rgba(236, 72, 153, 0.4)',
    shadowColor: '#EC4899',
    shadowOpacity: 0.3,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  toastBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingLeft: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toastContent: {
    flex: 1,
  },
  toastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EC4899',
  },
  toastUsername: {
    fontSize: 12,
    color: colors.primary.main,
    marginTop: 2,
  },
  toastMessage: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  actionButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
    marginLeft: 4,
  },
  progressBar: {
    height: 2,
  },
});

export default NotificationToastContainer;
