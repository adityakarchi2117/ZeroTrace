import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { accountAPI } from '../../services/api';

interface AccountStatus {
  username: string;
  email: string;
  is_disabled: boolean;
  deleted_at: string | null;
  created_at: string | null;
  can_change_username: boolean;
  days_until_username_change: number;
  last_username_change: string | null;
  previous_usernames: Array<{ username: string; changed_at: string }>;
}

export default function AccountManagementScreen() {
  const navigation = useNavigation();
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccountStatus();
  }, []);

  const loadAccountStatus = async () => {
    try {
      const response = await accountAPI.getAccountStatus();
      setAccountStatus(response.data);
    } catch (error: any) {
      console.error('Failed to load account status:', error);
      Alert.alert('Error', 'Failed to load account information');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeUsername = () => {
    if (!accountStatus?.can_change_username) {
      Alert.alert(
        'Username Change Cooldown',
        `You can change your username in ${accountStatus?.days_until_username_change} days.`
      );
      return;
    }
    navigation.navigate('ChangeUsername' as never);
  };

  const handleDisableAccount = () => {
    Alert.alert(
      'Disable Account',
      'Your account will be disabled and you will be logged out. You can re-enable it by logging in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => navigation.navigate('DisableAccount' as never),
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account after a 30-day recovery period. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => navigation.navigate('DeleteAccount' as never),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!accountStatus) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load account information</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>{accountStatus.username}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{accountStatus.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Created</Text>
            <Text style={styles.infoValue}>
              {accountStatus.created_at
                ? new Date(accountStatus.created_at).toLocaleDateString()
                : 'Unknown'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Username</Text>
        
        <TouchableOpacity
          style={[
            styles.actionButton,
            !accountStatus.can_change_username && styles.actionButtonDisabled,
          ]}
          onPress={handleChangeUsername}
        >
          <View style={styles.actionButtonContent}>
            <Text style={styles.actionButtonIcon}>✏️</Text>
            <View style={styles.actionButtonText}>
              <Text style={styles.actionButtonTitle}>Change Username</Text>
              <Text style={styles.actionButtonSubtitle}>
                {accountStatus.can_change_username
                  ? 'Available now'
                  : `Available in ${accountStatus.days_until_username_change} days`}
              </Text>
            </View>
          </View>
          <Text style={styles.actionButtonArrow}>›</Text>
        </TouchableOpacity>

        {accountStatus.previous_usernames && accountStatus.previous_usernames.length > 0 && (
          <View style={styles.previousUsernames}>
            <Text style={styles.previousUsernamesTitle}>Previous Usernames</Text>
            {accountStatus.previous_usernames.map((item, index) => (
              <View key={index} style={styles.previousUsernameItem}>
                <Text style={styles.previousUsername}>{item.username}</Text>
                <Text style={styles.previousUsernameDate}>
                  {new Date(item.changed_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Actions</Text>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.warningButton]}
          onPress={handleDisableAccount}
        >
          <View style={styles.actionButtonContent}>
            <Text style={styles.actionButtonIcon}>⏸️</Text>
            <View style={styles.actionButtonText}>
              <Text style={styles.actionButtonTitle}>Disable Account</Text>
              <Text style={styles.actionButtonSubtitle}>
                Temporarily disable your account
              </Text>
            </View>
          </View>
          <Text style={styles.actionButtonArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleDeleteAccount}
        >
          <View style={styles.actionButtonContent}>
            <Text style={styles.actionButtonIcon}>🗑️</Text>
            <View style={styles.actionButtonText}>
              <Text style={styles.actionButtonTitle}>Delete Account</Text>
              <Text style={styles.actionButtonSubtitle}>
                Permanently delete your account
              </Text>
            </View>
          </View>
          <Text style={styles.actionButtonArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoBoxIcon}>ℹ️</Text>
        <Text style={styles.infoBoxText}>
          Username changes are limited to once every 14 days. Account deletion has a 30-day
          recovery period.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  infoLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  warningButton: {
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  actionButtonText: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  actionButtonSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
  },
  actionButtonArrow: {
    fontSize: 24,
    color: '#64748B',
  },
  previousUsernames: {
    marginTop: 16,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  previousUsernamesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
  },
  previousUsernameItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  previousUsername: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  previousUsernameDate: {
    fontSize: 13,
    color: '#64748B',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#1E3A5F',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  infoBoxIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: '#93C5FD',
    lineHeight: 18,
  },
});
