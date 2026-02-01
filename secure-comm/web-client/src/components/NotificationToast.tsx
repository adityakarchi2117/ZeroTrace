'use client';

/**
 * Notification Toast System
 * Real-time toast notifications for friend system events
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  UserCheck,
  UserX,
  UserMinus,
  Shield,
  ShieldOff,
  Key,
  Bell,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';

// Notification types
export type NotificationType =
  | 'friend_request'
  | 'friend_request_accepted'
  | 'friend_request_rejected'
  | 'contact_removed'
  | 'user_blocked'
  | 'user_unblocked'
  | 'key_changed'
  | 'contact_verified'
  | 'system'
  | 'success'
  | 'error'
  | 'info';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  username?: string;
  duration?: number; // ms, default 5000
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationToastProps {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  maxVisible?: number;
}

// Icon mapping
const getIcon = (type: NotificationType) => {
  switch (type) {
    case 'friend_request':
      return <UserPlus className="w-5 h-5" />;
    case 'friend_request_accepted':
      return <UserCheck className="w-5 h-5" />;
    case 'friend_request_rejected':
      return <UserX className="w-5 h-5" />;
    case 'contact_removed':
      return <UserMinus className="w-5 h-5" />;
    case 'user_blocked':
      return <Shield className="w-5 h-5" />;
    case 'user_unblocked':
      return <ShieldOff className="w-5 h-5" />;
    case 'key_changed':
      return <Key className="w-5 h-5" />;
    case 'contact_verified':
      return <CheckCircle className="w-5 h-5" />;
    case 'success':
      return <CheckCircle className="w-5 h-5" />;
    case 'error':
      return <AlertTriangle className="w-5 h-5" />;
    case 'info':
      return <Info className="w-5 h-5" />;
    default:
      return <Bell className="w-5 h-5" />;
  }
};

// Color mapping
const getColors = (type: NotificationType) => {
  switch (type) {
    case 'friend_request':
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon: 'text-blue-400',
        iconBg: 'bg-blue-500/20',
      };
    case 'friend_request_accepted':
    case 'contact_verified':
    case 'success':
      return {
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        icon: 'text-green-400',
        iconBg: 'bg-green-500/20',
      };
    case 'friend_request_rejected':
    case 'contact_removed':
    case 'error':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        icon: 'text-red-400',
        iconBg: 'bg-red-500/20',
      };
    case 'user_blocked':
      return {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        icon: 'text-orange-400',
        iconBg: 'bg-orange-500/20',
      };
    case 'user_unblocked':
      return {
        bg: 'bg-teal-500/10',
        border: 'border-teal-500/30',
        icon: 'text-teal-400',
        iconBg: 'bg-teal-500/20',
      };
    case 'key_changed':
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        icon: 'text-yellow-400',
        iconBg: 'bg-yellow-500/20',
      };
    default:
      return {
        bg: 'bg-gray-500/10',
        border: 'border-gray-500/30',
        icon: 'text-gray-400',
        iconBg: 'bg-gray-500/20',
      };
  }
};

// Position mapping
const getPositionClasses = (position: string) => {
  switch (position) {
    case 'top-left':
      return 'top-4 left-4';
    case 'bottom-right':
      return 'bottom-4 right-4';
    case 'bottom-left':
      return 'bottom-4 left-4';
    default:
      return 'top-4 right-4';
  }
};

// Single Toast Component
function Toast({
  notification,
  onDismiss,
}: {
  notification: ToastNotification;
  onDismiss: () => void;
}) {
  const colors = getColors(notification.type);
  const [progress, setProgress] = useState(100);
  const duration = notification.duration || 5000;

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev - 100 / (duration / 100);
        if (newProgress <= 0) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      className={`relative w-80 rounded-xl border shadow-xl backdrop-blur-md overflow-hidden ${colors.bg} ${colors.border}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`p-2 rounded-lg ${colors.iconBg} ${colors.icon}`}>
            {getIcon(notification.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="font-medium text-white text-sm">{notification.title}</p>
              <button
                onClick={onDismiss}
                className="p-1 hover:bg-white/10 rounded transition-colors ml-2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {notification.message && (
              <p className="text-gray-400 text-xs mt-1 line-clamp-2">
                {notification.message}
              </p>
            )}

            {notification.username && (
              <p className="text-gray-300 text-xs mt-1 font-medium">
                @{notification.username}
              </p>
            )}

            {notification.action && (
              <button
                onClick={notification.action.onClick}
                className={`mt-2 px-3 py-1 text-xs font-medium rounded-lg ${colors.iconBg} ${colors.icon} hover:opacity-80 transition-opacity`}
              >
                {notification.action.label}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-white/10">
        <motion.div
          className={`h-full ${colors.icon.replace('text-', 'bg-')}`}
          initial={{ width: '100%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </motion.div>
  );
}

// Main Toast Container
export default function NotificationToast({
  notifications,
  onDismiss,
  position = 'top-right',
  maxVisible = 5,
}: NotificationToastProps) {
  const positionClasses = getPositionClasses(position);
  const visibleNotifications = notifications.slice(0, maxVisible);

  return (
    <div className={`fixed ${positionClasses} z-[100] flex flex-col gap-3`}>
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notification) => (
          <Toast
            key={notification.id}
            notification={notification}
            onDismiss={() => onDismiss(notification.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Hook for managing notifications
export function useNotificationToasts() {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const addNotification = useCallback((notification: Omit<ToastNotification, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setNotifications((prev) => [...prev, { ...notification, id }]);
    return id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Helper methods for common notification types
  const showFriendRequest = useCallback(
    (username: string, action?: ToastNotification['action']) => {
      return addNotification({
        type: 'friend_request',
        title: 'New Friend Request',
        message: `${username} wants to be your friend`,
        username,
        action,
      });
    },
    [addNotification]
  );

  const showFriendAccepted = useCallback(
    (username: string) => {
      return addNotification({
        type: 'friend_request_accepted',
        title: 'Friend Request Accepted',
        message: `You are now friends with ${username}`,
        username,
      });
    },
    [addNotification]
  );

  const showFriendRejected = useCallback(
    (username: string) => {
      return addNotification({
        type: 'friend_request_rejected',
        title: 'Friend Request Rejected',
        message: `${username} declined your friend request`,
        username,
      });
    },
    [addNotification]
  );

  const showContactRemoved = useCallback(
    (username: string) => {
      return addNotification({
        type: 'contact_removed',
        title: 'Contact Removed',
        message: `${username} has removed you from their contacts`,
        username,
      });
    },
    [addNotification]
  );

  const showKeyChanged = useCallback(
    (username: string) => {
      return addNotification({
        type: 'key_changed',
        title: 'Security Alert',
        message: `${username}'s security key has changed. Please verify.`,
        username,
        duration: 10000, // Longer for security alerts
      });
    },
    [addNotification]
  );

  const showSuccess = useCallback(
    (title: string, message?: string) => {
      return addNotification({
        type: 'success',
        title,
        message,
      });
    },
    [addNotification]
  );

  const showError = useCallback(
    (title: string, message?: string) => {
      return addNotification({
        type: 'error',
        title,
        message,
        duration: 7000, // Longer for errors
      });
    },
    [addNotification]
  );

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
    showFriendRequest,
    showFriendAccepted,
    showFriendRejected,
    showContactRemoved,
    showKeyChanged,
    showSuccess,
    showError,
  };
}
