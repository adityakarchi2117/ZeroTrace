/**
 * ZeroTrace Enhanced Chat Screen
 * Full-featured encrypted chat with:
 * - E2E message encryption/decryption
 * - WebSocket real-time messaging
 * - Typing indicators
 * - Read receipts & delivery status
 * - Image/file attachment
 * - Message reactions
 * - Delete for me/everyone
 * - Long-press context menu
 * - Dynamic Appearance (Themes, Bubbles)
 * - Sound Effects
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
  Modal,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';

import { useChatStore, Message } from '../../store/chatStore';
import { colors } from '../../theme/colors';
import { wsManager } from '../../services/websocket';
import { playSentSound, playMessageSound } from '../../services/sound';
import { loadAppearanceSettings, AppearanceSettings } from '../../services/appearanceService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ChatRouteParams = {
  Chat: {
    userId: number;
    username: string;
  };
};

// ─── Message Status Icon ───────────────────────────

const MessageStatus: React.FC<{ status: string; readAt?: string }> = ({ status, readAt }) => {
  if (readAt || status === 'read') {
    return <Icon name="checkmark-done" size={14} color={colors.primary.main} />;
  }
  if (status === 'delivered') {
    return <Icon name="checkmark-done" size={14} color={colors.text.muted} />;
  }
  if (status === 'sent') {
    return <Icon name="checkmark" size={14} color={colors.text.muted} />;
  }
  return <Icon name="time-outline" size={12} color={colors.text.muted} />;
};

// ─── Message Bubble ────────────────────────────────

const MessageBubble: React.FC<{
  message: Message;
  isMine: boolean;
  onLongPress: (msg: Message) => void;
  bubbleStyle?: string;
}> = ({ message, isMine, onLongPress, bubbleStyle = 'rounded' }) => {
  const displayContent = message._decryptedContent || message.encrypted_content;
  const isDeleted = message.is_deleted || message.deleted_for_everyone;

  const timestamp = useMemo(() => {
    const date = new Date(message.created_at);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [message.created_at]);

  // Reaction display
  const reactions = message.reactions;
  const hasReactions = reactions && Object.keys(reactions).length > 0;

  // Dynamic Styles
  const getBubbleStyle = () => {
    const base = [styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs];

    if (isDeleted) base.push(styles.bubbleDeleted);
    if (message._decryptionFailed) base.push(styles.bubbleError);

    switch (bubbleStyle) {
      case 'glass':
        base.push(styles.bubbleGlass);
        break;
      case 'neon':
        base.push(isMine ? styles.bubbleNeonMine : styles.bubbleNeonTheirs);
        break;
      case 'minimal':
        base.push(styles.bubbleMinimal);
        break;
      case 'retro':
        base.push(styles.bubbleRetro);
        break;
      case 'brutal':
        base.push(styles.bubbleBrutal);
        break;
    }
    return base;
  };

  return (
    <Pressable
      onLongPress={() => onLongPress(message)}
      delayLongPress={400}
      style={[
        styles.bubbleContainer,
        isMine ? styles.bubbleRight : styles.bubbleLeft,
      ]}
    >
      <View style={getBubbleStyle()}>
        {/* File / Image attachment */}
        {message.message_type === 'image' && message.file_metadata?.url && (
          <Image
            source={{ uri: message.file_metadata.url }}
            style={styles.attachedImage}
            resizeMode="cover"
          />
        )}

        {message.message_type === 'file' && message.file_metadata && (
          <View style={styles.fileAttachment}>
            <Icon name="document-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.fileName}>{message.file_metadata.name || 'File'}</Text>
          </View>
        )}

        {/* Message text */}
        <Text
          style={[
            styles.bubbleText,
            isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
            isDeleted && styles.deletedText,
            message._decryptionFailed && styles.errorText,
            bubbleStyle === 'mono' && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
          ]}
        >
          {isDeleted
            ? '🗑 This message was deleted'
            : message._decryptionFailed
              ? '🔒 ' + displayContent
              : displayContent}
        </Text>

        {/* Timestamp & status */}
        <View style={styles.metaRow}>
          <Text style={styles.timeText}>{timestamp}</Text>
          {isMine && <MessageStatus status={message.status} readAt={message.read_at} />}
        </View>
      </View>

      {/* Reactions */}
      {hasReactions && (
        <View style={[styles.reactionBar, isMine ? styles.reactionBarRight : styles.reactionBarLeft]}>
          {Object.entries(reactions!).map(([emoji, users]) => (
            <View key={emoji} style={styles.reactionChip}>
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {(users as string[]).length > 1 && (
                <Text style={styles.reactionCount}>{(users as string[]).length}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
};

// ─── Main Chat Screen ──────────────────────────────

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ChatRouteParams, 'Chat'>>();
  const { username, userId } = route.params;

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Store selectors
  const user = useChatStore((s) => s.user);
  const messages = useChatStore((s) => s.messages);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const contacts = useChatStore((s) => s.contacts);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const deleteMessageForMe = useChatStore((s) => s.deleteMessageForMe);
  const deleteMessageForEveryone = useChatStore((s) => s.deleteMessageForEveryone);

  const isTyping = typingUsers.get(username) || false;
  const isOnline = contacts.find((c) => c.contact_id === userId)
    ? onlineUsers.has(userId)
    : false;

  const conversationMessages = useMemo(() => {
    const msgs = messages.get(username) || [];
    return [...msgs].reverse(); // inverted list expects newest first
  }, [messages, username]);

  // Load appearance
  useFocusEffect(
    useCallback(() => {
      loadAppearanceSettings().then(setAppearance);
    }, [])
  );

  // Load messages on mount
  useEffect(() => {
    setCurrentConversation(username);
    setLoading(true);
    loadMessages(username).finally(() => setLoading(false));

    return () => {
      setCurrentConversation(null);
    };
  }, [username, loadMessages, setCurrentConversation]);

  // Mark messages as read & Play Sound
  useEffect(() => {
    const msgs = messages.get(username) || [];
    const unread = msgs.filter(
      (m) => m.sender_username === username && m.status !== 'read' && !m.read_at
    );

    if (unread.length > 0) {
      // Play sound for new messages (if not loaded initially)
      // Ideally we'd compare against last known message ID, but this is a simple approximation
      if (!loading) playMessageSound();

      unread.forEach((m) => {
        if (m.sender_id && m.id) {
          wsManager.sendReadReceipt(m.id, m.sender_id);
        }
      });
    }
  }, [messages, username, loading]);

  // ─── Handlers ────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    setReplyTo(null);
    playSentSound();
    await sendMessage(username, text);

    // Clear typing indicator
    wsManager.sendTypingIndicator(username, false);
  }, [input, username, sendMessage]);

  const handleTextChange = useCallback(
    (text: string) => {
      setInput(text);

      // Send typing indicator
      wsManager.sendTypingIndicator(username, text.length > 0);

      // Clear typing after 3s of inactivity
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        wsManager.sendTypingIndicator(username, false);
      }, 3000);
    },
    [username]
  );

  const handleLongPress = useCallback((msg: Message) => {
    Vibration.vibrate(50);
    setSelectedMessage(msg);
    setShowContextMenu(true);
  }, []);

  const handleDeleteForMe = useCallback(() => {
    if (selectedMessage) {
      deleteMessageForMe(selectedMessage.id, username);
    }
    setShowContextMenu(false);
    setSelectedMessage(null);
  }, [selectedMessage, username, deleteMessageForMe]);

  const handleDeleteForEveryone = useCallback(() => {
    if (selectedMessage) {
      Alert.alert(
        'Delete for Everyone',
        'This message will be deleted for all participants.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteMessageForEveryone(selectedMessage.id, username);
              setShowContextMenu(false);
              setSelectedMessage(null);
            },
          },
        ]
      );
    }
  }, [selectedMessage, username, deleteMessageForEveryone]);

  const handleAttachImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1200,
        maxHeight: 1200,
      });

      if (result.assets?.[0]) {
        const asset = result.assets[0];
        // TODO: Upload file to server, get URL, then send as image message
        await sendMessage(username, `[Image: ${asset.fileName}]`, 'image', {
          uri: asset.uri,
          name: asset.fileName,
          type: asset.type,
          size: asset.fileSize,
        });
      }
    } catch (error) {
      console.error('[Chat] Image picker error:', error);
    }
  }, [username, sendMessage]);

  const handleReaction = useCallback(
    (emoji: string) => {
      if (selectedMessage) {
        wsManager.sendMessageReaction(selectedMessage.id, username, emoji);
        setShowContextMenu(false);
        setSelectedMessage(null);
      }
    },
    [selectedMessage, username]
  );

  const handleCallPress = useCallback(
    (callType: 'audio' | 'video') => {
      navigation.navigate('Call', {
        username,
        userId,
        callType,
        isIncoming: false,
      });
    },
    [navigation, username, userId]
  );

  // ─── Render ──────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isMine = item.sender_username === user?.username;

      return (
        <MessageBubble
          message={item}
          isMine={isMine}
          onLongPress={handleLongPress}
          bubbleStyle={appearance?.bubbleStyle}
        />
      );
    },
    [user, handleLongPress, appearance]
  );

  // Background handling
  // If wallpaper is set, we need to wrap content, but `KeyboardAvoidingView` needs to be top level usually for RN
  // We can wrap the FlatList content or the whole view.

  const content = (
    <>
      {/* ─── Header ─────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => navigation.navigate('Profile', { userId })}
        >
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarSmallText}>
              {username.charAt(0).toUpperCase()}
            </Text>
            {isOnline && <View style={styles.onlineDot} />}
          </View>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{username}</Text>
            <Text style={styles.headerSubtitle}>
              {isTyping
                ? 'typing...'
                : isOnline
                  ? 'Online'
                  : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => handleCallPress('audio')}
          >
            <Icon name="call-outline" size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => handleCallPress('video')}
          >
            <Icon name="videocam-outline" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── E2E Encryption Banner ──────────── */}
      <View style={styles.encryptionBanner}>
        <Icon name="lock-closed" size={12} color={colors.primary.main} />
        <Text style={styles.encryptionText}>
          Messages are end-to-end encrypted
        </Text>
      </View>

      {/* ─── Message List ───────────────────── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={conversationMessages}
          inverted
          renderItem={renderMessage}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Icon name="chatbubble-ellipses-outline" size={48} color={colors.text.muted} />
              <Text style={styles.emptyChatText}>
                Start a secure conversation
              </Text>
              <Text style={styles.emptyChatSubtext}>
                All messages are encrypted end-to-end
              </Text>
            </View>
          }
        />
      )}

      {/* ─── Typing Indicator ───────────────── */}
      {isTyping && (
        <View style={styles.typingContainer}>
          <View style={styles.typingDots}>
            <View style={[styles.typingDot, styles.typingDot1]} />
            <View style={[styles.typingDot, styles.typingDot2]} />
            <View style={[styles.typingDot, styles.typingDot3]} />
          </View>
          <Text style={styles.typingText}>{username} is typing...</Text>
        </View>
      )}

      {/* ─── Reply Preview ─────────────────── */}
      {replyTo && (
        <View style={styles.replyPreview}>
          <View style={styles.replyAccent} />
          <View style={styles.replyContent}>
            <Text style={styles.replyAuthor}>
              {replyTo.sender_username === user?.username ? 'You' : replyTo.sender_username}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyTo._decryptedContent || replyTo.encrypted_content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyClear}>
            <Icon name="close" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Input Row ──────────────────────── */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleAttachImage}
        >
          <Icon name="add-circle-outline" size={24} color={colors.text.secondary} />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={input}
          onChangeText={handleTextChange}
          placeholder="Type a message..."
          placeholderTextColor={colors.text.muted}
          multiline
          maxLength={5000}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            !input.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Icon
            name="send"
            size={18}
            color={input.trim() ? colors.text.inverse : colors.text.muted}
          />
        </TouchableOpacity>
      </View>

      {/* ─── Context Menu Modal ─────────────── */}
      <Modal
        visible={showContextMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowContextMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowContextMenu(false)}
        >
          <View style={styles.contextMenu}>
            {/* Quick Reactions */}
            <View style={styles.quickReactions}>
              {['❤️', '😂', '👍', '😮', '😢', '🙏'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionButton}
                  onPress={() => handleReaction(emoji)}
                >
                  <Text style={styles.reactionButtonText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                // Copy to clipboard
                setShowContextMenu(false);
              }}
            >
              <Icon name="copy-outline" size={18} color={colors.text.primary} />
              <Text style={styles.menuItemText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setReplyTo(selectedMessage);
                setShowContextMenu(false);
                setSelectedMessage(null);
              }}
            >
              <Icon name="arrow-undo-outline" size={18} color={colors.text.primary} />
              <Text style={styles.menuItemText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleDeleteForMe}
            >
              <Icon name="trash-outline" size={18} color={colors.text.primary} />
              <Text style={styles.menuItemText}>Delete for Me</Text>
            </TouchableOpacity>

            {selectedMessage?.sender_username === user?.username && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleDeleteForEveryone}
              >
                <Icon name="trash" size={18} color={colors.status.error} />
                <Text style={[styles.menuItemText, { color: colors.status.error }]}>
                  Delete for Everyone
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* TODO: If wallpaper exists, wrap content in ImageBackground */}
      {content}
    </KeyboardAvoidingView>
  );
};

