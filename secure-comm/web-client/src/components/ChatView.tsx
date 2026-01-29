'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import {
  decryptMessage,
  EncryptedMessage,
  generateFingerprint
} from '@/lib/crypto';
import { useAppearance } from '@/lib/useAppearance';
import { wsManager } from '@/lib/websocket';
import { webrtcService, CallState } from '@/lib/webrtc';
import {
  Lock, Send, Smile, Paperclip, Phone, Video,
  MoreVertical, Shield, Check, CheckCheck, Clock,
  ArrowLeft, Info, X, PhoneOff, Mic, MicOff,
  VideoOff, Image, File, Loader2, Download, FileText,
  AlertCircle, Monitor, Maximize2, Minimize2, Users,
  MessageSquare, Settings, MoreHorizontal, Volume2, VolumeX,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

/**
 * Convert UTC timestamp to local time
 * Backend stores timestamps in UTC (datetime.utcnow), 
 * we need to display in user's local timezone
 */
function toLocalTime(utcDateString: string): Date {
  if (!utcDateString) return new Date();

  // If the timestamp doesn't have timezone info, assume it's UTC
  // Check if the string already has timezone info (Z, +, or - after the date part)
  const hasTimezone = utcDateString.endsWith('Z') ||
    /[+-]\d{2}:\d{2}$/.test(utcDateString) ||
    /[+-]\d{4}$/.test(utcDateString);

  if (!hasTimezone) {
    // No timezone info, treat as UTC by appending 'Z'
    return new Date(utcDateString + 'Z');
  }

  return new Date(utcDateString);
}

export default function ChatView() {
  const {
    user, currentConversation, messages, contacts, conversations,
    privateKey, sendMessage, onlineUsers, typingUsers,
    setCurrentConversation, loadCallHistory, callHistory,
    deleteMessageForMe, deleteMessageForEveryone, clearChat, deleteConversationForEveryone
  } = useStore();

  // Appearance settings
  const { getAccentGradient, getAccentColors, getDensityClasses, getFontClasses, settings } = useAppearance();
  const accentGradient = getAccentGradient();
  const accentColors = getAccentColors();
  const densityClasses = getDensityClasses();
  const fontClasses = getFontClasses();

  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showCallChat, setShowCallChat] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [contactPublicKey, setContactPublicKey] = useState<string | null>(null);

  // Message context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    messageId: number;
    isMine: boolean;
  } | null>(null);

  // Chat menu state
  const [showChatMenu, setShowChatMenu] = useState(false);

  // Delete confirmation dialog state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    visible: boolean;
    type: 'message' | 'chat' | 'conversation';
    messageId?: number;
    deleteForEveryone?: boolean;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
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

  // Combine and sort messages and calls chronologically
  // Convert UTC timestamps from backend to local time
  const historyItems = [
    ...conversationMessages.map(m => ({ type: 'message' as const, data: m, date: toLocalTime(m.created_at) })),
    ...relevantCalls.map(c => ({ type: 'call' as const, data: c, date: toLocalTime(c.start_time) }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Fetch initial data
  useEffect(() => {
    loadCallHistory();
  }, [loadCallHistory]);

  // Fetch contact's public key if not available in contacts or conversations
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages]);

  // Send typing indicator
  useEffect(() => {
    if (currentConversation && newMessage) {
      wsManager.sendTypingIndicator(currentConversation, true);
      const timeout = setTimeout(() => {
        wsManager.sendTypingIndicator(currentConversation, false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [newMessage, currentConversation]);

  // Setup WebRTC handlers
  useEffect(() => {
    webrtcService.setOnCallStateChange((state) => {
      console.log('📞 Call state changed:', state);
      setCallState(state);
    });

    webrtcService.setOnLocalStream((stream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    });

    webrtcService.setOnRemoteStream((stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    });

    return () => {
      webrtcService.setOnCallStateChange(null);
      webrtcService.setOnLocalStream(null);
      webrtcService.setOnRemoteStream(null);
    };
  }, []);

  // Sync streams with video elements
  useEffect(() => {
    if (callState) {
      console.log('🎥 Syncing streams, callState:', callState.status,
        'localStream:', !!callState.localStream,
        'remoteStream:', !!callState.remoteStream);

      // Attach local stream
      if (callState.localStream) {
        if (localVideoRef.current) {
          if (localVideoRef.current.srcObject !== callState.localStream) {
            console.log('🎥 Attaching local stream to video element');
            localVideoRef.current.srcObject = callState.localStream;
            localVideoRef.current.play().catch(e => console.error('Error playing local stream:', e));
          }
        } else {
          console.log('⏳ Local video element not yet mounted');
        }
      }

      // Attach remote stream
      if (callState.remoteStream) {
        if (remoteVideoRef.current) {
          if (remoteVideoRef.current.srcObject !== callState.remoteStream) {
            console.log('🎥 Attaching remote stream to video element');
            remoteVideoRef.current.srcObject = callState.remoteStream;
            remoteVideoRef.current.play().catch(e => console.error('Error playing remote stream:', e));
          }
        } else {
          console.log('⏳ Remote video element not yet mounted, retrying...');
          // Retry after a short delay since the element might not be mounted yet
          setTimeout(() => {
            if (remoteVideoRef.current && callState.remoteStream) {
              console.log('🎥 Retry: Attaching remote stream to video element');
              remoteVideoRef.current.srcObject = callState.remoteStream;
              remoteVideoRef.current.play().catch(e => console.error('Error playing remote stream:', e));
            }
          }, 100);
        }
      }
    }
  }, [callState, callState?.localStream, callState?.remoteStream]);

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (callState?.status === 'connected' && callState.startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const start = new Date(callState.startTime!);
        setCallDuration(Math.floor((now.getTime() - start.getTime()) / 1000));
      }, 1000);
    } else {
      setCallDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState?.status, callState?.startTime]);

  // Close chat menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowChatMenu(false);
    if (showChatMenu) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showChatMenu]);

  // Format duration as MM:SS or HH:MM:SS
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Screen sharing handler
  const handleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing - revert to camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        webrtcService.replaceVideoTrack(stream.getVideoTracks()[0]);
        setIsScreenSharing(false);
      } catch (error) {
        console.error('Error stopping screen share:', error);
      }
    } else {
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        webrtcService.replaceVideoTrack(screenStream.getVideoTracks()[0]);
        setIsScreenSharing(true);

        // Listen for when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          // Revert to camera
          navigator.mediaDevices.getUserMedia({ video: true }).then(camStream => {
            webrtcService.replaceVideoTrack(camStream.getVideoTracks()[0]);
          });
        };
      } catch (error) {
        console.error('Error starting screen share:', error);
      }
    }
  };

  // Fullscreen toggle
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
      await sendMessage(currentConversation, newMessage);
      setNewMessage('');
      inputRef.current?.focus();
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

    console.log(`📞 Initiating ${type} call to ${currentConversation}`);
    const success = await webrtcService.startCall(currentConversation, type);
    if (!success) {
      console.error('❌ Failed to start call');
    } else {
      console.log('✅ Call started successfully');
    }
  };

  const handleAnswerCall = async () => {
    console.log('📞 Answer button clicked');
    try {
      const success = await webrtcService.answerCall();
      console.log('📞 Answer call result:', success);
      if (!success) {
        console.error('❌ Failed to answer call');
      }
    } catch (error) {
      console.error('❌ Error answering call:', error);
    }
  };

  const handleRejectCall = () => {
    webrtcService.rejectCall();
    setCallState(null);
  };

  const handleEndCall = () => {
    webrtcService.endCall();
    setCallState(null);
  };

  const handleToggleMute = () => {
    const newMuteState = !webrtcService.toggleMute();
    setIsMuted(!newMuteState);
  };

  const handleToggleVideo = () => {
    const newVideoState = !webrtcService.toggleVideo();
    setIsVideoOff(!newVideoState);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentConversation) return;

    const file = files[0];
    setShowAttachMenu(false);
    setIsSending(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const fileMetadata = {
          name: file.name,
          type: file.type,
          size: file.size,
        };

        // Send file message
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
    // Check if we have cached decrypted content (for our own messages)
    if (msg._decryptedContent) {
      return msg._decryptedContent;
    }

    if (!privateKey) return '[Encrypted]';

    try {
      const encrypted = JSON.parse(msg.encrypted_content) as EncryptedMessage;

      // v2 protocol: senderPublicKey is embedded in the message
      // v1 protocol: use cached contact public key as fallback
      let fallbackPublicKey: string | undefined;

      if (msg.sender_username === user?.username) {
        // We sent this message; fallback is recipient's public key
        fallbackPublicKey =
          contact?.public_key || conversation?.public_key || contactPublicKey || undefined;

        // For our own sent messages without embedded key, show placeholder
        if (!encrypted.senderPublicKey && !fallbackPublicKey) {
          return '[Sent message]';
        }
      } else {
        // Message from partner; fallback is sender's (contact's) public key
        fallbackPublicKey =
          contact?.public_key || conversation?.public_key || contactPublicKey || undefined;

        // v2 messages have embedded sender key, v1 messages need fallback
        if (!encrypted.senderPublicKey && !fallbackPublicKey) {
          return '[Key not available]';
        }
      }

      // decryptMessage handles v2 (uses embedded senderPublicKey) and v1 (uses fallback)
      const decrypted = decryptMessage(encrypted, fallbackPublicKey || '', privateKey);

      if (!decrypted) {
        // Distinguish between sent messages (which we can't decrypt with our key) and failed incoming
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
        return <CheckCheck className="w-4 h-4 text-cipher-primary" />;
      case 'sending':
        return <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const renderMessageContent = (msg: any) => {
    // Check if message was deleted
    if (msg.message_type === 'deleted') {
      return (
        <p className="italic text-gray-400/70">
          <Trash2 className="w-3 h-3 inline mr-1" />
          This message was deleted
        </p>
      );
    }

    const content = decryptContent(msg);

    // Check if it's a file/image message
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
      const isDataUrl = content.startsWith('data:');
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

  // Handle message context menu (right-click or long-press)
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

  // Close context menu when clicking outside
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Handle message deletion
  const handleDeleteMessage = async (forEveryone: boolean) => {
    if (!contextMenu || !currentConversation) return;

    if (forEveryone) {
      // Show confirmation for delete for everyone
      setDeleteConfirmation({
        visible: true,
        type: 'message',
        messageId: contextMenu.messageId,
        deleteForEveryone: true,
      });
    } else {
      // Delete for me directly (no confirmation needed)
      await deleteMessageForMe(contextMenu.messageId, currentConversation);
    }
    setContextMenu(null);
  };

  // Handle clear chat (local only)
  const handleClearChat = () => {
    setDeleteConfirmation({
      visible: true,
      type: 'chat',
    });
    setShowChatMenu(false);
  };

  // Handle delete conversation for everyone
  const handleDeleteConversation = () => {
    setDeleteConfirmation({
      visible: true,
      type: 'conversation',
    });
    setShowChatMenu(false);
  };

  // Confirm deletion action
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

  // Show incoming call overlay even when no conversation is selected
  if (callState && callState.status === 'ringing' && callState.isIncoming) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-3xl text-white font-bold">
              {callState.remoteUsername.charAt(0).toUpperCase()}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {callState.remoteUsername}
          </h2>
          <p className="text-gray-400 mb-6">
            Incoming {callState.type} call...
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRejectCall(); }}
              className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleAnswerCall(); }}
              className="p-4 bg-green-500 rounded-full hover:bg-green-600 transition-colors animate-bounce"
            >
              {callState.type === 'video' ? (
                <Video className="w-6 h-6 text-white" />
              ) : (
                <Phone className="w-6 h-6 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentConversation) return null;

  // Show call error if call failed
  if (callState && callState.status === 'failed') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="text-center max-w-md p-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Call Failed</h2>
          <p className="text-gray-400 mb-6">
            {callState.errorMessage || 'Unable to connect the call. Please try again.'}
          </p>
          <button
            onClick={() => {
              webrtcService.endCall(false);
              setCallState(null);
            }}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Render call UI if in call
  if (callState && ['calling', 'ringing', 'connecting', 'connected'].includes(callState.status)) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#1a1a1a] relative overflow-hidden">
        {/* Top bar - Call info */}
        <div className="absolute top-0 left-0 right-0 z-30 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center">
              <span className="text-white font-bold">
                {callState.remoteUsername.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-white font-medium">{callState.remoteUsername}</h3>
              <div className="flex items-center gap-2 text-sm">
                {callState.status === 'connected' ? (
                  <span className="text-green-400">{formatDuration(callDuration)}</span>
                ) : (
                  <span className="text-gray-400 capitalize">{callState.status}...</span>
                )}
                {isScreenSharing && (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> Presenting
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFullscreen}
              className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Main video area */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Remote video - show when we have a remote stream */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`
              ${callState.type === 'video' && callState.remoteStream
                ? 'absolute inset-0 w-full h-full object-cover'
                : 'absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none'}
            `}
          />

          {/* Fallback display for audio calls or when no remote stream yet */}
          {(callState.type === 'audio' || !callState.remoteStream) && (
            <div className="relative z-10 text-center">
              <div className="relative">
                <div className={`w-40 h-40 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center mx-auto mb-6 ${callState.status === 'calling' || callState.status === 'ringing' ? 'animate-pulse' : ''
                  }`}>
                  <span className="text-5xl text-white font-bold">
                    {callState.remoteUsername.charAt(0).toUpperCase()}
                  </span>
                </div>
                {callState.status === 'calling' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-44 h-44 border-4 border-cipher-primary/30 rounded-full animate-ping" />
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {callState.remoteUsername}
              </h2>
              <p className="text-gray-400">
                {callState.status === 'calling' && 'Calling...'}
                {callState.status === 'ringing' && callState.isIncoming && 'Incoming call...'}
                {callState.status === 'ringing' && !callState.isIncoming && 'Ringing...'}
                {callState.status === 'connecting' && 'Connecting...'}
                {callState.status === 'connected' && callState.type === 'audio' && (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    {formatDuration(callDuration)}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Local video (Picture-in-Picture) */}
          <div className={`
            absolute bottom-28 right-6 z-20 rounded-xl overflow-hidden shadow-2xl border-2 border-white/10
            transition-all duration-300 hover:scale-105 cursor-move
            ${callState.type === 'video'
              ? 'w-48 h-36 bg-[#2a2a2a]'
              : 'hidden'}
          `}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
            />
            {isVideoOff && (
              <div className="w-full h-full flex items-center justify-center bg-[#2a2a2a]">
                <div className="w-16 h-16 bg-cipher-primary/20 rounded-full flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-cipher-primary" />
                </div>
              </div>
            )}
            {isMuted && (
              <div className="absolute bottom-2 right-2 p-1 bg-red-500 rounded-full">
                <MicOff className="w-3 h-3 text-white" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-xs text-white/70 bg-black/50 px-1.5 py-0.5 rounded">
              You
            </div>
          </div>
        </div>

        {/* Bottom control bar - Google Meet style */}
        <div className="absolute bottom-0 left-0 right-0 z-30 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex items-center justify-center gap-3">
            {/* Incoming call buttons */}
            {callState.status === 'ringing' && callState.isIncoming && (
              <>
                <button
                  onClick={handleRejectCall}
                  className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-all hover:scale-110 shadow-lg"
                  title="Decline"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </button>
                <button
                  onClick={handleAnswerCall}
                  className="p-4 bg-green-500 rounded-full hover:bg-green-600 transition-all hover:scale-110 shadow-lg animate-bounce"
                  title="Answer"
                >
                  {callState.type === 'video' ? (
                    <Video className="w-7 h-7 text-white" />
                  ) : (
                    <Phone className="w-7 h-7 text-white" />
                  )}
                </button>
              </>
            )}

            {/* In-call controls */}
            {(callState.status === 'calling' || callState.status === 'connecting' || callState.status === 'connected') && (
              <>
                {/* Mute button */}
                <button
                  onClick={handleToggleMute}
                  className={`p-4 rounded-full transition-all hover:scale-110 shadow-lg ${isMuted
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-[#3c4043] hover:bg-[#4a4d50]'
                    }`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
                </button>

                {/* Video toggle */}
                {callState.type === 'video' && (
                  <button
                    onClick={handleToggleVideo}
                    className={`p-4 rounded-full transition-all hover:scale-110 shadow-lg ${isVideoOff
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-[#3c4043] hover:bg-[#4a4d50]'
                      }`}
                    title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                  >
                    {isVideoOff ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-white" />}
                  </button>
                )}

                {/* Screen share */}
                {callState.type === 'video' && callState.status === 'connected' && (
                  <button
                    onClick={handleScreenShare}
                    className={`p-4 rounded-full transition-all hover:scale-110 shadow-lg ${isScreenSharing
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : 'bg-[#3c4043] hover:bg-[#4a4d50]'
                      }`}
                    title={isScreenSharing ? 'Stop presenting' : 'Present screen'}
                  >
                    <Monitor className="w-6 h-6 text-white" />
                  </button>
                )}

                {/* End call */}
                <button
                  onClick={handleEndCall}
                  className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-all hover:scale-110 shadow-lg px-8"
                  title="End call"
                >
                  <PhoneOff className="w-6 h-6 text-white" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat Header */}
      <div className="h-16 px-4 border-b border-gray-800 flex items-center justify-between bg-cipher-dark/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentConversation(null)}
            className="lg:hidden p-2 -ml-2 hover:bg-gray-700 rounded-lg text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: accentGradient }}
            >
              <span className="text-white font-medium">
                {currentConversation.charAt(0).toUpperCase()}
              </span>
            </div>
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-cipher-dark" />
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
                <Shield className="w-3 h-3 text-cipher-primary" />
                Encrypted
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => handleStartCall('audio')}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Voice Call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleStartCall('video')}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Video Call"
          >
            <Video className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <Info className="w-5 h-5" />
          </button>

          {/* Chat Menu */}
          <div className="relative">
            <button
              onClick={() => setShowChatMenu(!showChatMenu)}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Chat Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showChatMenu && (
              <div className="absolute right-0 top-full mt-1 bg-cipher-dark border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Security Banner */}
      <div className="px-4 py-2 bg-cipher-primary/10 border-b border-cipher-primary/20 flex items-center justify-center gap-2 text-xs text-cipher-primary">
        <Lock className="w-3 h-3" />
        <span>Messages are end-to-end encrypted. No one outside this chat can read them.</span>
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 ${densityClasses.messageGap}`}>
        {historyItems.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-cipher-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-cipher-primary" />
              </div>
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
          </div>
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
                      <div className="flex justify-center my-4">
                        <span className="bg-cipher-dark px-3 py-1 rounded-full text-xs text-gray-500">
                          {format(item.date, 'MMMM d, yyyy')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-center my-4">
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
                    </div>
                  </div>
                );
              }

              const msg = item.data;
              const isMine = msg.sender_username === user?.username;
              const isDeleted = msg.message_type === 'deleted';

              // Get bubble style - use sender's theme for their messages
              const getBubbleStyle = () => {
                if (isDeleted) return undefined;

                if (isMine) {
                  // Own messages use user's accent gradient
                  return { background: accentGradient };
                } else if (msg.sender_theme?.accentGradient) {
                  // Incoming messages with sender's theme
                  return { background: msg.sender_theme.accentGradient };
                }
                return undefined;
              };

              // Check if incoming message has sender's theme to apply custom colors
              const hasIncomingTheme = !isMine && msg.sender_theme?.accentGradient;

              return (
                <div key={`msg-${msg.id}`} className={densityClasses.messagePadding}>
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <span className={`bg-cipher-dark dark:bg-gray-800 px-3 py-1 rounded-full ${fontClasses.xs} text-gray-500`}>
                        {format(item.date, 'MMMM d, yyyy')}
                      </span>
                    </div>
                  )}

                  <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} message-bubble group`}>
                    <div
                      className={`
                        relative max-w-[70%] ${densityClasses.bubblePadding} rounded-2xl ${fontClasses.base}
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
                        {isMine && getMessageStatus(msg)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-gray-500 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-gray-500 rounded-full typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-800 bg-cipher-dark/50">
        <div className="flex items-end gap-3">
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Attachment menu */}
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 bg-cipher-dark border border-gray-700 rounded-lg shadow-lg p-2 min-w-[150px]">
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded text-gray-300 text-sm"
                >
                  <Image className="w-4 h-4" />
                  <span>Photo</span>
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 rounded text-gray-300 text-sm"
                >
                  <File className="w-4 h-4" />
                  <span>Document</span>
                </button>
              </div>
            )}

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
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cipher-primary transition-colors"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div className="absolute right-0 bottom-14 z-50">
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
              </div>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className={`
              p-3 rounded-full transition-all
              ${newMessage.trim()
                ? 'text-white hover:opacity-90'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
            `}
            style={newMessage.trim() ? { background: accentGradient } : undefined}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="absolute right-0 top-0 h-full w-80 bg-cipher-dark border-l border-gray-800 p-4 overflow-y-auto z-20">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-medium text-white">Contact Info</h3>
            <button
              onClick={() => setShowInfo(false)}
              className="p-1 hover:bg-gray-700 rounded"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl text-white font-medium">
                {currentConversation.charAt(0).toUpperCase()}
              </span>
            </div>
            <h4 className="text-lg font-medium text-white">{currentConversation}</h4>
            <p className="text-sm text-gray-500">{contact?.contact_email || 'Secured Peer'}</p>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-cipher-darker rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Public Key Fingerprint</p>
              <p className="text-xs font-mono text-gray-400 break-all">
                {(contact?.public_key || contactPublicKey)
                  ? generateFingerprint(contact?.public_key || contactPublicKey || '')
                  : 'Not available - user has not set up encryption'}
              </p>
            </div>

            <div className="p-3 bg-cipher-darker rounded-lg">
              <div className="flex items-center gap-2 text-cipher-primary">
                <Shield className="w-4 h-4" />
                <span className="text-sm font-medium">Encryption Active</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                All messages are encrypted with X25519 + AES-256-GCM
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Incoming call overlay */}
      {callState && callState.status === 'ringing' && callState.isIncoming && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-cipher-primary to-cipher-secondary rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="text-3xl text-white font-bold">
                {callState.remoteUsername.charAt(0).toUpperCase()}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {callState.remoteUsername}
            </h2>
            <p className="text-gray-400 mb-6">
              Incoming {callState.type} call...
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleRejectCall}
                className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={handleAnswerCall}
                className="p-4 bg-green-500 rounded-full hover:bg-green-600 transition-colors animate-bounce"
              >
                {callState.type === 'video' ? (
                  <Video className="w-6 h-6 text-white" />
                ) : (
                  <Phone className="w-6 h-6 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/95 z-[100] flex flex-col"
          onClick={() => setPreviewImage(null)}
        >
          <div className="h-16 px-4 flex items-center justify-end">
            <button
              onClick={() => setPreviewImage(null)}
              className="p-2 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img
              src={previewImage}
              alt="Full screen preview"
              className="max-w-full max-h-full object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="h-20 flex items-center justify-center pb-4">
            <button
              onClick={() => handleDownload(previewImage, 'cipherlink_image.png')}
              className="flex items-center gap-2 px-6 py-2 bg-cipher-primary text-white rounded-full hover:bg-cipher-primary/90 transition-colors"
            >
              <Download className="w-5 h-5" />
              <span>Download Full Image</span>
            </button>
          </div>
        </div>
      )}

      {/* Message Context Menu */}
      {contextMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-[90]"
            onClick={handleCloseContextMenu}
          />

          {/* Context menu */}
          <div
            className="fixed bg-cipher-dark/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl py-2 min-w-[160px] z-[100]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 180),
              top: Math.min(contextMenu.y, window.innerHeight - 120),
            }}
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
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[110]">
          <div className="bg-cipher-dark border border-gray-700 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
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
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletion}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${deleteConfirmation.type === 'conversation'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-cipher-primary hover:bg-cipher-primary/80 text-white'
                  }`}
              >
                {deleteConfirmation.type === 'message'
                  ? 'Delete'
                  : deleteConfirmation.type === 'chat'
                    ? 'Clear'
                    : 'Delete for everyone'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
