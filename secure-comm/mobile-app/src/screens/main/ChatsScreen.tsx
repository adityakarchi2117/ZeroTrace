/**
 * ZeroTrace Enhanced Chats List Screen
 * Real-time conversation list with WebSocket-powered updates:
 * - Online status indicators
 * - Typing indicators
 * - Delivery/read status
 * - Unread badges
 * - Search
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { colors } from '../../theme/colors';
import { Glassmorphism, TiltCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { useChatStore, Conversation } from '../../store/chatStore';

const ChatsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Store
  const conversations = useChatStore((s) => s.conversations);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const pendingRequests = useChatStore((s) => s.pendingRequests);

  // Load on focus
  useFocusEffect(
    useCallback(() => {
      loadConversations().finally(() => setLoading(false));
    }, [loadConversations])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        c.display_name?.toLowerCase().includes(q) ||
        c.last_message_preview?.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const formatTime = (timestamp?: string): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const isTyping = typingUsers.get(item.username) || false;
    const isOnline = onlineUsers.has(item.user_id) || item.is_online;

    return (
      <TiltCard style={styles.conversationCard}>
        <TouchableOpacity
          style={styles.conversationContent}
          onPress={() =>
            navigation.navigate('Chat', {
              userId: item.user_id,
              username: item.username,
            })
          }
          activeOpacity={0.7}
        >
          {/* Avatar */}
          <TiltAvatar style={styles.avatarContainer} maxTilt={10} scale={1.05}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.display_name || item.username).charAt(0).toUpperCase()}
              </Text>
              {isOnline && <View style={styles.onlineIndicator} />}
            </View>
          </TiltAvatar>

          {/* Info */}
          <View style={styles.conversationInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username} numberOfLines={1}>
                {item.display_name || item.username}
              </Text>
              {item.last_message_time && (
                <Text style={[
                  styles.time,
                  item.unread_count > 0 && styles.timeUnread,
                ]}>
                  {formatTime(item.last_message_time)}
                </Text>
              )}
            </View>
            <View style={styles.previewRow}>
              <Text style={[
                styles.preview,
                item.unread_count > 0 && styles.previewUnread,
              ]} numberOfLines={1}>
                {isTyping
                  ? '✍️ typing...'
                  : item.last_message_preview || 'No messages yet'}
              </Text>
            </View>
          </View>

          {/* Unread Badge */}
          {item.unread_count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </TiltCard>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <TiltAvatar maxTilt={20} scale={1.1}>
        <View style={styles.emptyIcon}>
          <Icon name="chatbubbles-outline" size={48} color={colors.primary.main} />
        </View>
      </TiltAvatar>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySubtitle}>
        Start chatting with your contacts securely
      </Text>
      <TouchableOpacity
        style={styles.startChatButton}
        onPress={() => navigation.navigate('AddContact')}
      >
        <Icon name="add" size={18} color={colors.text.inverse} />
        <Text style={styles.startChatButtonText}>Start a Conversation</Text>
      </TouchableOpacity>
    </View>
  );

  const pendingCount = (pendingRequests?.total_incoming || 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Glassmorphism style={styles.header} blur="lg">
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Chats</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowSearch(!showSearch)}
            >
              <Icon
                name={showSearch ? 'close' : 'search-outline'}
                size={22}
                color={colors.text.primary}
              />
            </TouchableOpacity>

            {pendingCount > 0 && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => navigation.navigate('PendingRequests')}
              >
                <Icon name="people-outline" size={22} color={colors.text.primary} />
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.newChatButton}
              onPress={() => navigation.navigate('AddContact')}
            >
              <Icon name="create-outline" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar (expandable) */}
        {showSearch && (
          <View style={styles.searchContainer}>
            <Icon name="search" size={16} color={colors.text.muted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search conversations..."
              placeholderTextColor={colors.text.muted}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Icon name="close-circle" size={16} color={colors.text.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </Glassmorphism>

      {/* Conversations List */}
      <FlatList
        data={filteredConversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.user_id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary.main}
          />
        }
        ListEmptyComponent={!loading ? renderEmptyState : null}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.status.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 14,
    padding: 0,
  },

  // List
  listContent: {
    padding: 16,
    gap: 8,
  },
  conversationCard: {
    marginBottom: 4,
  },
  conversationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.inverse,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.status.success,
    borderWidth: 2,
    borderColor: colors.background.secondary,
  },
  conversationInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: colors.text.muted,
  },
  timeUnread: {
    color: colors.primary.main,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    fontSize: 13,
    color: colors.text.secondary,
    flex: 1,
  },
  previewUnread: {
    color: colors.text.primary,
    fontWeight: '500',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.inverse,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  startChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary.main,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  startChatButtonText: {
    color: colors.text.inverse,
    fontWeight: '600',
    fontSize: 14,
  },
});

export default ChatsScreen;
