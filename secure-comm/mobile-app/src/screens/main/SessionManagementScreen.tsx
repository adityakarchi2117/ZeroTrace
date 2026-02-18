/**
 * SessionManagementScreen — Active session list with revoke capabilities.
 * Mirrors web's SettingsModal.tsx session management section.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { profileAPI, ActiveSession } from '../../services/profileApi';

const SessionManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await profileAPI.getSessions();
      setSessions(data);
    } catch (e) {
      showMessage({
        message: 'Failed to load sessions',
        type: 'danger',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const handleRevokeSession = (session: ActiveSession) => {
    if (session.is_current) return;

    Alert.alert(
      'Revoke Session',
      `Sign out from "${session.device_name}"?\n\nThis device will be immediately disconnected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokingId(session.id);
            try {
              await profileAPI.revokeSession(session.id);
              setSessions((prev) => prev.filter((s) => s.id !== session.id));
              showMessage({
                message: 'Session Revoked',
                description: `${session.device_name} has been signed out.`,
                type: 'success',
              });
            } catch (e) {
              showMessage({
                message: 'Failed to revoke session',
                type: 'danger',
              });
            } finally {
              setRevokingId(null);
            }
          },
        },
      ]
    );
  };

  const handleRevokeAll = () => {
    const otherSessions = sessions.filter((s) => !s.is_current);
    if (otherSessions.length === 0) return;

    Alert.alert(
      'Sign Out All Devices',
      `Sign out from ${otherSessions.length} other device(s)?\n\nAll other sessions will be terminated immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await profileAPI.revokeAllSessions();
              await loadSessions();
              showMessage({
                message: 'All Other Sessions Revoked',
                description: 'All other devices have been signed out.',
                type: 'success',
              });
            } catch (e) {
              showMessage({
                message: 'Failed to revoke sessions',
                type: 'danger',
              });
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getDeviceIcon = (deviceType: string): string => {
    switch (deviceType.toLowerCase()) {
      case 'android':
      case 'ios':
      case 'mobile':
        return 'phone-portrait';
      case 'desktop':
      case 'windows':
      case 'macos':
      case 'linux':
        return 'desktop';
      case 'web':
        return 'globe';
      default:
        return 'hardware-chip';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderSession = ({ item }: { item: ActiveSession }) => (
    <GlassCard>
      <View style={styles.sessionCard}>
        <View style={styles.sessionInfo}>
          <View style={[styles.deviceIcon, item.is_current && styles.deviceIconCurrent]}>
            <Icon
              name={getDeviceIcon(item.device_type)}
              size={22}
              color={item.is_current ? '#06B6D4' : colors.text.secondary}
            />
          </View>
          <View style={styles.sessionDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.deviceName}>{item.device_name}</Text>
              {item.is_current && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>THIS DEVICE</Text>
                </View>
              )}
            </View>
            {item.ip_address && (
              <Text style={styles.ipAddress}>{item.ip_address}</Text>
            )}
            <Text style={styles.lastActive}>
              Last active: {formatDate(item.last_active)}
            </Text>
          </View>
        </View>

        {!item.is_current && (
          <TouchableOpacity
            style={styles.revokeButton}
            onPress={() => handleRevokeSession(item)}
            disabled={revokingId === item.id}
          >
            {revokingId === item.id ? (
              <ActivityIndicator size="small" color={colors.status.error} />
            ) : (
              <>
                <Icon name="log-out" size={16} color={colors.status.error} />
                <Text style={styles.revokeText}>Revoke</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </GlassCard>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <Glassmorphism style={styles.header} blur="lg">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Active Sessions</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
            <Icon name="refresh" size={22} color={colors.primary.main} />
          </TouchableOpacity>
        </View>
      </Glassmorphism>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Icon name="information-circle" size={20} color="#06B6D4" />
        <Text style={styles.infoText}>
          These are the devices currently signed into your account. Revoke any suspicious sessions immediately.
        </Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={styles.loadingText}>Loading sessions...</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSession}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary.main}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerContent}>
              <Icon name="shield-checkmark" size={48} color={colors.text.muted} />
              <Text style={styles.emptyText}>No active sessions found</Text>
            </View>
          }
          ListFooterComponent={
            sessions.filter((s) => !s.is_current).length > 1 ? (
              <TouchableOpacity style={styles.revokeAllButton} onPress={handleRevokeAll}>
                <Icon name="log-out" size={18} color={colors.status.error} />
                <Text style={styles.revokeAllText}>Sign out all other devices</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
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
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    margin: 16,
    padding: 14,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  sessionCard: {
    padding: 16,
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
  },
  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  deviceIconCurrent: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  sessionDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  currentBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#06B6D4',
    letterSpacing: 0.5,
  },
  ipAddress: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  lastActive: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  revokeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  revokeText: {
    fontSize: 13,
    color: colors.status.error,
    fontWeight: '600',
  },
  revokeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  revokeAllText: {
    fontSize: 15,
    color: colors.status.error,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
  },
});

export default SessionManagementScreen;
