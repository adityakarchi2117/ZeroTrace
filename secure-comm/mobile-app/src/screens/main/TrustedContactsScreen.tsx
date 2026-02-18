/**
 * TrustedContactsScreen — Full trusted contacts management screen
 * Matches web's TrustedContactsList.tsx: filter tabs, expandable cards,
 * inline verification, remove, block actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import {
  friendAPI,
  TrustedContact,
  TrustLevel,
} from '../../services/friendApi';

// Enable layout animation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FilterTab = 'all' | 'verified' | 'unverified';

const TrustedContactsScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [verifyingContact, setVerifyingContact] = useState<TrustedContact | null>(null);
  const [fingerprintInput, setFingerprintInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setError(null);
    try {
      const resp = await friendAPI.getTrustedContacts();
      setContacts(resp.data);
    } catch (e) {
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadContacts();
  };

  const filteredContacts = contacts.filter((c) => {
    if (filter === 'verified') return c.is_verified;
    if (filter === 'unverified') return !c.is_verified;
    return true;
  });

  const countFor = (f: FilterTab) =>
    contacts.filter((c) =>
      f === 'all' ? true : f === 'verified' ? c.is_verified : !c.is_verified,
    ).length;

  const toggleExpand = (id: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  const handleVerify = (contact: TrustedContact) => {
    setVerifyingContact(contact);
    setFingerprintInput('');
  };

  const confirmVerification = async () => {
    if (!verifyingContact || !fingerprintInput.trim()) return;

    // Simple fingerprint comparison (case-insensitive, strip spaces)
    const normalise = (s: string) => s.replace(/[\s:]/g, '').toLowerCase();
    if (normalise(fingerprintInput) !== normalise(verifyingContact.public_key_fingerprint)) {
      setError('Fingerprint does not match! Keys may have changed.');
      return;
    }

    setProcessingId(verifyingContact.id);
    setError(null);
    try {
      await friendAPI.verifyContact({
        contact_user_id: verifyingContact.contact_user_id,
        verified_fingerprint: fingerprintInput.trim(),
      });
      setContacts((prev) =>
        prev.map((c) =>
          c.id === verifyingContact.id
            ? { ...c, is_verified: true, trust_level: 'verified' as TrustLevel }
            : c,
        ),
      );
      setVerifyingContact(null);
      showMessage({ message: 'Contact Verified!', type: 'success' });
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to verify contact');
    } finally {
      setProcessingId(null);
    }
  };

  const handleChat = (contact: TrustedContact) => {
    navigation.navigate('Chat', {
      userId: contact.contact_user_id,
      username: contact.contact_username,
    });
  };

  const handleRemove = (contact: TrustedContact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.nickname || contact.contact_username} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(contact.id);
            try {
              await friendAPI.removeContact(contact.contact_user_id);
              setContacts((prev) => prev.filter((c) => c.id !== contact.id));
              showMessage({ message: 'Contact removed', type: 'success' });
            } catch {
              showMessage({ message: 'Failed to remove contact', type: 'danger' });
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleBlock = (contact: TrustedContact) => {
    Alert.alert(
      'Block User',
      `Block ${contact.contact_username}? They won't be able to contact you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(contact.id);
            try {
              await friendAPI.blockUser({
                user_id: contact.contact_user_id,
                reason: 'other',
              });
              setContacts((prev) => prev.filter((c) => c.id !== contact.id));
              showMessage({ message: `Blocked ${contact.contact_username}`, type: 'success' });
            } catch {
              showMessage({ message: 'Failed to block user', type: 'danger' });
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const getTrustBadge = (contact: TrustedContact) => {
    if (contact.is_verified || contact.trust_level === 'trusted') {
      return (
        <View style={[styles.badge, styles.verifiedBadge]}>
          <Icon name="checkmark" size={10} color="#4ADE80" />
          <Text style={styles.verifiedBadgeText}>Verified</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.unverifiedBadge]}>
        <Icon name="warning" size={10} color="#FACC15" />
        <Text style={styles.unverifiedBadgeText}>Unverified</Text>
      </View>
    );
  };

  const renderContact = ({ item }: { item: TrustedContact }) => {
    const isExpanded = expandedId === item.id;
    const isProcessing = processingId === item.id;

    return (
      <View style={styles.contactCard}>
        <TouchableOpacity
          style={styles.contactHeader}
          onPress={() => toggleExpand(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.contactLeft}>
            <View
              style={[
                styles.contactAvatar,
                item.is_verified ? styles.avatarVerified : styles.avatarUnverified,
              ]}
            >
              <Text style={styles.contactAvatarText}>
                {item.contact_username[0].toUpperCase()}
              </Text>
            </View>
            <View>
              <View style={styles.nameRow}>
                <Text style={styles.contactName}>
                  {item.nickname || item.contact_username}
                </Text>
                {item.nickname && (
                  <Text style={styles.usernameTag}>@{item.contact_username}</Text>
                )}
              </View>
              {getTrustBadge(item)}
            </View>
          </View>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.text.muted}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Fingerprint */}
            <View style={styles.fingerprintBox}>
              <Text style={styles.fingerprintLabel}>Public Key Fingerprint</Text>
              <Text style={styles.fingerprintValue}>
                🔑 {item.public_key_fingerprint}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() => handleChat(item)}
              >
                <Text style={styles.chatBtnText}>💬 Chat</Text>
              </TouchableOpacity>

              {!item.is_verified && (
                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={() => handleVerify(item)}
                >
                  <Text style={styles.verifyBtnText}>✓ Verify</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(item)}
                disabled={isProcessing}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.blockBtn}
                onPress={() => handleBlock(item)}
                disabled={isProcessing}
              >
                <Text style={styles.blockBtnText}>Block</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>👥 Trusted Contacts</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'verified', 'unverified'] as FilterTab[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
            <Text style={styles.filterCount}>{countFor(f)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Icon name="close" size={16} color="#F87171" />
          </TouchableOpacity>
        </View>
      )}

      {/* Verification Modal Inline */}
      {verifyingContact && (
        <View style={styles.verifyModal}>
          <Text style={styles.verifyTitle}>
            🔐 Verify {verifyingContact.contact_username}
          </Text>
          <Text style={styles.verifyDesc}>
            Compare the fingerprint below with your contact's fingerprint shared via a
            secure channel.
          </Text>
          <View style={styles.fingerprintBox}>
            <Text style={styles.fingerprintLabel}>Their Key Fingerprint</Text>
            <Text style={styles.fingerprintValue}>
              {verifyingContact.public_key_fingerprint}
            </Text>
          </View>
          <TextInput
            style={styles.verifyInput}
            placeholder="Enter fingerprint to verify..."
            placeholderTextColor={colors.text.muted}
            value={fingerprintInput}
            onChangeText={setFingerprintInput}
            autoCapitalize="none"
          />
          <View style={styles.verifyActions}>
            <TouchableOpacity
              style={styles.verifyCancelBtn}
              onPress={() => setVerifyingContact(null)}
            >
              <Text style={styles.removeBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.verifyConfirmBtn,
                !fingerprintInput.trim() && { opacity: 0.4 },
              ]}
              onPress={confirmVerification}
              disabled={!fingerprintInput.trim() || processingId !== null}
            >
              {processingId ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={{ color: '#FFF', fontWeight: '600' }}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.main} />
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderContact}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary.main}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {contacts.length === 0
                  ? 'No trusted contacts yet. Send a friend request to get started!'
                  : `No ${filter} contacts found.`}
              </Text>
            </View>
          }
        />
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Icon name="lock-closed" size={12} color={colors.text.muted} />
        <Text style={styles.footerText}>
          Only verified contacts have confirmed key fingerprints.
        </Text>
      </View>
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
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    gap: 12,
  },
  backBtn: {
    marginRight: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  filterRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.background.tertiary,
    borderRadius: 12,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: '#3B82F6',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'capitalize',
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  filterCount: {
    fontSize: 11,
    color: colors.text.muted,
    opacity: 0.6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#F87171',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  contactCard: {
    backgroundColor: 'rgba(100, 116, 139, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.15)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  contactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarVerified: {
    backgroundColor: '#065F46',
  },
  avatarUnverified: {
    backgroundColor: '#374151',
  },
  contactAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  usernameTag: {
    fontSize: 11,
    color: colors.text.muted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  verifiedBadgeText: {
    fontSize: 10,
    color: '#4ADE80',
    fontWeight: '600',
  },
  unverifiedBadge: {
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
  },
  unverifiedBadgeText: {
    fontSize: 10,
    color: '#FACC15',
    fontWeight: '600',
  },
  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  fingerprintBox: {
    backgroundColor: colors.background.primary,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  fingerprintLabel: {
    fontSize: 10,
    color: colors.text.muted,
    marginBottom: 4,
  },
  fingerprintValue: {
    fontSize: 11,
    color: '#60A5FA',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chatBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
  },
  chatBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  verifyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderRadius: 10,
  },
  verifyBtnText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.background.tertiary,
    borderRadius: 10,
  },
  removeBtnText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  blockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
  },
  blockBtnText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    paddingBottom: 34,
  },
  footerText: {
    fontSize: 10,
    color: colors.text.muted,
  },
  // Inline verification modal
  verifyModal: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: 16,
  },
  verifyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  verifyDesc: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  verifyInput: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginBottom: 12,
  },
  verifyActions: {
    flexDirection: 'row',
    gap: 10,
  },
  verifyCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: colors.background.tertiary,
    borderRadius: 10,
    alignItems: 'center',
  },
  verifyConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    alignItems: 'center',
  },
});

export default TrustedContactsScreen;
