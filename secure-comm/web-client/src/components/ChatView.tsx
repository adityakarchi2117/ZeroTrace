'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  decryptMessage,
  EncryptedMessage,
  generateFingerprint
} from '@/lib/crypto';
import { useAppearance } from '@/lib/useAppearance';
import { wsManager } from '@/lib/websocket';
import { webrtcService, CallState } from '@/lib/webrtc';
import { useWebRTC } from '@/lib/useWebRTC';
import { EncryptionLock } from '@/lib/motion';
import { CallView } from './CallView';
import {
  Lock, Send, Smile, Paperclip, Phone, Video,
  MoreVertical, Shield, Check, CheckCheck, Clock,
  ArrowLeft, Info, X, PhoneOff, Mic, MicOff,
  VideoOff, Image, File, Loader2, Download, FileText,
  AlertCircle, Monitor, Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

function toLocalTime(utcDateString: string): Date {
  if (!utcDateString) return new Date();
  const hasTimezone = utcDateString.endsWith('Z') ||
    /[+-]\d{2}:\d{2}$/.test(utcDateString) ||
    /[+-]\d{4}$/.test(utcDateString);
  if (!hasTimezone) {
    return new Date(utcDateString + 'Z');
  }
  return new Date(utcDateString);
}

// Animated message bubble component
function AnimatedMessageBubble({
  children,
  isSent,
  isNew = false,
  index = 0
}: {
  children: React.ReactNode;
  isSent: boolean;
  isNew?: boolean;
  index?: number;
}) {
  return (
    <motion.div
      initial={isSent ? {
        scale: 0.8,
        opacity: 0,
        y: 20,
        rotateY: 5,
      } : {
        scale: 0.9,
        opacity: 0,
        y: 20,
        z: -30,
      }}
      animate={{
        scale: 1,
        opacity: 1,
        y: 0,
        rotateY: 0,
        z: 0,
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: index * 0.03,
      }}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
    >
      {isSent && isNew && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          initial={{ boxShadow: '0 0 0 0 rgba(var(--accent-rgb), 0.4)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(var(--accent-rgb), 0.4)',
              '0 0 20px 5px rgba(var(--accent-rgb), 0.2)',
              '0 0 0 0 rgba(var(--accent-rgb), 0)',
            ],
          }}
          transition={{ duration: 1.5 }}
        />
      )}
      {children}
    </motion.div>
  );
}

