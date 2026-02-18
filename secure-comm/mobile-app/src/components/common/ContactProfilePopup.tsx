/**
 * ContactProfilePopup — Full-featured contact profile modal.
 * Mirrors web's ContactProfilePopup.tsx with accent gradients,
 * verification badges, E2E info panel, social links, and 3D avatar effects.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  Linking,
  Dimensions,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { showMessage } from 'react-native-flash-message';
import LinearGradient from 'react-native-linear-gradient';

import { colors } from '../../theme/colors';
import { profileAPI, Profile } from '../../services/profileApi';
import { TiltAvatar } from '../motion/TiltAvatar';
import { GlassCard } from '../motion/Glassmorphism';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ContactProfilePopupProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  userId?: number;
  isOnline?: boolean;
  publicKey?: string;
  onReport?: () => void;
  onBlock?: () => void;
}

const ContactProfilePopup: React.FC<ContactProfilePopupProps> = ({
  isOpen,
  onClose,
  username,
  userId,
  isOnline,
  publicKey,
  onReport,
  onBlock,
}) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slideAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (isOpen && userId) {
      fetchProfile();
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [isOpen, userId]);

  const fetchProfile = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await profileAPI.getProfile(userId);
      setProfile(data);
    } catch (e) {
      setError('Failed to load profile');
      setProfile({
        user_id: userId,
        username,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_blocked: false,
        is_friend: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const truncateKey = (key: string) => {
    if (key.length <= 16) return key;
    return `${key.slice(0, 8)}...${key.slice(-8)}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [
                { scale: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
              opacity: slideAnim,
            },
          ]}
        >
          {/* Gradient Header Banner */}
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6', '#06B6D4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBanner}
          >
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Icon name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <TiltAvatar maxTilt={15} scale={1.05}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {username.charAt(0).toUpperCase()}
                  </Text>
                  {/* Online indicator */}
                  {isOnline !== undefined && (
                    <View style={[styles.onlineDot, { backgroundColor: isOnline ? colors.online : colors.offline }]} />
                  )}
                </View>
              </TiltAvatar>
              <Text style={styles.username}>{profile?.display_name || username}</Text>
              <Text style={styles.handle}>@{username}</Text>
            </View>

            {/* Badges */}
            <View style={styles.badgeRow}>
              {profile?.is_friend && (
                <View style={[styles.badge, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                  <Icon name="people" size={14} color="#10B981" />
                  <Text style={[styles.badgeText, { color: '#10B981' }]}>Friend</Text>
                </View>
              )}
              {profile?.emoji_badge && (
                <View style={[styles.badge, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                  <Text style={styles.emojiText}>{profile.emoji_badge}</Text>
                </View>
              )}
              {profile?.verification_badges && profile.verification_badges.length > 0 && (
                <View style={[styles.badge, { backgroundColor: 'rgba(6, 182, 212, 0.1)' }]}>
                  <Icon name="shield-checkmark" size={14} color="#06B6D4" />
                  <Text style={[styles.badgeText, { color: '#06B6D4' }]}>Verified</Text>
                </View>
              )}
            </View>

            {/* Status Message */}
            {profile?.status_message && (
              <View style={styles.statusSection}>
                <Text style={styles.statusMessage}>"{profile.status_message}"</Text>
              </View>
            )}

            {/* Bio */}
            {profile?.bio && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            )}

            {/* Metadata */}
            <View style={styles.metadataSection}>
              {profile?.location_city && (
                <View style={styles.metadataItem}>
                  <Icon name="location-outline" size={16} color={colors.text.muted} />
                  <Text style={styles.metadataText}>{profile.location_city}</Text>
                </View>
              )}
              {profile?.birthday && (
                <View style={styles.metadataItem}>
                  <Icon name="calendar-outline" size={16} color={colors.text.muted} />
                  <Text style={styles.metadataText}>{profile.birthday}</Text>
                </View>
              )}
              {profile?.website && (
                <TouchableOpacity
                  style={styles.metadataItem}
                  onPress={() => Linking.openURL(profile.website!)}
                >
                  <Icon name="globe-outline" size={16} color={colors.primary.main} />
                  <Text style={[styles.metadataText, { color: colors.primary.main }]}>{profile.website}</Text>
                </TouchableOpacity>
              )}
              {profile?.pronouns && (
                <View style={styles.metadataItem}>
                  <Icon name="person-outline" size={16} color={colors.text.muted} />
                  <Text style={styles.metadataText}>{profile.pronouns}</Text>
                </View>
              )}
            </View>

            {/* Social Links */}
            {profile?.social_links && Object.keys(profile.social_links).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Social Links</Text>
                {Object.entries(profile.social_links).map(([platform, url]) => (
                  <TouchableOpacity
                    key={platform}
                    style={styles.socialLink}
                    onPress={() => Linking.openURL(url)}
                  >
                    <Icon name="link-outline" size={16} color={colors.primary.main} />
                    <Text style={styles.socialLinkText}>{platform}</Text>
                    <Icon name="open-outline" size={14} color={colors.text.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* E2E Encryption Info */}
            <GlassCard>
              <View style={styles.encryptionPanel}>
                <View style={styles.encryptionHeader}>
                  <Icon name="shield-checkmark" size={20} color="#06B6D4" />
                  <Text style={styles.encryptionTitle}>End-to-End Encrypted</Text>
                </View>
                <Text style={styles.encryptionDesc}>
                  Messages are secured with X25519 + AES-256-GCM encryption
                </Text>
                {publicKey && (
                  <View style={styles.keyDisplay}>
                    <Text style={styles.keyLabel}>Public Key</Text>
                    <Text style={styles.keyValue}>{truncateKey(publicKey)}</Text>
                  </View>
                )}
              </View>
            </GlassCard>

            {/* Actions */}
            <View style={styles.actionsSection}>
              {onReport && (
                <TouchableOpacity style={styles.actionButton} onPress={onReport}>
                  <Icon name="flag-outline" size={18} color={colors.status.warning} />
                  <Text style={[styles.actionText, { color: colors.status.warning }]}>Report</Text>
                </TouchableOpacity>
              )}
              {onBlock && (
                <TouchableOpacity style={styles.actionButton} onPress={onBlock}>
                  <Icon name="ban-outline" size={18} color={colors.status.error} />
                  <Text style={[styles.actionText, { color: colors.status.error }]}>Block</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Joined date */}
            {profile?.created_at && (
              <Text style={styles.joinedDate}>
                Joined {formatDate(profile.created_at)}
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: SCREEN_WIDTH - 48,
    maxHeight: '85%',
    backgroundColor: colors.background.secondary,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  headerBanner: {
    height: 100,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.background.secondary,
    shadowColor: colors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.background.secondary,
  },
  username: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 12,
  },
  handle: {
    fontSize: 14,
    color: colors.text.muted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emojiText: {
    fontSize: 16,
  },
  statusSection: {
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  statusMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  metadataSection: {
    marginTop: 16,
    gap: 8,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metadataText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  socialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  socialLinkText: {
    fontSize: 14,
    color: colors.primary.main,
    flex: 1,
    textTransform: 'capitalize',
  },
  encryptionPanel: {
    padding: 16,
  },
  encryptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  encryptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#06B6D4',
  },
  encryptionDesc: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
  keyDisplay: {
    marginTop: 12,
    backgroundColor: colors.background.primary,
    padding: 12,
    borderRadius: 8,
  },
  keyLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 4,
  },
  keyValue: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.text.secondary,
    letterSpacing: 1,
  },
  actionsSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginTop: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.background.primary,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  joinedDate: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 20,
  },
});

export default ContactProfilePopup;
