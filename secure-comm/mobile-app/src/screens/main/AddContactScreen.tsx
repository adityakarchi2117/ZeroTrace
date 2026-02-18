/**
 * Add Contact Screen
 * Search and send friend requests
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { useAuthStore } from '../../store/authStore';
import {
  friendAPI,
  UserSearchResult,
  computeKeyFingerprint,
  formatFingerprint,
} from '../../services/friendApi';
import { colors } from '../../theme/colors';

interface AddContactScreenProps {
  navigation: any;
}

export default function AddContactScreen({ navigation }: AddContactScreenProps) {
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  // Search users
  const handleSearch = useCallback(async () => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await friendAPI.searchUsers(searchQuery);
      setSearchResults(response.data);
    } catch (error: any) {
      if (error.response?.status === 429) {
        showMessage({
          message: 'Rate Limited',
          description: 'Please wait before searching again',
          type: 'warning',
        });
      } else {
        showMessage({
          message: 'Search Failed',
          description: 'Failed to search users',
          type: 'danger',
        });
      }
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Send friend request
  const handleSendRequest = async (targetUser: UserSearchResult) => {
    if (!user?.public_key) {
      showMessage({
        message: 'Keys Required',
        description: 'Please set up your encryption keys first',
        type: 'warning',
      });
      return;
    }

    setIsSending(targetUser.user_id);
    try {
      const fingerprint = computeKeyFingerprint(user.public_key);
      
      await friendAPI.sendFriendRequest({
        receiver_username: targetUser.username,
        sender_public_key_fingerprint: fingerprint,
        message: message || undefined,
      });

      showMessage({
        message: 'Request Sent',
        description: `Friend request sent to ${targetUser.username}`,
        type: 'success',
      });

      // Update local state
      setSearchResults(prev =>
        prev.map(u =>
          u.user_id === targetUser.user_id
            ? { ...u, has_pending_request: true }
            : u
        )
      );
      setMessage('');
    } catch (error: any) {
      showMessage({
        message: 'Request Failed',
        description: error.response?.data?.detail || 'Failed to send friend request',
        type: 'danger',
      });
    } finally {
      setIsSending(null);
    }
  };

  // Render search result item
  const renderItem = ({ item }: { item: UserSearchResult }) => (
    <View style={styles.resultItem}>
      <View style={styles.resultInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.username[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.resultText}>
          <Text style={styles.username}>{item.username}</Text>
          {item.public_key_fingerprint && (
            <Text style={styles.fingerprint}>
              🔑 {formatFingerprint(item.public_key_fingerprint, true)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.resultAction}>
        {item.is_contact ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>✓ Contact</Text>
          </View>
        ) : item.has_pending_request ? (
          <View style={[styles.statusBadge, styles.pendingBadge]}>
            <Text style={[styles.statusText, styles.pendingText]}>⏳ Pending</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleSendRequest(item)}
            disabled={isSending === item.user_id}
          >
            {isSending === item.user_id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>+ Add</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Contact</Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching || searchQuery.length < 2}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Message Input */}
        <TextInput
          style={styles.messageInput}
          placeholder="Add a message (optional)"
          placeholderTextColor="#666"
          value={message}
          onChangeText={setMessage}
          maxLength={200}
        />

        {/* QR Scanner Button */}
        <TouchableOpacity
          style={styles.qrButton}
          onPress={() => navigation.navigate('QRScanner')}
        >
          <Text style={styles.qrButtonText}>📷 Scan QR Code</Text>
        </TouchableOpacity>

        {/* Results */}
        <FlatList
          data={searchResults}
          renderItem={renderItem}
          keyExtractor={(item) => item.user_id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery.length >= 2
                  ? 'No users found'
                  : 'Enter at least 2 characters to search'}
              </Text>
            </View>
          }
        />

        {/* Security Note */}
        <View style={styles.securityNote}>
          <Text style={styles.securityText}>
            🔒 Friend requests include your public key fingerprint for secure key exchange.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: colors.primary.main,
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  searchButton: {
    backgroundColor: colors.primary.main,
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  messageInput: {
    marginHorizontal: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  qrButton: {
    margin: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderStyle: 'dashed',
  },
  qrButtonText: {
    color: colors.text.primary,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  resultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultText: {
    marginLeft: 12,
    flex: 1,
  },
  username: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  fingerprint: {
    color: colors.text.secondary,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  resultAction: {
    marginLeft: 8,
  },
  addButton: {
    backgroundColor: colors.primary.main,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  statusText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
  },
  pendingText: {
    color: '#eab308',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  securityNote: {
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  securityText: {
    color: colors.text.secondary,
    fontSize: 12,
    textAlign: 'center',
  },
});

