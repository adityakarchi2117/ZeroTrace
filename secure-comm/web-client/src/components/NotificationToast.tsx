'use client';

/**
 * Premium Toast System (Instagram/WhatsApp style)
 * - Smooth slide / fade animations
 * - Smart dedup + queue
 * - Priority-aware styling
 * - Swipe-to-dismiss + hover pause
 * - Works with WebSocket events via window 'zerotrace-toast'
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  MessageSquare,
  PhoneCall,
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
  | 'info'
  | 'message';

export type ToastPriority = 'low' | 'medium' | 'high';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  username?: string;
  duration?: number; // ms
  action?: {
    label: string;
    onClick: () => void;
  };
  priority?: ToastPriority;
  sticky?: boolean;
  dedupKey?: string;
  pulseKey?: number;
}

interface NotificationToastProps {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
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
    case 'message':
      return <MessageSquare className="w-5 h-5" />;
    case 'system':
      return <Bell className="w-5 h-5" />;
    default:
      return <Bell className="w-5 h-5" />;
  }
};

// Color mapping with priority accent
const getColors = (type: NotificationType, priority: ToastPriority = 'low') => {
  const base = (() => {
    switch (type) {
      case 'friend_request':
        return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-300', iconBg: 'bg-blue-500/20' };
      case 'friend_request_accepted':
      case 'contact_verified':
      case 'success':
        return { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: 'text-green-300', iconBg: 'bg-green-500/20' };
      case 'friend_request_rejected':
      case 'contact_removed':
      case 'error':
        return { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-300', iconBg: 'bg-red-500/20' };
      case 'user_blocked':
      case 'key_changed':
        return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-300', iconBg: 'bg-amber-500/20' };
      case 'user_unblocked':
      case 'info':
        return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: 'text-cyan-300', iconBg: 'bg-cyan-500/20' };
      case 'message':
        return { bg: 'bg-slate-900/80', border: 'border-slate-700/60', icon: 'text-white', iconBg: 'bg-slate-700/60' };
      default:
        return { bg: 'bg-slate-900/80', border: 'border-slate-700/60', icon: 'text-white', iconBg: 'bg-slate-700/60' };
    }
  })();

  if (priority === 'high') {
    return { ...base, border: 'border-pink-400/70 shadow-lg shadow-pink-500/30', iconBg: 'bg-pink-500/20' };
  }
  if (priority === 'medium') {
    return { ...base, border: `${base.border} shadow-md shadow-black/25` };
  }
  return base;
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
function ToastItem({
  notification,
  onDismiss,
  onPause,
  onResume,
}: {
  notification: ToastNotification;
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const colors = getColors(notification.type, notification.priority);
  const [isHover, setIsHover] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const pulseKey = notification.pulseKey;

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    setDragging(true);
    setIsHover(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onPause(notification.id);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !cardRef.current) return;
    const delta = e.clientX - startX.current;
    cardRef.current.style.transform = `translateX(${delta}px)`;
    if (Math.abs(delta) > 80) {
      onDismiss(notification.id);
      navigator?.vibrate?.(10);
      setDragging(false);
    }
  };
  const handlePointerUp = () => {
    setDragging(false);
    setIsHover(false);
    if (cardRef.current) cardRef.current.style.transform = '';
    onResume(notification.id);
  };

  const highAccent = notification.priority === 'high';

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: -20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`relative w-80 rounded-2xl border ${colors.border} ${colors.bg} backdrop-blur-md overflow-hidden shadow-xl shadow-black/30 pointer-events-auto`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseEnter={() => {
        setIsHover(true);
        onPause(notification.id);
      }}
      onMouseLeave={() => {
        setIsHover(false);
        onResume(notification.id);
      }}
    >
      {/* Accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-400/70 via-cyan-400/70 to-purple-400/70" />

      <div className="p-4 pr-10 flex gap-3 items-start">
        <div className={`p-2 rounded-xl ${colors.iconBg} ${colors.icon}`}>
          {notification.type === 'system' && notification.priority === 'high' ? <PhoneCall className="w-5 h-5" /> : getIcon(notification.type)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-white text-sm leading-tight">{notification.title}</p>
            <button
              onClick={() => onDismiss(notification.id)}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {notification.username && <p className="text-xs text-slate-300/80">@{notification.username}</p>}

          {notification.message && <p className="text-sm text-slate-200 leading-snug">{notification.message}</p>}

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

      {/* Priority flair */}
      {highAccent && <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-pink-400 animate-pulse" />}

      {/* Pulse ring on dedup hit */}
      <motion.div
        key={pulseKey}
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0.35, scale: 0.96 }}
        animate={{ opacity: 0, scale: 1.08 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />

      {/* Progress bar */}
      <motion.div
        className="absolute bottom-0 left-0 h-1 bg-white/10"
        initial={{ width: '100%' }}
        animate={{ width: isHover || notification.sticky ? '100%' : '0%' }}
        transition={{ duration: (notification.duration || (notification.priority === 'high' ? 7_000 : 4_000)) / 1000, ease: 'linear' }}
      />
    </motion.div>
  );
}

