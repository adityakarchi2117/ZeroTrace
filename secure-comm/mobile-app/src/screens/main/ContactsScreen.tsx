/**
 * Contacts Screen with Glassmorphism and 3D Effects
 * Enhanced with Friend Request System integration
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { showMessage } from 'react-native-flash-message';
import { useNavigation } from '@react-navigation/native';

import { colors } from '../../theme/colors';
import { Glassmorphism, TiltCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { contactsAPI } from '../../services/api';
import {
  friendAPI,
  TrustedContact,
  TrustLevel,
  formatFingerprint,
} from '../../services/friendApi';

// Legacy contact interface for backward compatibility
interface LegacyContact {
  id: number;
  contact_id: number;
  contact_username: string;
  contact_email: string;
  is_blocked: boolean;
  is_verified: boolean;
}

// Combined contact type
interface Contact extends Partial<LegacyContact> {
  id?: number;
  contact_id?: number;
  contact_user_id?: number;
  contact_username: string;
  contact_email?: string;
  public_key?: string;
  identity_key?: string;
  is_blocked?: boolean;
  is_verified?: boolean;
  trust_level?: TrustLevel;
  public_key_fingerprint?: string;
  nickname?: string;
  last_key_exchange?: string;
  created_at?: string;
}

const ContactsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [actionContactId, setActionContactId] = useState<number | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      // Try to load from new friend system first
      const trustedResponse = await friendAPI.getTrustedContacts();
      const trustedContacts: Contact[] = trustedResponse.data.map(tc => ({
        ...tc,
        id: tc.contact_user_id,
        contact_id: tc.contact_user_id,
      }));

      // Try to get pending requests count
      try {
        const pendingResponse = await friendAPI.getPendingRequests();
        setPendingCount(pendingResponse.data.incoming?.length || pendingResponse.data.total_incoming || 0);
      } catch {
        setPendingCount(0);
      }

      // Fallback to legacy contacts if no trusted contacts
      if (trustedContacts.length === 0) {
        try {
          const legacyResponse = await contactsAPI.getContacts();
          setContacts(legacyResponse.data);
        } catch {
          setContacts([]);
        }
      } else {
        setContacts(trustedContacts);
      }
    } catch (error) {
      // Fallback to legacy API
      try {
        const response = await contactsAPI.getContacts();
        setContacts(response.data);
      } catch {
        console.error('Failed to load contacts:', error);
        setContacts([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Handle remove contact
  const handleRemoveContact = (contact: Contact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.contact_username} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => confirmRemoveContact(contact),
        },
      ]
    );
  };

  const confirmRemoveContact = async (contact: Contact) => {
    const contactId = contact.contact_user_id || contact.contact_id;
    if (!contactId) return;

    setActionContactId(contactId);
    try {
      await friendAPI.removeContact(contactId);
      showMessage({
        message: 'Contact Removed',
        type: 'success',
      });
      setContacts(prev => prev.filter(c =>
        (c.contact_user_id || c.contact_id) !== contactId
      ));
    } catch (error: any) {
      showMessage({
        message: 'Failed to remove contact',
        description: error.response?.data?.detail || 'Please try again',
        type: 'danger',
      });
    } finally {
      setActionContactId(null);
    }
  };

  // Handle block user
  const handleBlockUser = (contact: Contact) => {
    Alert.alert(
      'Block User',
      `Block ${contact.contact_username}? They won't be able to contact you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => confirmBlockUser(contact),
        },
      ]
    );
  };

  const confirmBlockUser = async (contact: Contact) => {
    const contactId = contact.contact_user_id || contact.contact_id;
    if (!contactId) return;

    setActionContactId(contactId);
    try {
      await friendAPI.blockUser({ user_id: contactId, reason: 'unwanted' as const });
      showMessage({
        message: 'User Blocked',
        type: 'info',
      });
      setContacts(prev => prev.filter(c =>
        (c.contact_user_id || c.contact_id) !== contactId
      ));
    } catch (error: any) {
      showMessage({
        message: 'Failed to block user',
        description: error.response?.data?.detail || 'Please try again',
        type: 'danger',
      });
    } finally {
      setActionContactId(null);
    }
  };

  // Navigate to chat
  const handleStartChat = (contact: Contact) => {
    navigation.navigate('Chat', {
      userId: contact.contact_user_id || contact.contact_id,
      username: contact.contact_username,
      publicKey: contact.public_key,
    });
  };

  // Get trust badge
  const getTrustBadge = (contact: Contact) => {
    if (contact.is_verified) {
      return { icon: 'checkmark-circle', color: colors.status.success };
    }
    if ((contact.trust_level as string) === 'high') {
      return { icon: 'shield-checkmark', color: colors.primary.main };
    }
    return null;
  };

  const filteredContacts = contacts.filter(contact =>
    contact.contact_username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderContact = ({ item }: { item: Contact }) => {
    const trustBadge = getTrustBadge(item);
    const contactId = item.contact_user_id || item.contact_id;
    const isProcessing = actionContactId === contactId;

    return (
      <TiltCard style={styles.contactCard}>
        <TouchableOpacity
          style={styles.contactContent}
          onPress={() => handleStartChat(item)}
          disabled={isProcessing}
        >
          {/* Avatar with 3D Tilt */}
          <TiltAvatar style={styles.avatarContainer} maxTilt={10} scale={1.05}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.contact_username.charAt(0).toUpperCase()}
              </Text>
              {trustBadge && (
                <View style={[styles.verifiedBadge, { backgroundColor: trustBadge.color }]}>
                  <Icon name={trustBadge.icon} size={10} color={colors.text.inverse} />
                </View>
              )}
            </View>
          </TiltAvatar>

          {/* Contact Info */}
          <View style={styles.contactInfo}>
            <Text style={styles.username}>{item.contact_username}</Text>
            {item.contact_email && (
              <Text style={styles.email}>{item.contact_email}</Text>
            )}
            {item.public_key_fingerprint && (
              <Text style={styles.fingerprint}>
                🔑 {formatFingerprint(item.public_key_fingerprint, true)}
              </Text>
            )}
            {item.trust_level && (
              <View style={[styles.trustLabel,
              (item.trust_level as string) === 'high' && styles.trustLabelHigh,
              (item.trust_level as string) === 'medium' && styles.trustLabelMedium,
              ]}>
                <Text style={styles.trustLabelText}>
                  {item.is_verified ? '✓ Verified' : item.trust_level}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {isProcessing ? (
              <ActivityIndicator size="small" color={colors.primary.main} />
            ) : (
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleStartChat(item)}
                >
                  <Icon name="chatbubble-outline" size={22} color={colors.primary.main} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRemoveContact(item)}
                >
                  <Icon name="person-remove-outline" size={22} color={colors.status.warning} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </TiltCard>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Glassmorphism */}
      <Glassmorphism style={styles.header} blur="lg">
        <Text style={styles.headerTitle}>Contacts</Text>
        <View style={styles.headerActions}>
          {/* Pending requests badge */}
          <TouchableOpacity
            style={styles.pendingButton}
            onPress={() => navigation.navigate('PendingRequests')}
          >
            <Icon name="mail-outline" size={24} color={colors.text.primary} />
            {pendingCount > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddContact')}
          >
            <Icon name="person-add-outline" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </Glassmorphism>

      {/* Search Bar with Glassmorphism */}
      <View style={styles.searchContainer}>
        <Glassmorphism style={styles.searchBar} blur="md">
          <Icon name="search" size={20} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor={colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </Glassmorphism>
      </View>

      {/* Contacts List */}
      <FlatList
        data={filteredContacts}
        renderItem={renderContact}
        keyExtractor={(item) =>
          String(item.id ?? item.contact_user_id ?? item.contact_id ?? item.contact_username)
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!loading && (
          <View style={styles.emptyContainer}>
            <TiltAvatar maxTilt={20} scale={1.1}>
              <View style={styles.emptyIcon}>
                <Icon name="people-outline" size={48} color={colors.primary.main} />
              </View>
            </TiltAvatar>
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptySubtitle}>
              Add contacts to start secure conversations
            </Text>
          </View>
        )}
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
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pendingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pendingBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.status.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    color: colors.text.inverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: colors.text.primary,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  contactCard: {
    marginBottom: 8,
  },
  contactContent: {
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
    backgroundColor: colors.secondary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.inverse,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.status.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background.secondary,
  },
  contactInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  fingerprint: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.text.muted,
    marginTop: 2,
  },
  trustLabel: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  trustLabelHigh: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  trustLabelMedium: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
  },
  trustLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
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

export default ContactsScreen;