// ─── Styles ────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  backButton: {
    padding: 8,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarSmallText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.inverse,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.status.success,
    borderWidth: 2,
    borderColor: colors.background.secondary,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerActionButton: {
    padding: 8,
    borderRadius: 8,
  },

  // Encryption banner
  encryptionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
    backgroundColor: colors.background.tertiary,
  },
  encryptionText: {
    fontSize: 11,
    color: colors.primary.main,
    fontWeight: '500',
  },

  // Message list
  listContent: {
    padding: 12,
    gap: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: 60,
    transform: [{ scaleY: -1 }], // Because FlatList is inverted
  },
  emptyChatText: {
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyChatSubtext: {
    color: colors.text.muted,
    fontSize: 13,
    marginTop: 4,
  },

  // Message bubbles based on bubbleStyle
  bubbleContainer: {
    marginVertical: 2,
    maxWidth: SCREEN_WIDTH * 0.8,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 80,
  },
  bubbleMine: {
    backgroundColor: colors.primary.main,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.background.secondary,
    borderBottomLeftRadius: 4,
  },
  bubbleDeleted: {
    opacity: 0.6,
  },
  bubbleError: {
    borderWidth: 1,
    borderColor: colors.status.warning,
  },

  // Custom Styles
  bubbleGlass: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bubbleNeonMine: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary.main,
    shadowColor: colors.primary.main,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  bubbleNeonTheirs: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.text.secondary,
  },
  bubbleMinimal: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  bubbleRetro: {
    borderRadius: 0,
    borderWidth: 2,
    borderColor: colors.text.primary,
  },
  bubbleBrutal: {
    borderRadius: 2,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: '#FFF',
  },

  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: colors.text.inverse,
  },
  bubbleTextTheirs: {
    color: colors.text.primary,
  },
  deletedText: {
    fontStyle: 'italic',
    opacity: 0.7,
  },
  errorText: {
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },

  // Attachments
  attachedImage: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.45,
    borderRadius: 8,
    marginBottom: 4,
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
    marginBottom: 4,
  },
  fileName: {
    color: colors.text.secondary,
    fontSize: 13,
  },

  // Reactions
  reactionBar: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  reactionBarRight: {
    justifyContent: 'flex-end',
  },
  reactionBarLeft: {
    justifyContent: 'flex-start',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    color: colors.text.muted,
    marginLeft: 2,
  },

  // Typing indicator
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.muted,
  },
  typingDot1: { opacity: 0.4 },
  typingDot2: { opacity: 0.6 },
  typingDot3: { opacity: 0.8 },
  typingText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },

  // Input
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  replyAccent: {
    width: 3,
    height: '100%',
    backgroundColor: colors.primary.main,
    borderRadius: 2,
    marginRight: 10,
  },
  replyContent: {
    flex: 1,
  },
  replyAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary.main,
    marginBottom: 1,
  },
  replyText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  replyClear: {
    padding: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    backgroundColor: colors.background.secondary,
    gap: 6,
  },
  attachButton: {
    padding: 8,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.main,
  },
  sendButtonDisabled: {
    backgroundColor: colors.background.tertiary,
  },

  // Context menu
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    padding: 12,
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 320,
  },
  quickReactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  reactionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionButtonText: {
    fontSize: 20,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border.primary,
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  menuItemText: {
    color: colors.text.primary,
    fontSize: 15,
  },
});

export default ChatScreen;
