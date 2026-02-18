/**
 * ProfileHistoryViewer — Full profile version history viewer with rollback.
 * Mirrors web's ProfileHistoryViewer.tsx.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { profileAPI, ProfileHistoryEntry } from '../../services/profileApi';

interface ProfileHistoryViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onRollback?: () => void;
}

const ProfileHistoryViewer: React.FC<ProfileHistoryViewerProps> = ({
  isOpen,
  onClose,
  onRollback,
}) => {
  const [entries, setEntries] = useState<ProfileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileAPI.getHistory(30);
      setEntries(data);
    } catch (e) {
      setError('Failed to load profile history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      load();
    }
  }, [isOpen, load]);

  const handleRollback = (entry: ProfileHistoryEntry) => {
    Alert.alert(
      'Rollback Profile',
      `Restore your profile to the version from ${formatDate(entry.created_at)}?\n\nThis will revert: ${entry.changed_fields.join(', ')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rollback',
          style: 'destructive',
          onPress: async () => {
            setRollingBack(entry.id);
            try {
              await profileAPI.rollbackProfile(entry.id);
              showMessage({
                message: 'Profile Restored',
                description: 'Your profile has been rolled back successfully.',
                type: 'success',
              });
              onRollback?.();
              await load();
            } catch (e) {
              showMessage({
                message: 'Rollback Failed',
                description: 'Could not restore this version.',
                type: 'danger',
              });
            } finally {
              setRollingBack(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderEntry = ({ item }: { item: ProfileHistoryEntry }) => (
    <View style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <View style={styles.entryMeta}>
          <Icon name="time-outline" size={14} color={colors.text.muted} />
          <Text style={styles.entryDate}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={styles.sourceTag}>
          <Text style={styles.sourceText}>{item.change_source}</Text>
        </View>
      </View>

      {/* Changed Fields */}
      <View style={styles.fieldsRow}>
        {item.changed_fields.map((field) => (
          <View key={field} style={styles.fieldChip}>
            <Text style={styles.fieldChipText}>{field}</Text>
          </View>
        ))}
      </View>

      {/* Expandable Snapshot */}
      <TouchableOpacity
        style={styles.snapshotToggle}
        onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
      >
        <Icon
          name={expandedId === item.id ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.text.muted}
        />
        <Text style={styles.snapshotToggleText}>
          {expandedId === item.id ? 'Hide Details' : 'Show Details'}
        </Text>
      </TouchableOpacity>

      {expandedId === item.id && (
        <View style={styles.snapshotContent}>
          <Text style={styles.snapshotJson}>
            {JSON.stringify(item.snapshot, null, 2)}
          </Text>
        </View>
      )}

      {/* Rollback Button */}
      <TouchableOpacity
        style={styles.rollbackButton}
        onPress={() => handleRollback(item)}
        disabled={rollingBack === item.id}
      >
        {rollingBack === item.id ? (
          <ActivityIndicator size="small" color="#F59E0B" />
        ) : (
          <>
            <Icon name="arrow-undo-outline" size={16} color="#F59E0B" />
            <Text style={styles.rollbackText}>Rollback to this version</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Icon name="time" size={22} color="#06B6D4" />
              <Text style={styles.headerTitle}>Profile History</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary.main} />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContainer}>
              <Icon name="alert-circle" size={40} color={colors.status.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={load}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.centerContainer}>
              <Icon name="document-outline" size={40} color={colors.text.muted} />
              <Text style={styles.emptyText}>No profile history yet</Text>
            </View>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderEntry}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    flex: 1,
    marginTop: 60,
    marginBottom: 20,
    backgroundColor: colors.background.primary,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  entryCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entryDate: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  sourceTag: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sourceText: {
    fontSize: 11,
    color: colors.primary.main,
    fontWeight: '500',
  },
  fieldsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  fieldChip: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fieldChipText: {
    fontSize: 12,
    color: '#06B6D4',
    fontWeight: '500',
  },
  snapshotToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  snapshotToggleText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  snapshotContent: {
    backgroundColor: colors.background.primary,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  snapshotJson: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.text.secondary,
    lineHeight: 16,
  },
  rollbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
  },
  rollbackText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  errorText: {
    fontSize: 14,
    color: colors.status.error,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.primary.main,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
  },
});

export default ProfileHistoryViewer;
