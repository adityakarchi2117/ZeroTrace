/**
 * Privacy Settings Screen
 * Granular privacy controls for profile and activity visibility
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { profileAPI, PrivacySettings, PrivacySettingsUpdate } from '../../services/profileApi';

type VisibilityLevel = 'everyone' | 'friends' | 'nobody';

interface PrivacySetting {
  key: keyof PrivacySettings;
  icon: string;
  label: string;
  description: string;
}

const visibilitySettings: PrivacySetting[] = [
  {
    key: 'profile_visibility',
    icon: 'person',
    label: 'Profile Visibility',
    description: 'Who can see your profile',
  },
  {
    key: 'avatar_visibility',
    icon: 'image',
    label: 'Profile Photo',
    description: 'Who can see your profile photo',
  },
  {
    key: 'last_seen_visibility',
    icon: 'time',
    label: 'Last Seen',
    description: 'Who can see when you were last online',
  },
  {
    key: 'online_visibility',
    icon: 'radio-button-on',
    label: 'Online Status',
    description: 'Who can see when you\'re online',
  },
  {
    key: 'typing_visibility',
    icon: 'create',
    label: 'Typing Indicator',
    description: 'Who can see when you\'re typing',
  },
  {
    key: 'read_receipts_visibility',
    icon: 'checkmark-done',
    label: 'Read Receipts',
    description: 'Who can see when you\'ve read messages',
  },
];

const PrivacySettingsScreen: React.FC = () => {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [discoveryOptIn, setDiscoveryOptIn] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await profileAPI.getPrivacySettings();
      setSettings(data);
      setDiscoveryOptIn(data.discovery_opt_in);
    } catch (err) {
      console.error('Failed to load privacy settings:', err);
      Alert.alert('Error', 'Failed to load privacy settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: keyof PrivacySettings, value: VisibilityLevel) => {
    if (!settings || saving) return;

    const previousSettings = { ...settings };
    // Optimistic update
    setSettings({ ...settings, [key]: value });

    try {
      setSaving(true);
      const update: PrivacySettingsUpdate = { [key]: value };
      const updatedSettings = await profileAPI.updatePrivacySettings(update);
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to update privacy setting:', err);
      setSettings(previousSettings); // Revert on error
      Alert.alert('Error', 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  const updateDiscoveryOptIn = async (value: boolean) => {
    try {
      setDiscoveryOptIn(value);
      const update: PrivacySettingsUpdate = { discovery_opt_in: value };
      const updatedSettings = await profileAPI.updatePrivacySettings(update);
      setSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to update discovery setting:', err);
      Alert.alert('Error', 'Failed to update setting');
      setDiscoveryOptIn(!value); // Revert on error
    }
  };

  const renderVisibilityPicker = (setting: PrivacySetting) => {
    if (!settings) return null;

    const currentValue = settings[setting.key] as VisibilityLevel;
    const options: { value: VisibilityLevel; label: string; icon: string }[] = [
      { value: 'everyone', label: 'Everyone', icon: 'globe' },
      { value: 'friends', label: 'Friends', icon: 'people' },
      { value: 'nobody', label: 'Nobody', icon: 'eye-off' },
    ];

    return (
      <GlassCard key={setting.key} style={styles.settingCard}>
        <View style={styles.settingHeader}>
          <View style={styles.settingInfo}>
            <View style={styles.iconContainer}>
              <Icon name={setting.icon} size={22} color={colors.primary.main} />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>{setting.label}</Text>
              <Text style={styles.settingDescription}>{setting.description}</Text>
            </View>
          </View>
        </View>

        <View style={styles.optionsRow}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                currentValue === option.value && styles.optionButtonActive,
              ]}
              onPress={() => updateSetting(setting.key, option.value)}
            >
              <Icon
                name={option.icon}
                size={20}
                color={
                  currentValue === option.value
                    ? colors.primary.main
                    : colors.text.secondary
                }
              />
              <Text
                style={[
                  styles.optionLabel,
                  currentValue === option.value && styles.optionLabelActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>
    );
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
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Privacy Settings</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Info banner */}
        <GlassCard style={styles.infoBanner}>
          <Icon name="shield-checkmark" size={32} color={colors.primary.main} />
          <Text style={styles.infoBannerText}>
            Control who can see your profile information and activity. Your messages are
            always end-to-end encrypted.
          </Text>
        </GlassCard>

        {/* Visibility settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility Controls</Text>
          {visibilitySettings.map(renderVisibilityPicker)}
        </View>

        {/* Discovery settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discovery</Text>
          
          <GlassCard style={styles.settingCard}>
            <View style={styles.switchRow}>
              <View style={styles.settingInfo}>
                <View style={styles.iconContainer}>
                  <Icon name="search" size={22} color={colors.primary.main} />
                </View>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Allow Discovery</Text>
                  <Text style={styles.settingDescription}>
                    Let others find you by username or email
                  </Text>
                </View>
              </View>
              <Switch
                value={discoveryOptIn}
                onValueChange={updateDiscoveryOptIn}
                trackColor={{
                  false: colors.background.secondary,
                  true: colors.primary.main + '80',
                }}
                thumbColor={discoveryOptIn ? colors.primary.main : colors.text.disabled}
              />
            </View>
          </GlassCard>
        </View>

        {/* Advanced privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
          
          <GlassCard style={styles.settingCard}>
            <TouchableOpacity style={styles.advancedOption}>
              <View style={styles.settingInfo}>
                <View style={styles.iconContainer}>
                  <Icon name="document-text" size={22} color={colors.primary.main} />
                </View>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Field-Level Privacy</Text>
                  <Text style={styles.settingDescription}>
                    Set custom visibility for each profile field
                  </Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </GlassCard>

          <GlassCard style={styles.settingCard}>
            <TouchableOpacity style={styles.advancedOption}>
              <View style={styles.settingInfo}>
                <View style={styles.iconContainer}>
                  <Icon name="ban" size={22} color={colors.status.error} />
                </View>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Blocked Users</Text>
                  <Text style={styles.settingDescription}>
                    Manage blocked users list
                  </Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </GlassCard>

          <GlassCard style={styles.settingCard}>
            <TouchableOpacity style={styles.advancedOption}>
              <View style={styles.settingInfo}>
                <View style={styles.iconContainer}>
                  <Icon name="download" size={22} color={colors.primary.main} />
                </View>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Export Profile Data</Text>
                  <Text style={styles.settingDescription}>
                    Download your profile information (GDPR)
                  </Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </GlassCard>
        </View>

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
  infoBanner: {
    margin: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  settingCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
  },
  settingHeader: {
    marginBottom: 16,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.background.secondary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonActive: {
    backgroundColor: colors.primary.main + '20',
    borderColor: colors.primary.main,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  optionLabelActive: {
    color: colors.primary.main,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  advancedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomSpacer: {
    height: 40,
  },
});

export default PrivacySettingsScreen;