// Main Toast Container rendered via portal
export default function NotificationToast({
  notifications,
  onDismiss,
  onPause,
  onResume,
  position = 'top-right',
  maxVisible = 3,
}: NotificationToastProps) {
  const positionClasses = getPositionClasses(position);
  const visibleNotifications = notifications.slice(0, maxVisible);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <div className={`fixed ${positionClasses} z-[100] flex flex-col gap-3 pointer-events-none`}>
      <AnimatePresence initial={false}>
        {visibleNotifications.map((notification) => (
          <ToastItem
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
            onPause={onPause || (() => {})}
            onResume={onResume || (() => {})}
          />
        ))}
      </AnimatePresence>
    </div>,
    portalTarget
  );
}

// Hook for managing notifications with dedup + queue
export function useNotificationToasts(maxVisible: number = 3) {
  const [visible, setVisible] = useState<ToastNotification[]>([]);
  const [queue, setQueue] = useState<ToastNotification[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remaining = useRef<Map<string, number>>(new Map());
  const started = useRef<Map<string, number>>(new Map());
  const queueOverflow = useRef<ToastNotification | null>(null);

  const scheduleTimer = useCallback((toast: ToastNotification) => {
    const duration =
      toast.sticky || toast.priority === 'high'
        ? toast.duration ?? 7000
        : toast.priority === 'medium'
        ? toast.duration ?? 5000
        : toast.duration ?? 4000;
    if (toast.sticky) return;

    const existing = timers.current.get(toast.id);
    if (existing) clearTimeout(existing);

    remaining.current.set(toast.id, duration);
    started.current.set(toast.id, Date.now());

    const t = setTimeout(() => {
      setVisible((prev) => prev.filter((n) => n.id !== toast.id));
      timers.current.delete(toast.id);
      remaining.current.delete(toast.id);
      started.current.delete(toast.id);
    }, duration);
    timers.current.set(toast.id, t);
  }, []);

  const pauseTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timers.current.delete(id);
    const start = started.current.get(id);
    const rem = remaining.current.get(id);
    if (start && rem !== undefined) {
      const elapsed = Date.now() - start;
      remaining.current.set(id, Math.max(rem - elapsed, 0));
    }
  }, []);

  const resumeTimer = useCallback((id: string) => {
    if (timers.current.get(id)) return;
    const rem = remaining.current.get(id) ?? 0;
    if (rem <= 0) {
      setVisible((prev) => prev.filter((n) => n.id !== id));
      return;
    }
    started.current.set(id, Date.now());
    const t = setTimeout(() => {
      setVisible((prev) => prev.filter((n) => n.id !== id));
      timers.current.delete(id);
      remaining.current.delete(id);
      started.current.delete(id);
    }, rem);
    timers.current.set(id, t);
  }, []);

  const addNotification = useCallback(
    (notification: Omit<ToastNotification, 'id'>) => {
      const dedupKey =
        notification.dedupKey ||
        `${notification.type}-${notification.username || ''}-${notification.title}-${notification.message || ''}`;
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: ToastNotification = {
        ...notification,
        id,
        dedupKey,
        pulseKey: Math.random(),
      };

      setVisible((prevVisible) => {
        // Dedup in visible list
        const existingIndex = prevVisible.findIndex((t) => t.dedupKey === dedupKey);
        if (existingIndex >= 0) {
          const updated = [...prevVisible];
          updated[existingIndex] = { ...newToast, id: prevVisible[existingIndex].id, pulseKey: Math.random() };
          scheduleTimer(updated[existingIndex]);
          return updated;
        }

        // Space available
        if (prevVisible.length < maxVisible) {
          scheduleTimer(newToast);
          return [newToast, ...prevVisible].slice(0, maxVisible);
        }

        // Queue overflow — schedule outside setState
        queueOverflow.current = newToast;
        return prevVisible;
      });

      return id;
    },
    [maxVisible, scheduleTimer]
  );

  const dismissNotification = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    remaining.current.delete(id);
    started.current.delete(id);
    setVisible((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    remaining.current.clear();
    started.current.clear();
    setVisible([]);
    setQueue([]);
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, []);

  // Flush queue overflow after render (avoids setState inside setState)
  useEffect(() => {
    const pending = queueOverflow.current;
    if (!pending) return;
    queueOverflow.current = null;
    setQueue((prevQueue) => {
      const qIndex = prevQueue.findIndex((t) => t.dedupKey === pending.dedupKey);
      if (qIndex >= 0) {
        const clone = [...prevQueue];
        clone[qIndex] = { ...pending, id: prevQueue[qIndex].id, pulseKey: Math.random() };
        return clone;
      }
      return [...prevQueue, pending];
    });
  });

  // Promote from queue when there is room
  useEffect(() => {
    if (visible.length < maxVisible && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setVisible((prev) => {
        scheduleTimer(next);
        return [next, ...prev];
      });
    }
  }, [visible.length, queue, maxVisible, scheduleTimer]);

  // Global bridge for WebSocket/imperative triggers
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<ToastNotification>;
      if (!detail) return;
      addNotification({
        type: (detail.type as NotificationType) || 'info',
        title: detail.title || 'Notification',
        message: detail.message,
        username: detail.username,
        priority: detail.priority || 'low',
        sticky: detail.sticky,
        action: detail.action,
        duration: detail.duration,
      });
    };
    window.addEventListener('zerotrace-toast', handler as EventListener);
    return () => window.removeEventListener('zerotrace-toast', handler as EventListener);
  }, [addNotification]);

  // Helper methods for common notification types
  const showFriendRequest = useCallback(
    (username: string, action?: ToastNotification['action']) =>
      addNotification({
        type: 'friend_request',
        title: 'New Friend Request',
        message: `${username} wants to connect`,
        username,
        action,
        priority: 'medium',
      }),
    [addNotification]
  );

  const showFriendAccepted = useCallback(
    (username: string) =>
      addNotification({
        type: 'friend_request_accepted',
        title: 'Friend Request Accepted',
        message: `You are now friends with ${username}`,
        username,
        priority: 'low',
      }),
    [addNotification]
  );

  const showFriendRejected = useCallback(
    (username: string) =>
      addNotification({
        type: 'friend_request_rejected',
        title: 'Friend Request Rejected',
        message: `${username} declined your request`,
        username,
        priority: 'low',
      }),
    [addNotification]
  );

  const showContactRemoved = useCallback(
    (username: string) =>
      addNotification({
        type: 'contact_removed',
        title: 'Contact Removed',
        message: `${username} removed you`,
        username,
        priority: 'medium',
      }),
    [addNotification]
  );

  const showKeyChanged = useCallback(
    (username: string) =>
      addNotification({
        type: 'key_changed',
        title: 'Security Alert',
        message: `${username}'s security key changed. Please verify.`,
        username,
        duration: 10000,
        priority: 'high',
        sticky: true,
      }),
    [addNotification]
  );

  const showSuccess = useCallback(
    (title: string, message?: string) =>
      addNotification({
        type: 'success',
        title,
        message,
        priority: 'low',
      }),
    [addNotification]
  );

  const showError = useCallback(
    (title: string, message?: string) =>
      addNotification({
        type: 'error',
        title,
        message,
        duration: 7000,
        priority: 'medium',
      }),
    [addNotification]
  );

  const showMessage = useCallback(
    (username: string, message: string, onClick?: () => void) =>
      addNotification({
        type: 'message',
        title: `New message from ${username}`,
        message: message.length > 50 ? message.substring(0, 50) + '...' : message,
        username,
        duration: 4000,
        priority: 'low',
        action: onClick
          ? {
              label: 'View',
              onClick,
            }
          : undefined,
      }),
    [addNotification]
  );

  const showCall = useCallback(
    (username: string, onClick?: () => void) =>
      addNotification({
        type: 'system',
        title: 'Incoming Call',
        message: `${username} is calling…`,
        username,
        priority: 'high',
        sticky: true,
        duration: 7000,
        action: onClick
          ? {
              label: 'Answer',
              onClick,
            }
          : undefined,
      }),
    [addNotification]
  );

  return {
    notifications: visible,
    addNotification,
    dismissNotification,
    clearAll,
    pauseTimer,
    resumeTimer,
    showFriendRequest,
    showFriendAccepted,
    showFriendRejected,
    showContactRemoved,
    showKeyChanged,
    showSuccess,
    showError,
    showMessage,
    showCall,
  };
}
