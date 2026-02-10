/**
 * Edit Profile Screen
 * Allows users to update their profile information
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { profileAPI, ProfileUpdate } from '../../services/profileApi';
import { useAuthStore } from '../../store/authStore';

const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [emojiBadge, setEmojiBadge] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [website, setWebsite] = useState('');
  const [birthday, setBirthday] = useState('');

  // Social links
  const [twitter, setTwitter] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');

  useEffect(() => {
    loadProfile();
  }, [user?.id]);

  const loadProfile = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const profile = await profileAPI.getProfile(user.id);

      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      setStatusMessage(profile.status_message || '');
      setPronouns(profile.pronouns || '');
      setEmojiBadge(profile.emoji_badge || '');
      setLocationCity(profile.location_city || '');
      setWebsite(profile.website || '');
      setBirthday(profile.birthday || '');
      setAvatarUri(profile.avatar_url || null);

      if (profile.social_links) {
        setTwitter(profile.social_links.twitter || '');
        setGithub(profile.social_links.github || '');
        setLinkedin(profile.social_links.linkedin || '');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1024,
        maxHeight: 1024,
      });

      if (result.didCancel || !result.assets || !result.assets[0]?.uri) return;

      const asset = result.assets[0];
      setAvatarUri(asset.uri || null);

      // Upload immediately
      try {
        const file = {
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          name: asset.fileName || 'avatar.jpg',
        };

        await profileAPI.uploadPhoto(file);
        Alert.alert('Success', 'Profile photo updated');
      } catch (err) {
        console.error('Failed to upload photo:', err);
        Alert.alert('Error', 'Failed to upload photo');
      }
    } catch (err) {
      console.error('Image picker error:', err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const data: ProfileUpdate = {
        display_name: displayName || undefined,
        bio: bio || undefined,
        status_message: statusMessage || undefined,
        pronouns: pronouns || undefined,
        emoji_badge: emojiBadge || undefined,
        location_city: locationCity || undefined,
        website: website || undefined,
        birthday: birthday || undefined,
        social_links: {
          twitter: twitter || '',
          github: github || '',
          linkedin: linkedin || '',
        },
      };

      await profileAPI.updateProfile(data);
      Alert.alert('Success', 'Profile updated successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      Alert.alert('Error', err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Glassmorphism>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
        </View>
      </Glassmorphism>
    );
  }

  return (
    <Glassmorphism>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close" accessibilityRole="button">
            <Icon name="close" size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} accessibilityLabel="Save profile" accessibilityRole="button">
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary.main} />
            ) : (
              <Icon name="checkmark" size={28} color={colors.primary.main} />
            )}
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TiltAvatar
            source={
              avatarUri
                ? { uri: avatarUri }
                : require('../../assets/default-avatar.png')
            }
            size={100}
          />
          <TouchableOpacity style={styles.changePhotoButton} onPress={handlePickImage}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Form fields */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor={colors.text.disabled}
              maxLength={100}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself"
              placeholderTextColor={colors.text.disabled}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <Text style={styles.charCount}>{bio.length}/500</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status Message</Text>
            <TextInput
              style={styles.input}
              value={statusMessage}
              onChangeText={setStatusMessage}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.text.disabled}
              maxLength={160}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pronouns</Text>
            <TextInput
              style={styles.input}
              value={pronouns}
              onChangeText={setPronouns}
              placeholder="e.g., they/them"
              placeholderTextColor={colors.text.disabled}
              maxLength={32}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Emoji Badge</Text>
            <TextInput
              style={styles.input}
              value={emojiBadge}
              onChangeText={setEmojiBadge}
              placeholder="🚀"
              placeholderTextColor={colors.text.disabled}
              maxLength={16}
            />
          </View>
        </GlassCard>

        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Location & Contact</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={locationCity}
              onChangeText={setLocationCity}
              placeholder="Your city"
              placeholderTextColor={colors.text.disabled}
              maxLength={120}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Website</Text>
            <TextInput
              style={styles.input}
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yourwebsite.com"
              placeholderTextColor={colors.text.disabled}
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Birthday</Text>
            <TextInput
              style={styles.input}
              value={birthday}
              onChangeText={setBirthday}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.text.disabled}
            />
          </View>
        </GlassCard>

        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>Social Links</Text>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Icon name="logo-twitter" size={20} color={colors.primary.main} />
              <Text style={styles.label}>Twitter</Text>
            </View>
            <TextInput
              style={styles.input}
              value={twitter}
              onChangeText={setTwitter}
              placeholder="@username"
              placeholderTextColor={colors.text.disabled}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Icon name="logo-github" size={20} color={colors.primary.main} />
              <Text style={styles.label}>GitHub</Text>
            </View>
            <TextInput
              style={styles.input}
              value={github}
              onChangeText={setGithub}
              placeholder="username"
              placeholderTextColor={colors.text.disabled}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Icon name="logo-linkedin" size={20} color={colors.primary.main} />
              <Text style={styles.label}>LinkedIn</Text>
            </View>
            <TextInput
              style={styles.input}
              value={linkedin}
              onChangeText={setLinkedin}
              placeholder="username"
              placeholderTextColor={colors.text.disabled}
              autoCapitalize="none"
            />
          </View>
        </GlassCard>

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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  changePhotoButton: {
    marginTop: 12,
  },
  changePhotoText: {
    fontSize: 16,
    color: colors.primary.main,
    fontWeight: '600',
  },
  section: {
    margin: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.background.glass,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: colors.text.disabled,
    textAlign: 'right',
    marginTop: 4,
  },
  bottomSpacer: {
    height: 40,
  },
});

export default EditProfileScreen;
