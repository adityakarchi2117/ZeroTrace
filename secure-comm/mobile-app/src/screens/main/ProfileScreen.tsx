/**
 * Profile Screen with Glassmorphism and 3D Effects
 * Displays user profile information with privacy-aware visibility
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { profileAPI, Profile } from '../../services/profileApi';
import { useAuthStore } from '../../store/authStore';

type RootStackParamList = {
  Profile: { userId?: number };
  EditProfile: undefined;
  PrivacySettings: undefined;
};

type ProfileScreenRouteProp = RouteProp<RootStackParamList, 'Profile'>;
type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Profile'>;

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const { user: currentUser } = useAuthStore();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine if viewing own profile or another user's
  const targetUserId = route.params?.userId || currentUser?.id;
  const isOwnProfile = targetUserId === currentUser?.id;

  useEffect(() => {
    loadProfile();
  }, [targetUserId]);

  const loadProfile = async () => {
    if (!targetUserId) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await profileAPI.getProfile(targetUserId);
      setProfile(data);
    } catch (err: any) {
      console.error('Failed to load profile');
      setError(err.response?.data?.detail || 'Failed to load profile');
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async () => {
    if (!profile || isOwnProfile) return;

    Alert.alert(
      'Block User',
      `Are you sure you want to block ${profile.display_name || profile.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await profileAPI.blockUser(profile.username);
              Alert.alert('Success', 'User blocked successfully');
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', 'Failed to block user');
            }
          },
        },
      ]
    );
  };

  const renderSocialLink = (platform: string, url: string) => {
    const icons: Record<string, string> = {
      twitter: 'logo-twitter',
      github: 'logo-github',
      linkedin: 'logo-linkedin',
      instagram: 'logo-instagram',
      facebook: 'logo-facebook',
    };

    return (
      <TouchableOpacity
        key={platform}
        style={styles.socialButton}
        onPress={() => {
          try {
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
              Linking.openURL(parsed.href);
            }
          } catch {
            // Invalid URL, do nothing
          }
        }}
        accessibilityLabel={`Open ${platform} profile`}
        accessibilityRole="link"
      >
        <Icon name={icons[platform.toLowerCase()] || 'link'} size={24} color={colors.primary.main} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <Glassmorphism>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </Glassmorphism>
    );
  }

  if (error || !profile) {
    return (
      <Glassmorphism>
        <View style={styles.centerContainer}>
          <Icon name="alert-circle" size={64} color={colors.status.error} />
          <Text style={styles.errorText}>{error || 'Profile not found'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </Glassmorphism>
    );
  }

  return (
    <Glassmorphism>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={styles.bannerContainer}>
          {profile.banner_url ? (
            <Image source={{ uri: profile.banner_url }} style={styles.banner} />
          ) : (
            <LinearGradient
              colors={[colors.primary.main, colors.secondary.main]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.banner}
            />
          )}
        </View>

        {/* Avatar and basic info */}
        <View style={styles.headerSection}>
          <TiltAvatar
            source={
              profile.avatar_url
                ? { uri: profile.avatar_url }
                : require('../../assets/default-avatar.png')
            }
            size={120}
            style={styles.avatar}
          />
          
          <Text style={styles.displayName}>
            {profile.display_name || profile.username}
          </Text>
          
          {profile.display_name && (
            <Text style={styles.username}>@{profile.username}</Text>
          )}

          {profile.pronouns && (
            <Text style={styles.pronouns}>({profile.pronouns})</Text>
          )}

          {profile.emoji_badge && (
            <Text style={styles.emojiBadge}>{profile.emoji_badge}</Text>
          )}

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {isOwnProfile ? (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => navigation.navigate('EditProfile')}
                >
                  <Icon name="create-outline" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Edit Profile</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('PrivacySettings')}
                >
                  <Icon name="shield-checkmark-outline" size={20} color={colors.primary.main} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    // Navigate to chat with this user
                    navigation.goBack();
                  }}
                  accessibilityLabel={`Message ${profile.display_name || profile.username}`}
                  accessibilityRole="button"
                >
                  <Icon name="chatbubble-outline" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Message</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleBlockUser}
                >
                  <Icon name="ban-outline" size={20} color={colors.status.error} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Status message */}
        {profile.status_message && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="chatbox-ellipses" size={20} color={colors.primary.main} />
              <Text style={styles.sectionTitle}>Status</Text>
            </View>
            <Text style={styles.statusMessage}>{profile.status_message}</Text>
          </GlassCard>
        )}

        {/* Bio */}
        {profile.bio && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="information-circle" size={20} color={colors.primary.main} />
              <Text style={styles.sectionTitle}>About</Text>
            </View>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </GlassCard>
        )}

        {/* Details */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="list" size={20} color={colors.primary.main} />
            <Text style={styles.sectionTitle}>Details</Text>
          </View>

          {profile.location_city && (
            <View style={styles.detailRow}>
              <Icon name="location" size={18} color={colors.text.secondary} />
              <Text style={styles.detailText}>{profile.location_city}</Text>
            </View>
          )}

          {profile.website && (
            <View style={styles.detailRow}>
              <Icon name="globe" size={18} color={colors.text.secondary} />
              <Text style={styles.detailLink}>{profile.website}</Text>
            </View>
          )}

          {profile.birthday && (
            <View style={styles.detailRow}>
              <Icon name="calendar" size={18} color={colors.text.secondary} />
              <Text style={styles.detailText}>
                {new Date(profile.birthday).toLocaleDateString()}
              </Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Icon name="time" size={18} color={colors.text.secondary} />
            <Text style={styles.detailText}>
              Joined {new Date(profile.created_at).toLocaleDateString()}
            </Text>
          </View>
        </GlassCard>

        {/* Social links */}
        {profile.social_links && Object.keys(profile.social_links).length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="share-social" size={20} color={colors.primary.main} />
              <Text style={styles.sectionTitle}>Social Links</Text>
            </View>
            <View style={styles.socialLinks}>
              {Object.entries(profile.social_links).map(([platform, url]) =>
                renderSocialLink(platform, url)
              )}
            </View>
          </GlassCard>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Glassmorphism>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text.primary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.status.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary.main,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bannerContainer: {
    height: 200,
    width: '100%',
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  headerSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: -60,
  },
  avatar: {
    marginBottom: 16,
    borderWidth: 4,
    borderColor: colors.background.glass,
  },
  displayName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  pronouns: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  emojiBadge: {
    fontSize: 32,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary.main,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background.glass,
  },
  section: {
    margin: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  statusMessage: {
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.text.primary,
  },
  bioText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.primary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  detailText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  detailLink: {
    fontSize: 15,
    color: colors.primary.main,
    textDecorationLine: 'underline',
  },
  socialLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});

export default ProfileScreen;
