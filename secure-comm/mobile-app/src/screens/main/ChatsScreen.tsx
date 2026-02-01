/**
 * Chats Screen with Glassmorphism and 3D Effects
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { colors } from '../../theme/colors';
import { Glassmorphism, TiltCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { contactsAPI } from '../../services/api';

interface Conversation {
  user_id: number;
  username: string;
  last_message_time?: string;
  last_message_preview?: string;
  unread_count: number;
  is_online: boolean;
}

const ChatsScreen: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadConversations = async () => {
    try {
      const response = await contactsAPI.getConversations();
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TiltCard style={styles.conversationCard}>
      <TouchableOpacity style={styles.conversationContent}>
        {/* Avatar with 3D Tilt */}
        <TiltAvatar style={styles.avatarContainer} maxTilt={10} scale={1.05}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.username.charAt(0).toUpperCase()}
            </Text>
            {item.is_online && <View style={styles.onlineIndicator} />}
          </View>
        </TiltAvatar>

        {/* Conversation Info */}
        <View style={styles.conversationInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.username}>{item.username}</Text>
            {item.last_message_time && (
              <Text style={styles.time}>{item.last_message_time}</Text>
            )}
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {item.last_message_preview || 'No messages yet'}
          </Text>
        </View>

        {/* Unread Badge */}
        {item.unread_count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    </TiltCard>
  );

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
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with Glassmorphism */}
      <Glassmorphism style={styles.header} blur="lg">
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity style={styles.newChatButton}>
          <Icon name="create-outline" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </Glassmorphism>

      {/* Conversations List */}
      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.user_id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  newChatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  conversationCard: {
    marginBottom: 8,
  },
  conversationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.inverse,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
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
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  time: {
    fontSize: 12,
    color: colors.text.muted,
  },
  preview: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
  },
});

export default ChatsScreen;
