/**
 * Settings Screen with Glassmorphism and 3D Effects
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';

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
    { id: 'notifications', icon: 'notifications', label: 'Notifications', description: 'Message alerts', color: colors.status.warning, hasSwitch: true },
  ],
  [
    { id: 'appearance', icon: 'color-palette', label: 'Appearance', description: 'Theme and colors', color: colors.secondary.main },
    { id: 'storage', icon: 'folder', label: 'Storage & Data', description: 'Manage storage', color: colors.status.info },
    { id: 'devices', icon: 'phone-portrait', label: 'Linked Devices', description: 'Active sessions', color: colors.primary.main },
  ],
  [
    { id: 'help', icon: 'help-circle', label: 'Help & Support', color: colors.text.secondary },
    { id: 'about', icon: 'information-circle', label: 'About', description: 'Version 1.0.0', color: colors.text.secondary },
    { id: 'logout', icon: 'log-out', label: 'Sign Out', color: colors.status.error, isDanger: true },
  ],
];

const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleSettingPress = (id: string) => {
    if (id === 'logout') {
      handleLogout();
    }
    // Other settings would navigate to their respective screens
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

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>CipherLink v1.0.0</Text>
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
});

export default SettingsScreen;
