/**
 * AccountActionsScreen — Account management: change username, disable, delete, key export.
 * Mirrors web's SettingsModal.tsx account management section.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Clipboard,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { apiClient } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ActionGroup {
  title: string;
  icon: string;
  items: ActionItem[];
}

interface ActionItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  iconColor?: string;
  danger?: boolean;
  onPress: () => void;
}

const AccountActionsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Change Username
  const [showUsernameForm, setShowUsernameForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');

  // Disable Account
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  // Delete Account
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const handleChangeUsername = async () => {
    if (!newUsername.trim() || newUsername.length < 3 || newUsername.length > 30) {
      showMessage({
        message: 'Invalid username',
        description: 'Username must be 3–30 characters.',
        type: 'warning',
      });
      return;
    }
    if (!usernamePassword) {
      showMessage({
        message: 'Password required',
        type: 'warning',
      });
      return;
    }

    setActiveAction('username');
    try {
      await apiClient.post('/users/change-username', {
        new_username: newUsername.trim(),
        password: usernamePassword,
      });
      showMessage({
        message: 'Username Changed',
        description: `Your username is now ${newUsername.trim()}.`,
        type: 'success',
      });
      setShowUsernameForm(false);
      setNewUsername('');
      setUsernamePassword('');
    } catch (e: any) {
      const errMsg = e.response?.data?.detail || 'Failed to change username.';
      showMessage({
        message: 'Error',
        description: errMsg.includes('14 days')
          ? 'You can only change username once every 14 days.'
          : errMsg,
        type: 'danger',
      });
    } finally {
      setActiveAction(null);
    }
  };

  const handleDisableAccount = async () => {
    if (!disablePassword) {
      showMessage({ message: 'Password required', type: 'warning' });
      return;
    }

    Alert.alert(
      'Disable Account',
      'Your account will be temporarily disabled. You can reactivate it by logging in again.\n\nAll your sessions will be terminated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            setActiveAction('disable');
            try {
              await apiClient.post('/users/disable-account', {
                password: disablePassword,
              });
              showMessage({
                message: 'Account Disabled',
                description: 'Your account has been temporarily disabled.',
                type: 'info',
              });
              setShowDisableForm(false);
              setDisablePassword('');
              // Log out
              await AsyncStorage.removeItem('authToken');
              navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
            } catch (e: any) {
              showMessage({
                message: 'Error',
                description: e.response?.data?.detail || 'Failed to disable account.',
                type: 'danger',
              });
            } finally {
              setActiveAction(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showMessage({ message: 'Password required', type: 'warning' });
      return;
    }
    if (deleteConfirmText !== 'DELETE') {
      showMessage({
        message: 'Confirmation Required',
        description: 'Type "DELETE" to confirm.',
        type: 'warning',
      });
      return;
    }

    Alert.alert(
      '⚠️ Delete Account Permanently',
      'This action CANNOT be undone.\n\n• All messages will be deleted\n• All encryption keys will be destroyed\n• You have a 30-day grace period to cancel\n\nAre you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setActiveAction('delete');
            try {
              await apiClient.post('/users/delete-account', {
                password: deletePassword,
              });
              showMessage({
                message: 'Account Scheduled for Deletion',
                description: 'You have 30 days to log in and cancel.',
                type: 'info',
              });
              setShowDeleteForm(false);
              setDeletePassword('');
              setDeleteConfirmText('');
              // Log out
              await AsyncStorage.removeItem('authToken');
              navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
            } catch (e: any) {
              showMessage({
                message: 'Error',
                description: e.response?.data?.detail || 'Failed to delete account.',
                type: 'danger',
              });
            } finally {
              setActiveAction(null);
            }
          },
        },
      ]
    );
  };

  const handleExportKeys = async () => {
    setActiveAction('export');
    try {
      const keyData = await AsyncStorage.getItem('identity_key_pair');
      if (keyData) {
        Clipboard.setString(JSON.stringify(JSON.parse(keyData), null, 2));
        showMessage({
          message: 'Keys Copied',
          description: 'Your public key has been copied to clipboard. Store it securely.',
          type: 'success',
        });
      } else {
        showMessage({
          message: 'No Keys Found',
          description: 'No encryption keys found on this device.',
          type: 'warning',
        });
      }
    } catch (e) {
      showMessage({ message: 'Failed to export keys', type: 'danger' });
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Glassmorphism style={styles.header} blur="lg">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Actions</Text>
          <View style={{ width: 36 }} />
        </View>
      </Glassmorphism>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Account Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT MANAGEMENT</Text>

          {/* Change Username */}
          <GlassCard>
            <View style={styles.actionCard}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setShowUsernameForm(!showUsernameForm)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                  <Icon name="person" size={18} color="#3B82F6" />
                </View>
                <View style={styles.actionDetails}>
                  <Text style={styles.actionLabel}>Change Username</Text>
                  <Text style={styles.actionDesc}>Limited to once every 14 days</Text>
                </View>
                <Icon
                  name={showUsernameForm ? 'chevron-up' : 'chevron-forward'}
                  size={20}
                  color={colors.text.muted}
                />
              </TouchableOpacity>

              {showUsernameForm && (
                <View style={styles.formArea}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="New username"
                    placeholderTextColor={colors.text.muted}
                    value={newUsername}
                    onChangeText={setNewUsername}
                    autoCapitalize="none"
                    maxLength={30}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Current password"
                    placeholderTextColor={colors.text.muted}
                    value={usernamePassword}
                    onChangeText={setUsernamePassword}
                    secureTextEntry
                  />
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={handleChangeUsername}
                    disabled={activeAction === 'username'}
                  >
                    {activeAction === 'username' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Change Username</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </GlassCard>

          {/* Export Keys */}
          <GlassCard>
            <TouchableOpacity style={styles.actionCard} onPress={handleExportKeys}>
              <View style={styles.actionRow}>
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(6, 182, 212, 0.1)' }]}>
                  <Icon name="key" size={18} color="#06B6D4" />
                </View>
                <View style={styles.actionDetails}>
                  <Text style={styles.actionLabel}>Export Encryption Keys</Text>
                  <Text style={styles.actionDesc}>Copy keys for backup or transfer</Text>
                </View>
                {activeAction === 'export' ? (
                  <ActivityIndicator size="small" color={colors.primary.main} />
                ) : (
                  <Icon name="copy" size={20} color={colors.text.muted} />
                )}
              </View>
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.status.error }]}>DANGER ZONE</Text>

          {/* Disable Account */}
          <GlassCard>
            <View style={styles.dangerCard}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setShowDisableForm(!showDisableForm)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                  <Icon name="pause-circle" size={18} color="#F59E0B" />
                </View>
                <View style={styles.actionDetails}>
                  <Text style={styles.actionLabel}>Disable Account</Text>
                  <Text style={styles.actionDesc}>
                    Temporarily deactivate — reactivate by logging in
                  </Text>
                </View>
                <Icon
                  name={showDisableForm ? 'chevron-up' : 'chevron-forward'}
                  size={20}
                  color={colors.text.muted}
                />
              </TouchableOpacity>

              {showDisableForm && (
                <View style={styles.formArea}>
                  <View style={styles.warningBanner}>
                    <Icon name="warning" size={16} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      Your profile will be hidden and all sessions will be terminated.
                    </Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Confirm your password"
                    placeholderTextColor={colors.text.muted}
                    value={disablePassword}
                    onChangeText={setDisablePassword}
                    secureTextEntry
                  />
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.warningButton]}
                    onPress={handleDisableAccount}
                    disabled={activeAction === 'disable'}
                  >
                    {activeAction === 'disable' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Disable Account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </GlassCard>

          {/* Delete Account */}
          <GlassCard>
            <View style={styles.dangerCard}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setShowDeleteForm(!showDeleteForm)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Icon name="trash" size={18} color={colors.status.error} />
                </View>
                <View style={styles.actionDetails}>
                  <Text style={[styles.actionLabel, { color: colors.status.error }]}>
                    Delete Account
                  </Text>
                  <Text style={styles.actionDesc}>
                    Permanently delete — 30 day grace period
                  </Text>
                </View>
                <Icon
                  name={showDeleteForm ? 'chevron-up' : 'chevron-forward'}
                  size={20}
                  color={colors.text.muted}
                />
              </TouchableOpacity>

              {showDeleteForm && (
                <View style={styles.formArea}>
                  <View style={[styles.warningBanner, styles.dangerBanner]}>
                    <Icon name="alert-circle" size={16} color={colors.status.error} />
                    <Text style={[styles.warningText, { color: colors.status.error }]}>
                      This action is irreversible after 30 days. All messages, keys, and data will be permanently destroyed.
                    </Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Confirm your password"
                    placeholderTextColor={colors.text.muted}
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    secureTextEntry
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder='Type "DELETE" to confirm'
                    placeholderTextColor={colors.text.muted}
                    value={deleteConfirmText}
                    onChangeText={setDeleteConfirmText}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      styles.dangerButton,
                      deleteConfirmText !== 'DELETE' && styles.disabledButton,
                    ]}
                    onPress={handleDeleteAccount}
                    disabled={activeAction === 'delete' || deleteConfirmText !== 'DELETE'}
                  >
                    {activeAction === 'delete' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Delete Account Forever</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </GlassCard>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 1,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  actionCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    overflow: 'hidden',
  },
  dangerCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionDetails: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  actionDesc: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  formArea: {
    padding: 16,
    paddingTop: 0,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  textInput: {
    height: 48,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.secondary,
  },
  confirmButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  warningButton: {
    backgroundColor: '#F59E0B',
  },
  dangerButton: {
    backgroundColor: colors.status.error,
  },
  disabledButton: {
    opacity: 0.4,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 10,
    marginTop: 10,
  },
  dangerBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#F59E0B',
    lineHeight: 17,
  },
});

export default AccountActionsScreen;
