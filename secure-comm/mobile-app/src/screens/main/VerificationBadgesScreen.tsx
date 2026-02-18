import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  verificationAPI,
  VerificationBadge,
  getBadgeColor,
  getBadgeIcon,
  getBadgeLabel,
  isBadgeExpiringSoon,
  isBadgeExpired,
  getDaysUntilExpiry,
} from '../../services/verificationApi';

export default function VerificationBadgesScreen() {
  const navigation = useNavigation();
  const [badges, setBadges] = useState<VerificationBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadBadges();
  }, []);

  const loadBadges = async () => {
    try {
      const data = await verificationAPI.getMyBadges();
      setBadges(data);
    } catch (error: any) {
      console.error('Failed to load badges:', error);
      Alert.alert('Error', 'Failed to load verification badges');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadBadges();
  };

  const handleRevokeBadge = (badge: VerificationBadge) => {
    Alert.alert(
      'Revoke Badge',
      `Are you sure you want to revoke your ${getBadgeLabel(badge.verification_type)} badge?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await verificationAPI.revokeBadge(badge.verification_type);
              Alert.alert('Success', 'Badge revoked successfully');
              loadBadges();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to revoke badge');
            }
          },
        },
      ]
    );
  };

  const renderBadge = (badge: VerificationBadge) => {
    const color = badge.badge_color || getBadgeColor(badge.verification_type);
    const icon = badge.badge_icon || getBadgeIcon(badge.verification_type);
    const label = badge.badge_label || getBadgeLabel(badge.verification_type);
    const expired = isBadgeExpired(badge);
    const expiringSoon = isBadgeExpiringSoon(badge);
    const daysUntilExpiry = getDaysUntilExpiry(badge);

    return (
      <View key={badge.id} style={[styles.badgeCard, expired && styles.expiredBadge]}>
        <View style={styles.badgeHeader}>
          <View style={[styles.badgeIcon, { backgroundColor: color + '20' }]}>
            <Text style={[styles.badgeIconText, { color }]}>{icon}</Text>
          </View>
          <View style={styles.badgeInfo}>
            <Text style={styles.badgeLabel}>{label}</Text>
            <Text style={styles.badgeType}>
              {badge.verification_type.charAt(0).toUpperCase() + badge.verification_type.slice(1)}
            </Text>
          </View>
          {badge.is_active && !expired && (
            <View style={[styles.statusBadge, { backgroundColor: color }]}>
              <Text style={styles.statusText}>Active</Text>
            </View>
          )}
          {expired && (
            <View style={[styles.statusBadge, { backgroundColor: '#6B7280' }]}>
              <Text style={styles.statusText}>Expired</Text>
            </View>
          )}
        </View>

        <View style={styles.badgeDetails}>
          <Text style={styles.detailLabel}>Issued: {new Date(badge.issued_at).toLocaleDateString()}</Text>
          {badge.expires_at && (
            <Text style={[styles.detailLabel, expiringSoon && styles.expiringText]}>
              {expired
                ? `Expired: ${new Date(badge.expires_at).toLocaleDateString()}`
                : `Expires: ${new Date(badge.expires_at).toLocaleDateString()} (${daysUntilExpiry} days)`}
            </Text>
          )}
          {!badge.expires_at && <Text style={styles.detailLabel}>No expiration</Text>}
        </View>

        {badge.is_active && !expired && (
          <TouchableOpacity
            style={styles.revokeButton}
            onPress={() => handleRevokeBadge(badge)}
          >
            <Text style={styles.revokeButtonText}>Revoke Badge</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Verification Badges</Text>
          <Text style={styles.subtitle}>
            {badges.length === 0
              ? 'You have no verification badges yet'
              : `You have ${badges.length} badge${badges.length > 1 ? 's' : ''}`}
          </Text>
        </View>

        {badges.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏅</Text>
            <Text style={styles.emptyTitle}>No Badges Yet</Text>
            <Text style={styles.emptyText}>
              Request verification to get badges that show your authenticity
            </Text>
            <TouchableOpacity
              style={styles.requestButton}
              onPress={() => navigation.navigate('RequestVerification' as never)}
            >
              <Text style={styles.requestButtonText}>Request Verification</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.badgesList}>
            {badges.map(renderBadge)}
            <TouchableOpacity
              style={styles.requestMoreButton}
              onPress={() => navigation.navigate('RequestVerification' as never)}
            >
              <Text style={styles.requestMoreButtonText}>+ Request Another Badge</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('VerificationHistory' as never)}
        >
          <Text style={styles.historyButtonText}>View Verification History</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
  },
  badgesList: {
    padding: 16,
  },
  badgeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  expiredBadge: {
    opacity: 0.6,
  },
  badgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  badgeIconText: {
    fontSize: 24,
  },
  badgeInfo: {
    flex: 1,
  },
  badgeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  badgeType: {
    fontSize: 14,
    color: '#94A3B8',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  badgeDetails: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 4,
  },
  expiringText: {
    color: '#F59E0B',
  },
  revokeButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  revokeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  requestButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  requestMoreButton: {
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  requestMoreButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  historyButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
  },
  historyButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
});
