/**
 * Settings Screen with Glassmorphism and 3D Effects
 * Includes Account Management, Security Info, Key Fingerprint
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { generateFingerprint } from '../../utils/crypto';
import { apiClient } from '../../services/api';


interface SettingItem {
  id: string;
  icon: string;
  label: string;
  description?: string;
  color: string;
  hasSwitch?: boolean;
  isDanger?: boolean;
}

const settingsGroups: SettingItem[][] = [
  [
    { id: 'account', icon: 'person', label: 'Account', description: 'Manage your profile', color: colors.primary.main },
    { id: 'privacy', icon: 'shield-checkmark', label: 'Privacy & Security', description: 'Encryption settings', color: colors.status.success },
    { id: 'trusted_contacts', icon: 'people', label: 'Trusted Contacts', description: 'Verified contacts list', color: '#06B6D4' },
    { id: 'notifications', icon: 'notifications', label: 'Notifications', description: 'Message alerts', color: colors.status.warning, hasSwitch: true },
  ],
  [
    { id: 'appearance', icon: 'color-palette', label: 'Appearance', description: 'Theme and colors', color: colors.secondary.main },
    { id: 'storage', icon: 'folder', label: 'Storage & Data', description: 'Manage storage', color: colors.status.info },
    { id: 'devices', icon: 'phone-portrait', label: 'Linked Devices', description: 'Active sessions', color: colors.primary.main },
    { id: 'sessions', icon: 'browsers', label: 'Active Sessions', description: 'Manage logged-in devices', color: '#06B6D4' },
  ],
  [
    { id: 'account_actions', icon: 'settings', label: 'Account Actions', description: 'Username, disable, delete', color: '#F59E0B' },
    { id: 'help', icon: 'help-circle', label: 'Help & Support', color: colors.text.secondary },
    { id: 'about', icon: 'information-circle', label: 'About', description: 'Version 1.0.0', color: colors.text.secondary },
    { id: 'logout', icon: 'log-out', label: 'Sign Out', color: colors.status.error, isDanger: true },
  ],
];

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const user = useChatStore((s) => s.user);
  const publicKey = useChatStore((s) => s.publicKey);
  const identityKey = useChatStore((s) => s.identityKey);
  const chatLogout = useChatStore((s) => s.logout);
  const authLogout = useAuthStore((s) => s.logout);

  const fingerprint = useMemo(() => {
    if (publicKey) return generateFingerprint(publicKey);
    return null;
  }, [publicKey]);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your keys are stored securely for next login.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await chatLogout();
            await authLogout();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'This will permanently delete your account and all data after 30 days. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete('/auth/account');
              showMessage({
                message: 'Account Scheduled for Deletion',
                description: 'Your account will be permanently deleted in 30 days.',
                type: 'warning',
              });
              await chatLogout();
              await authLogout();
            } catch (error) {
              showMessage({ message: 'Failed to delete account', type: 'danger' });
            }
          },
        },
      ]
    );
  };

  const handleCopyFingerprint = () => {
    if (fingerprint) {
      Clipboard.setString(fingerprint);
      showMessage({ message: 'Fingerprint Copied', type: 'success' });
    }
  };

  const handleSettingPress = (id: string) => {
    switch (id) {
      case 'logout':
        handleLogout();
        return;
      case 'account':
        navigation.navigate('Profile');
        return;
      case 'privacy':
        navigation.navigate('SecuritySettings');
        return;
      case 'trusted_contacts':
        navigation.navigate('TrustedContacts');
        return;
      case 'notifications':
        navigation.navigate('NotificationSettings');
        return;
      case 'appearance':
        navigation.navigate('AppearanceSettings');
        return;
      case 'storage':
        navigation.navigate('DataStorage');
        return;
      case 'devices':
        navigation.navigate('DeviceManagement');
        return;
      case 'sessions':
        navigation.navigate('SessionManagement');
        return;
      case 'account_actions':
        navigation.navigate('AccountActions');
        return;
      case 'delete_account':
        handleDeleteAccount();
        return;
      case 'fingerprint':
        handleCopyFingerprint();
        return;
      default:
        break;
    }
  };

  const renderSettingItem = (item: SettingItem, index: number, isLast: boolean) => (
    <GlassCard key={item.id}>
      <TouchableOpacity
        style={[
          styles.settingItem,
          !isLast && styles.settingItemBorder,
        ]}
        onPress={() => handleSettingPress(item.id)}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
          <Icon name={item.icon} size={22} color={item.color} />
        </View>
        <View style={styles.settingInfo}>
          <Text style={[styles.settingLabel, item.isDanger && styles.dangerText]}>
            {item.label}
          </Text>
          {item.description && (
            <Text style={styles.settingDescription}>{item.description}</Text>
          )}
        </View>
        <Icon
          name="chevron-forward"
          size={20}
          color={item.isDanger ? colors.status.error : colors.text.muted}
        />
      </TouchableOpacity>
    </GlassCard>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header with Glassmorphism */}
      <Glassmorphism style={styles.header} blur="lg">
        <Text style={styles.headerTitle}>Settings</Text>
      </Glassmorphism>

      {/* Profile Section with 3D Avatar */}
      <View style={styles.profileSection}>
        <TiltAvatar maxTilt={20} scale={1.1}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        </TiltAvatar>
        <Text style={styles.username}>{user?.username || 'User'}</Text>
        <Text style={styles.email}>{user?.email || 'user@example.com'}</Text>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <Glassmorphism style={styles.statCard} blur="sm">
            <Icon name="shield-checkmark" size={20} color={colors.status.success} />
            <Text style={styles.statLabel}>Verified</Text>
          </Glassmorphism>
          <Glassmorphism style={styles.statCard} blur="sm">
            <Icon name="key" size={20} color={colors.primary.main} />
            <Text style={styles.statLabel}>E2E Encrypted</Text>
          </Glassmorphism>
        </View>
      </View>

      {/* Key Fingerprint */}
      {fingerprint && (
        <View style={styles.groupContainer}>
          <Text style={styles.groupTitle}>Your Key Fingerprint</Text>
          <TouchableOpacity
            style={styles.fingerprintCard}
            onPress={handleCopyFingerprint}
            activeOpacity={0.7}
          >
            <Icon name="finger-print" size={24} color={colors.primary.main} />
            <View style={styles.fingerprintInfo}>
              <Text style={styles.fingerprintText}>{fingerprint}</Text>
              <Text style={styles.fingerprintHint}>Tap to copy • Share to verify identity</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Settings Groups */}
      {settingsGroups.map((group, groupIndex) => (
        <View key={groupIndex} style={styles.groupContainer}>
          <Text style={styles.groupTitle}>
            {groupIndex === 0 ? 'Preferences' : groupIndex === 1 ? 'General' : 'Other'}
          </Text>
          <View style={styles.groupContent}>
            {group.map((item, index) =>
              renderSettingItem(item, index, index === group.length - 1)
            )}
          </View>
        </View>
      ))}

      {/* Danger Zone */}
      <View style={styles.groupContainer}>
        <Text style={[styles.groupTitle, { color: colors.status.error }]}>Danger Zone</Text>
        <GlassCard>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleDeleteAccount}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${colors.status.error}20` }]}>
              <Icon name="warning" size={22} color={colors.status.error} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.dangerText}>Delete Account</Text>
              <Text style={styles.settingDescription}>Permanently remove your account and data</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.status.error} />
          </TouchableOpacity>
        </GlassCard>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>ZeroTrace v1.0.0</Text>
        <Text style={styles.footerSubtext}>Private by design. Secure by default.</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
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
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary.main,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.text.inverse,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 16,
  },
  email: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  statLabel: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  groupContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 8,
  },
  groupContent: {
    gap: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.primary,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 2,
  },
  dangerText: {
    color: colors.status.error,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 50,
  },
  footerText: {
    fontSize: 14,
    color: colors.text.muted,
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  fingerprintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: `${colors.primary.main}30`,
  },
  fingerprintInfo: {
    flex: 1,
  },
  fingerprintText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.text.primary,
    letterSpacing: 1,
  },
  fingerprintHint: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 4,
  },
});

export default SettingsScreen;
