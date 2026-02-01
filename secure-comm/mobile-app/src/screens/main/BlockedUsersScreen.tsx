/**
 * Blocked Users Screen
 * View and manage blocked users
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Alert,
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { friendAPI, BlockedUser } from '../../services/friendApi';
import { colors } from '../../theme/colors';

interface BlockedUsersScreenProps {
  navigation: any;
}

export default function BlockedUsersScreen({ navigation }: BlockedUsersScreenProps) {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionUserId, setActionUserId] = useState<number | null>(null);

  // Load blocked users
  const loadBlockedUsers = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    try {
      const response = await friendAPI.getBlockedUsers();
      setBlockedUsers(response.data);
    } catch (error) {
      showMessage({
        message: 'Load Failed',
        description: 'Failed to load blocked users',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBlockedUsers();
  }, [loadBlockedUsers]);

  // Unblock user
  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      'Unblock User',
      `Unblock ${user.blocked_username}? They will be able to send you friend requests again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => confirmUnblock(user),
        },
      ]
    );
  };

  const confirmUnblock = async (user: BlockedUser) => {
    setActionUserId(user.blocked_user_id);
    try {
      await friendAPI.unblockUser(user.blocked_user_id);

      showMessage({
        message: 'User Unblocked',
        description: `${user.blocked_username} has been unblocked`,
        type: 'success',
      });

      setBlockedUsers(prev =>
        prev.filter(u => u.blocked_user_id !== user.blocked_user_id)
      );
    } catch (error: any) {
      showMessage({
        message: 'Unblock Failed',
        description: error.response?.data?.detail || 'Please try again',
        type: 'danger',
      });
    } finally {
      setActionUserId(null);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Render blocked user item
  const renderItem = ({ item }: { item: BlockedUser }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.blocked_username[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.userText}>
          <Text style={styles.username}>{item.blocked_username}</Text>
          <Text style={styles.blockedDate}>
            Blocked on {formatDate(item.blocked_at)}
          </Text>
          {item.reason && (
            <Text style={styles.reason} numberOfLines={1}>
              Reason: {item.reason}
            </Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => handleUnblock(item)}
        disabled={actionUserId === item.blocked_user_id}
      >
        {actionUserId === item.blocked_user_id ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={styles.unblockText}>Unblock</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Blocked Users</Text>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          🚫 Blocked users cannot send you friend requests or messages
        </Text>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          renderItem={renderItem}
          keyExtractor={(item) => item.blocked_user_id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                loadBlockedUsers(false);
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👍</Text>
              <Text style={styles.emptyText}>No blocked users</Text>
              <Text style={styles.emptySubtext}>
                Users you block will appear here
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  infoBanner: {
    backgroundColor: colors.surface,
    padding: 12,
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6b7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userText: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  blockedDate: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  reason: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  },
  unblockButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  unblockText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