export default function ChatView() {
  const {
    user, currentConversation, messages, contacts, conversations,
    privateKey, sendMessage, onlineUsers, typingUsers,
    setCurrentConversation, loadCallHistory, callHistory,
    deleteMessageForMe, deleteMessageForEveryone, clearChat, deleteConversationForEveryone
  } = useStore();

  const { getAccentGradient, getAccentColors, getDensityClasses, getFontClasses, settings } = useAppearance();
  const accentGradient = getAccentGradient();
  const accentColors = getAccentColors();
  const densityClasses = getDensityClasses();
  const fontClasses = getFontClasses();

  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // Use the new WebRTC hook
  const {
    callState,
    isMuted,
    isVideoOff,
    callDuration,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    error: callError,
    clearError,
  } = useWebRTC();
  
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCallChat, setShowCallChat] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [contactPublicKey, setContactPublicKey] = useState<string | null>(null);
  const [newMessageIds, setNewMessageIds] = useState<Set<number>>(new Set());

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    messageId: number;
    isMine: boolean;
  } | null>(null);

  const [showChatMenu, setShowChatMenu] = useState(false);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    visible: boolean;
    type: 'message' | 'chat' | 'conversation';
    messageId?: number;
    deleteForEveryone?: boolean;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contact = contacts.find(c => c.contact_username === currentConversation);
  const conversation = conversations.find(c => c.username === currentConversation);

  const partnerId = contact?.contact_id || conversation?.user_id;
  const partnerKey = contact?.public_key || conversation?.public_key;

  const isOnline = partnerId ? onlineUsers.has(partnerId) : false;
  const isTyping = currentConversation ? typingUsers.get(currentConversation) : false;

  const conversationMessages = currentConversation
    ? messages.get(currentConversation) || []
    : [];

  const relevantCalls = (callHistory || []).filter(call =>
    call.caller_username === currentConversation || call.receiver_username === currentConversation
  );

  const historyItems = [
    ...conversationMessages.map(m => ({ type: 'message' as const, data: m, date: toLocalTime(m.created_at) })),
    ...relevantCalls.map(c => ({ type: 'call' as const, data: c, date: toLocalTime(c.start_time) }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  useEffect(() => {
    loadCallHistory();
  }, [loadCallHistory]);

  useEffect(() => {
    async function fetchPublicKey() {
      if (currentConversation && !partnerKey) {
        try {
          const keyData = await api.getPublicKey(currentConversation);
          if (keyData?.public_key) {
            setContactPublicKey(keyData.public_key);
          }
        } catch (error) {
          console.error('Failed to fetch public key:', error);
        }
      } else if (partnerKey) {
        setContactPublicKey(partnerKey);
      }
    }
    fetchPublicKey();
  }, [currentConversation, partnerKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages]);

  useEffect(() => {
    if (currentConversation && newMessage) {
      wsManager.sendTypingIndicator(currentConversation, true);
      const timeout = setTimeout(() => {
        wsManager.sendTypingIndicator(currentConversation, false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [newMessage, currentConversation]);

  // Reset screen sharing when call ends
  useEffect(() => {
    if (!callState || callState.status === 'ended' || callState.status === 'failed') {
      setIsScreenSharing(false);
    }
  }, [callState?.status]);
  
  // Show call errors
  useEffect(() => {
    if (callError) {
      console.error('Call error:', callError);
      // Could show a toast here
      clearError();
    }
  }, [callError, clearError]);

  useEffect(() => {
    const handleClickOutside = () => setShowChatMenu(false);
    if (showChatMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showChatMenu]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleScreenShare = async () => {
    if (isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        webrtcService.replaceVideoTrack(stream.getVideoTracks()[0]);
        setIsScreenSharing(false);
      } catch (error) {
        console.error('Error stopping screen share:', error);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        webrtcService.replaceVideoTrack(screenStream.getVideoTracks()[0]);
        setIsScreenSharing(true);

        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          navigator.mediaDevices.getUserMedia({ video: true }).then(camStream => {
            webrtcService.replaceVideoTrack(camStream.getVideoTracks()[0]);
          });
        };
      } catch (error) {
        console.error('Error starting screen share:', error);
      }
    }
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !currentConversation || isSending) return;

    setIsSending(true);
    try {
      // Track this as a new message for animation
      const tempId = Date.now();
      setNewMessageIds(prev => new Set(prev).add(tempId));

      await sendMessage(currentConversation, newMessage);

      setNewMessage('');
      inputRef.current?.focus();

      // Clear the new message indicator after animation
      setTimeout(() => {
        setNewMessageIds(prev => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
      }, 1000);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!currentConversation) return;
    const success = await startCall(currentConversation, type);
    if (!success) {
      console.error('Failed to start call');
    }
  };

  const handleAnswerCall = async () => {
    try {
      await answerCall();
    } catch (error) {
      console.error('Error answering call:', error);
    }
  };

  const handleRejectCall = () => {
    rejectCall();
  };

  const handleEndCall = () => {
    endCall();
  };

  const handleToggleMute = () => {
    toggleMute();
  };

  const handleToggleVideo = () => {
    toggleVideo();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentConversation) return;

    const file = files[0];
    setShowAttachMenu(false);
    setIsSending(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileMetadata = {
          name: file.name,
          type: file.type,
          size: file.size,
        };

        await sendMessage(
          currentConversation,
          base64,
          file.type.startsWith('image/') ? 'image' : 'file',
          fileMetadata
        );
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to send file:', error);
    } finally {
      setIsSending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const decryptContent = useCallback((msg: any): string => {
    if (msg._decryptedContent) {
      return msg._decryptedContent;
    }

    if (!privateKey) return '[Encrypted]';

    try {
      const encrypted = JSON.parse(msg.encrypted_content) as EncryptedMessage;
      let fallbackPublicKey: string | undefined;

      if (msg.sender_username === user?.username) {
        fallbackPublicKey =
          contact?.public_key || conversation?.public_key || contactPublicKey || undefined;
        if (!encrypted.senderPublicKey && !fallbackPublicKey) {
          return '[Sent message]';
        }
      } else {
        fallbackPublicKey =
          contact?.public_key || conversation?.public_key || contactPublicKey || undefined;
        if (!encrypted.senderPublicKey && !fallbackPublicKey) {
          return '[Key not available]';
        }
      }

      const decrypted = decryptMessage(encrypted, fallbackPublicKey || '', privateKey);

      if (!decrypted) {
        if (msg.sender_username === user?.username) {
          return '[Sent message]';
        }
        return '[Decryption failed]';
      }
      return decrypted;
    } catch (err) {
      console.error('Decryption error:', err);
      return '[Encrypted message]';
    }
  }, [privateKey, user, contact, conversation, contactPublicKey]);

  const handleDownload = (content: string, filename: string = 'download') => {
    try {
      const link = document.createElement('a');
      link.href = content;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const getMessageStatus = (msg: any) => {
    switch (msg.status) {
      case 'sent':
        return <Check className="w-4 h-4 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-gray-400" />;
      case 'read':
        return <CheckCheck className="w-4 h-4" style={{ color: accentColors.primary }} />;
      case 'sending':
        return <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const renderMessageContent = (msg: any) => {
    if (msg.message_type === 'deleted') {
      return (
        <p className="italic text-gray-400/70">
          <Trash2 className="w-3 h-3 inline mr-1" />
          This message was deleted
        </p>
      );
    }

    const content = decryptContent(msg);

    if (msg.message_type === 'image' && content.startsWith('data:image')) {
      return (
        <div className="relative group">
          <img
            src={content}
            alt="Shared image"
            className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setPreviewImage(content)}
          />
          <button
            onClick={() => handleDownload(content, `image_${msg.id}.png`)}
            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="Download Image"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      );
    }

    if (msg.message_type === 'file' || (msg.message_type === 'image' && !content.startsWith('data:image'))) {
      return (
        <div className="flex flex-col gap-2 p-1">
          <div className="flex items-center gap-3 bg-cipher-dark/40 p-3 rounded-xl border border-white/5">
            <div className="w-10 h-10 bg-cipher-primary/20 rounded-lg flex items-center justify-center text-cipher-primary">
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">
                {msg.file_metadata?.name || `document_${msg.id}`}
              </p>
              <p className="text-xs text-gray-500 uppercase">
                {msg.file_metadata?.type?.split('/')[1] || 'FILE'}
              </p>
            </div>
            <button
              onClick={() => handleDownload(content, msg.file_metadata?.name || 'document')}
              className="p-2 hover:bg-white/10 rounded-full text-cipher-primary transition-colors"
              title="Download File"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
      );
    }

    return <p className="break-words">{content}</p>;
  };

  const handleMessageContextMenu = (e: React.MouseEvent, messageId: number, isMine: boolean) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      messageId,
      isMine,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleDeleteMessage = async (forEveryone: boolean) => {
    if (!contextMenu || !currentConversation) return;

    if (forEveryone) {
      setDeleteConfirmation({
        visible: true,
        type: 'message',
        messageId: contextMenu.messageId,
        deleteForEveryone: true,
      });
    } else {
      await deleteMessageForMe(contextMenu.messageId, currentConversation);
    }
    setContextMenu(null);
  };

  const handleClearChat = () => {
    setDeleteConfirmation({
      visible: true,
      type: 'chat',
    });
    setShowChatMenu(false);
  };

  const handleDeleteConversation = () => {
    setDeleteConfirmation({
      visible: true,
      type: 'conversation',
    });
    setShowChatMenu(false);
  };

  const confirmDeletion = async () => {
    if (!deleteConfirmation || !currentConversation) return;

    try {
      if (deleteConfirmation.type === 'message' && deleteConfirmation.messageId) {
        if (deleteConfirmation.deleteForEveryone) {
          await deleteMessageForEveryone(deleteConfirmation.messageId, currentConversation);
        } else {
          await deleteMessageForMe(deleteConfirmation.messageId, currentConversation);
        }
      } else if (deleteConfirmation.type === 'chat') {
        await clearChat(currentConversation);
      } else if (deleteConfirmation.type === 'conversation') {
        await deleteConversationForEveryone(currentConversation);
      }
    } catch (error) {
      console.error('Deletion failed:', error);
    }

    setDeleteConfirmation(null);
  };

  if (!currentConversation) return null;

  // Show call error if call failed
  if (callState && callState.status === 'failed') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <motion.div
          className="text-center max-w-md p-6"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Call Failed</h2>
          <p className="text-gray-400 mb-6">
            {callState.errorMessage || 'Unable to connect the call. Please try again.'}
          </p>
          <button
            onClick={() => {
              endCall();
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
          >
            Dismiss
          </button>
        </motion.div>
      </div>
    );
  }

  // Show call rejected UI
  if (callState && callState.status === 'rejected') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <motion.div
          className="text-center max-w-md p-6"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <PhoneOff className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Call Declined</h2>
          <p className="text-gray-400 mb-6">
            {callState.remoteUsername} declined your call.
          </p>
          <button
            onClick={() => {
              endCall();
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
          >
            Close
          </button>
        </motion.div>
      </div>
    );
  }

  // Render fullscreen call UI
  if (callState && ['calling', 'ringing', 'connecting', 'connected'].includes(callState.status)) {
    return (
      <CallView
        callState={callState}
        callDuration={callDuration}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isFullscreen={isFullscreen}
        localStream={localStream}
        remoteStream={remoteStream}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleScreenShare}
        onToggleFullscreen={handleFullscreen}
        onEndCall={handleEndCall}
        onRejectCall={handleRejectCall}
        onAnswerCall={handleAnswerCall}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat Header */}
      <motion.div
        className="h-16 px-4 border-b border-gray-800 flex items-center justify-between bg-cipher-dark/50"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={() => setCurrentConversation(null)}
            className="lg:hidden p-2 -ml-2 hover:bg-gray-700 rounded-lg text-gray-400"
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>

          <div className="relative">
            <motion.div
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
              style={{ background: accentGradient }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="text-white font-medium">
                {currentConversation.charAt(0).toUpperCase()}
              </span>
            </motion.div>
            {isOnline && (
              <motion.div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-cipher-dark"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>

          <div>
            <h2 className="font-medium text-white">{currentConversation}</h2>
            <div className="flex items-center gap-2 text-xs">
              {isTyping ? (
                <span className="text-cipher-primary">typing...</span>
              ) : isOnline ? (
                <span className="text-green-500">Online</span>
              ) : (
                <span className="text-gray-500">Offline</span>
              )}
              <span className="text-gray-600">•</span>
              <div className="flex items-center gap-1 text-gray-500">
                <EncryptionLock size="sm" isEncrypting={false} />
                <span>Encrypted</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => handleStartCall('audio')}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Voice Call"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Phone className="w-5 h-5" />
          </motion.button>
          <motion.button
            onClick={() => handleStartCall('video')}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Video Call"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Video className="w-5 h-5" />
          </motion.button>
          <motion.button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1, rotate: 15 }}
            whileTap={{ scale: 0.9 }}
          >
            <Info className="w-5 h-5" />
          </motion.button>

          <div className="relative">
            <motion.button
              onClick={() => setShowChatMenu(!showChatMenu)}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Chat Options"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <MoreVertical className="w-5 h-5" />
            </motion.button>

            {showChatMenu && (
              <motion.div
                className="absolute right-0 top-full mt-1 bg-cipher-dark border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
              >
                <button
                  onClick={handleClearChat}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear chat</span>
                </button>
                <button
                  onClick={handleDeleteConversation}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete for everyone</span>
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Security Banner */}
      <motion.div
        className="px-4 py-2 bg-cipher-primary/10 border-b border-cipher-primary/20 flex items-center justify-center gap-2 text-xs text-cipher-primary"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <EncryptionLock size="sm" isEncrypting={false} />
        <span>Messages are end-to-end encrypted. No one outside this chat can read them.</span>
      </motion.div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 ${densityClasses.messageGap}`}>
        {historyItems.length === 0 ? (
          <motion.div
            className="h-full flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-center">
              <motion.div
                className="w-16 h-16 bg-cipher-primary/20 rounded-full flex items-center justify-center mx-auto mb-4"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Shield className="w-8 h-8 text-cipher-primary" />
              </motion.div>
              <p className="text-gray-400 text-sm">
                Send a message or start a call to begin
              </p>
              {(contact?.public_key || contactPublicKey) && (
                <div className="mt-4 p-3 bg-cipher-dark rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Key fingerprint</p>
                  <p className="text-xs font-mono text-gray-400">
                    {generateFingerprint(contact?.public_key || contactPublicKey || '')}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <>
            {historyItems.map((item, index) => {
              const showDate = index === 0 ||
                format(item.date, 'yyyy-MM-dd') !==
                format(historyItems[index - 1].date, 'yyyy-MM-dd');

              if (item.type === 'call') {
                const call = item.data;
                const isOutgoing = call.caller_username === user?.username;
                const Icon = call.call_type === 'video' ? Video : Phone;

                return (
                  <div key={`call-${call.id}`}>
                    {showDate && (
                      <motion.div
                        className="flex justify-center my-4"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <span className="bg-cipher-dark px-3 py-1 rounded-full text-xs text-gray-500">
                          {format(item.date, 'MMMM d, yyyy')}
                        </span>
                      </motion.div>
                    )}
                    <motion.div
                      className="flex justify-center my-4"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 px-4 py-2 rounded-2xl flex items-center gap-3">
                        <div className={`p-2 rounded-full ${call.status === 'missed' ? 'bg-red-500/20 text-red-500' : 'bg-cipher-primary/20 text-cipher-primary'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-200">
                            {call.status === 'completed' ? (
                              isOutgoing ? 'Outgoing call' : 'Incoming call'
                            ) : call.status === 'missed' ? (
                              isOutgoing ? 'No answer' : 'Missed call'
                            ) : call.status === 'rejected' ? (
                              isOutgoing ? 'Call declined' : 'Declined call'
                            ) : 'Call failed'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {call.status === 'completed' && call.duration_seconds > 0 ? (
                              `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                            ) : format(item.date, 'HH:mm')}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                );
              }

              const msg = item.data;
              const isMine = msg.sender_username === user?.username;
              const isDeleted = msg.message_type === 'deleted';
              const isNew = newMessageIds.has(msg.id);

              const getBubbleStyle = () => {
                if (isDeleted) return undefined;
                if (isMine) {
                  return { background: accentGradient };
                } else if (msg.sender_theme?.accentGradient) {
                  return { background: msg.sender_theme.accentGradient };
                }
                return undefined;
              };

              const hasIncomingTheme = !isMine && msg.sender_theme?.accentGradient;

              return (
                <div key={`msg-${msg.id}`} className={densityClasses.messagePadding}>
                  {showDate && (
                    <motion.div
                      className="flex justify-center my-4"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <span className={`bg-cipher-dark dark:bg-gray-800 px-3 py-1 rounded-full ${fontClasses.xs} text-gray-500`}>
                        {format(item.date, 'MMMM d, yyyy')}
                      </span>
                    </motion.div>
                  )}

                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} message-bubble group`}>
                    <AnimatedMessageBubble isSent={isMine} isNew={isNew} index={index}>
                      <div
                        className={`
                          relative max-w-[85%] ${densityClasses.bubblePadding} rounded-2xl ${fontClasses.base}
                          ${isMine
                            ? 'text-white rounded-br-md'
                            : hasIncomingTheme
                              ? 'text-white rounded-bl-md'
                              : 'bg-gray-800 dark:bg-gray-800 text-white dark:text-white rounded-bl-md'}
                          ${!isDeleted ? 'cursor-pointer' : ''}
                          ${msg.sender_theme?.style === 'glass' ? 'backdrop-blur-md border border-white/10' : ''}
                          ${msg.sender_theme?.style === 'neon' ? 'shadow-lg shadow-[var(--accent-color)]/30' : ''}
                        `}
                        style={getBubbleStyle()}
                        onContextMenu={(e) => !isDeleted && handleMessageContextMenu(e, msg.id, isMine)}
                      >
                        {renderMessageContent(msg)}
                        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : ''}`}>
                          <span className={`${fontClasses.xs} opacity-60`}>
                            {format(item.date, 'HH:mm')}
                          </span>
                          {!isDeleted && (
                            <motion.button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMessageContextMenu(e, msg.id, isMine);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-400 transition-opacity"
                              title="Delete"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </motion.button>
                          )}
                          {isMine && getMessageStatus(msg)}
                        </div>
                      </div>
                    </AnimatedMessageBubble>
                  </div>
                </div>
              );
            })}

            {
              isTyping && (
                <motion.div
                  className="flex justify-start"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1">
                      <motion.div
                        className="w-2 h-2 bg-gray-500 rounded-full"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: 0 }}
                      />
                      <motion.div
                        className="w-2 h-2 bg-gray-500 rounded-full"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: 0.15 }}
                      />
                      <motion.div
                        className="w-2 h-2 bg-gray-500 rounded-full"
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: 0.3 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )
            }
          </>
        )}
        <div ref={messagesEndRef} />
      </div >

      {/* Message Input */}
      < motion.div
        className="p-4 border-t border-gray-800 bg-cipher-dark/50"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-end gap-3">
          <div className="relative">
            <motion.button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white"
              whileHover={{ scale: 1.1, rotate: -10 }}
              whileTap={{ scale: 0.9 }}
            >
              <Paperclip className="w-5 h-5" />
            </motion.button>

            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  className="absolute bottom-12 left-0 bg-cipher-dark border border-gray-700 rounded-lg shadow-lg p-2 min-w-[150px]"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                >
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded text-gray-300 text-sm"
                  >
                    <Image className="w-4 h-4" />
                    <span>Photo</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded text-gray-300 text-sm"
                  >
                    <File className="w-4 h-4" />
                    <span>Document</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
            />
          </div>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              rows={1}
              className="w-full bg-cipher-darker border border-gray-700 rounded-2xl py-3 px-4 pr-12 text-white placeholder-gray-500 focus:border-cipher-primary resize-none transition-colors"
              style={{ maxHeight: '120px' }}
            />
            <motion.button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cipher-primary transition-colors"
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
            >
              <Smile className="w-5 h-5" />
            </motion.button>

            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  className="absolute right-0 bottom-14 z-50"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                >
                  <EmojiPicker
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      setNewMessage(prev => prev + emojiData.emoji);
                      setShowEmojiPicker(false);
                      inputRef.current?.focus();
                    }}
                    theme={Theme.DARK}
                    width={350}
                    height={400}
                    searchPlaceholder="Search emoji..."
                    previewConfig={{ showPreview: false }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className={`
              p-3 rounded-full transition-all
              ${newMessage.trim()
                ? 'text-white hover:opacity-90'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
            `}
            style={newMessage.trim() ? { background: accentGradient } : undefined}
            whileHover={newMessage.trim() ? { scale: 1.1 } : {}}
            whileTap={newMessage.trim() ? { scale: 0.9 } : {}}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </motion.button>
        </div>
      </motion.div >

      {/* Info Panel */}
      <AnimatePresence>
        {
          showInfo && (
            <motion.div
              className="absolute right-0 top-0 h-full w-80 bg-cipher-dark/95 backdrop-blur-xl border-l border-gray-800 p-4 overflow-y-auto z-20"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-medium text-white">Contact Info</h3>
                <motion.button
                  onClick={() => setShowInfo(false)}
                  className="p-1 hover:bg-gray-700 rounded"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-5 h-5 text-gray-400" />
                </motion.button>
              </div>

              <motion.div
                className="text-center mb-6"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <motion.div
                  className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: accentGradient }}
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  <span className="text-2xl text-white font-medium">
                    {currentConversation.charAt(0).toUpperCase()}
                  </span>
                </motion.div>
                <h4 className="text-lg font-medium text-white">{currentConversation}</h4>
                <p className="text-sm text-gray-500">{contact?.contact_email || 'Secured Peer'}</p>
              </motion.div>

              <div className="space-y-4">
                <motion.div
                  className="p-3 bg-cipher-darker rounded-lg"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-xs text-gray-500 mb-1">Public Key Fingerprint</p>
                  <p className="text-xs font-mono text-gray-400 break-all">
                    {(contact?.public_key || contactPublicKey)
                      ? generateFingerprint(contact?.public_key || contactPublicKey || '')
                      : 'Not available - user has not set up encryption'}
                  </p>
                </motion.div>

                <motion.div
                  className="p-3 bg-cipher-darker rounded-lg"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center gap-2 text-cipher-primary">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">Encryption Active</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    All messages are encrypted with X25519 + AES-256-GCM
                  </p>
                </motion.div>
              </div>
            </motion.div>
          )
        }
      </AnimatePresence >

      {/* Incoming call overlay with animations */}
      <AnimatePresence>
        {
          callState && callState.status === 'ringing' && callState.isIncoming && (
            <motion.div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center">
                <motion.div
                  className="relative mx-auto mb-6"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  {/* Pulse rings */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-cipher-primary/30"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-cipher-primary/20"
                    animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                  />

                  <motion.div
                    className="relative w-24 h-24 rounded-full flex items-center justify-center"
                    style={{ background: accentGradient }}
                  >
                    <span className="text-3xl text-white font-bold">
                      {callState.remoteUsername.charAt(0).toUpperCase()}
                    </span>
                  </motion.div>
                </motion.div>

                <motion.h2
                  className="text-xl font-bold text-white mb-2"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {callState.remoteUsername}
                </motion.h2>
                <motion.p
                  className="text-gray-400 mb-6"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Incoming {callState.type} call...
                </motion.p>

                <motion.div
                  className="flex items-center justify-center gap-4"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <motion.button
                    onClick={handleRejectCall}
                    className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <PhoneOff className="w-6 h-6 text-white" />
                  </motion.button>
                  <motion.button
                    onClick={handleAnswerCall}
                    className="p-4 bg-green-500 rounded-full hover:bg-green-600 transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {callState.type === 'video' ? (
                      <Video className="w-6 h-6 text-white" />
                    ) : (
                      <Phone className="w-6 h-6 text-white" />
                    )}
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          )
        }
      </AnimatePresence >

      {/* Image Preview Modal */}
      <AnimatePresence>
        {
          previewImage && (
            <motion.div
              className="fixed inset-0 bg-black/95 z-[100] flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewImage(null)}
            >
              <div className="h-16 px-4 flex items-center justify-end">
                <motion.button
                  onClick={() => setPreviewImage(null)}
                  className="p-2 text-white/70 hover:text-white transition-colors"
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-8 h-8" />
                </motion.button>
              </div>
              <motion.div
                className="flex-1 flex items-center justify-center p-4"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
              >
                <img
                  src={previewImage}
                  alt="Full screen preview"
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
              <div className="h-20 flex items-center justify-center pb-4">
                <motion.button
                  onClick={() => handleDownload(previewImage, 'cipherlink_image.png')}
                  className="flex items-center gap-2 px-6 py-2 text-white rounded-full hover:opacity-90 transition-colors"
                  style={{ background: accentGradient }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Download className="w-5 h-5" />
                  <span>Download Full Image</span>
                </motion.button>
              </div>
            </motion.div>
          )
        }
      </AnimatePresence >

      {/* Message Context Menu */}
      <AnimatePresence>
        {
          contextMenu && (
            <>
              <motion.div
                className="fixed inset-0 z-[90]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseContextMenu}
              />
              <motion.div
                className="fixed bg-cipher-dark/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl py-2 min-w-[160px] z-[100]"
                style={{
                  left: Math.min(contextMenu.x, window.innerWidth - 180),
                  top: Math.min(contextMenu.y, window.innerHeight - 120),
                }}
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
              >
                <button
                  onClick={() => handleDeleteMessage(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete for me</span>
                </button>
                {contextMenu.isMine && (
                  <button
                    onClick={() => handleDeleteMessage(true)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete for everyone</span>
                  </button>
                )}
              </motion.div>
            </>
          )
        }
      </AnimatePresence >

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {
          deleteConfirmation && (
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[110]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-cipher-dark border border-gray-700 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
              >
                <h3 className="text-lg font-semibold text-white mb-2">
                  {deleteConfirmation.type === 'message'
                    ? 'Delete message?'
                    : deleteConfirmation.type === 'chat'
                      ? 'Clear chat?'
                      : 'Delete conversation?'}
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  {deleteConfirmation.type === 'message'
                    ? 'This message will be deleted for everyone. This action cannot be undone.'
                    : deleteConfirmation.type === 'chat'
                      ? 'This will clear all messages from your device. The other person will still have their copy.'
                      : 'This will delete the entire conversation for both you and the other person. This cannot be undone.'}
                </p>
                <div className="flex gap-3 justify-end">
                  <motion.button
                    onClick={() => setDeleteConfirmation(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    onClick={confirmDeletion}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${deleteConfirmation.type === 'conversation'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'text-white hover:opacity-90'
                      }`}
                    style={deleteConfirmation.type !== 'conversation' ? { background: accentGradient } : undefined}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {deleteConfirmation.type === 'message'
                      ? 'Delete'
                      : deleteConfirmation.type === 'chat'
                        ? 'Clear'
                        : 'Delete for everyone'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )
        }
      </AnimatePresence >
    </div >
  );
}
