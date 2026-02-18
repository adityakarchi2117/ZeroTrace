/**
 * Pending Requests Screen
 * View and manage incoming/outgoing friend requests
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { useAuthStore } from '../../store/authStore';
import {
  friendAPI,
  FriendRequest,
  computeKeyFingerprint,
  formatFingerprint,
  verifyFingerprint,
} from '../../services/friendApi';
import { colors } from '../../theme/colors';

interface PendingRequestsScreenProps {
  navigation: any;
}

type TabType = 'incoming' | 'outgoing';

export default function PendingRequestsScreen({ navigation }: PendingRequestsScreenProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('incoming');
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  // Verification modal state
  const [verifyModal, setVerifyModal] = useState<{
    visible: boolean;
    request: FriendRequest | null;
  }>({ visible: false, request: null });

  // Load requests
  const loadRequests = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    try {
      const response = await friendAPI.getPendingRequests();
      const data = response.data;
      setRequests(activeTab === 'incoming' ? (data.incoming || []) : (data.outgoing || []));
    } catch (error) {
      showMessage({
        message: 'Load Failed',
        description: 'Failed to load requests',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadRequests();
  }, [activeTab, loadRequests]);

  // Accept request
  const handleAccept = async (request: FriendRequest) => {
    if (!user?.public_key && !user?.publicKey) {
      showMessage({
        message: 'Keys Required',
        description: 'Please set up your encryption keys first',
        type: 'warning',
      });
      return;
    }

    // Show verification modal first
    setVerifyModal({ visible: true, request });
  };

  // Complete acceptance after verification
  const completeAccept = async () => {
    const request = verifyModal.request;
    if (!request || (!user?.public_key && !user?.publicKey)) return;

    setVerifyModal({ visible: false, request: null });
    setActionId(request.id);

    try {
      const fingerprint = computeKeyFingerprint(user.public_key || user.publicKey || '');

      await friendAPI.acceptFriendRequest({
        request_id: request.id,
        receiver_public_key_fingerprint: fingerprint,
        verify_sender_fingerprint: request.sender_public_key_fingerprint || '',
      });

      showMessage({
        message: 'Request Accepted',
        description: `You are now connected with ${request.sender_username || request.receiver_username}`,
        type: 'success',
      });

      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error: any) {
      showMessage({
        message: 'Accept Failed',
        description: error.response?.data?.detail || 'Failed to accept request',
        type: 'danger',
      });
    } finally {
      setActionId(null);
    }
  };

  // Reject request
  const handleReject = (request: FriendRequest) => {
    Alert.alert(
      'Reject Request',
      `Are you sure you want to reject the request from ${request.sender_username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => confirmReject(request),
        },
      ]
    );
  };

  const confirmReject = async (request: FriendRequest) => {
    setActionId(request.id);
    try {
      await friendAPI.rejectFriendRequest({ request_id: request.id });

      showMessage({
        message: 'Request Rejected',
        type: 'info',
      });

      setRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error: any) {
      showMessage({
        message: 'Reject Failed',
        description: error.response?.data?.detail || 'Failed to reject request',
        type: 'danger',
      });
    } finally {
      setActionId(null);
    }
  };

  // Cancel outgoing request
  const handleCancel = (request: FriendRequest) => {
    Alert.alert(
      'Cancel Request',
      `Cancel friend request to ${request.receiver_username}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => confirmCancel(request),
        },
      ]
    );
  };

  const confirmCancel = async (request: FriendRequest) => {
    setActionId(request.id);
    try {
      await friendAPI.cancelFriendRequest(request.id);

      showMessage({
        message: 'Request Cancelled',
        type: 'info',
      });

      setRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error: any) {
      showMessage({
        message: 'Cancel Failed',
        description: error.response?.data?.detail || 'Failed to cancel request',
        type: 'danger',
      });
    } finally {
      setActionId(null);
    }
  };

  // Calculate time remaining
  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d remaining`;
    return `${hours}h remaining`;
  };

  // Render request item
  const renderItem = ({ item }: { item: FriendRequest }) => {
    const isIncoming = activeTab === 'incoming';
    const username = isIncoming ? item.sender_username : item.receiver_username;

    return (
      <View style={styles.requestItem}>
        <View style={styles.requestInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {username?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.requestText}>
            <Text style={styles.username}>{username}</Text>
            {item.sender_public_key_fingerprint && (
              <Text style={styles.fingerprint}>
                🔑 {formatFingerprint(item.sender_public_key_fingerprint, true)}
              </Text>
            )}
            {item.message && (
              <Text style={styles.message} numberOfLines={2}>
                "{item.message}"
              </Text>
            )}
            <Text style={styles.timeRemaining}>
              ⏱ {getTimeRemaining(item.expires_at)}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {isIncoming ? (
            <>
              <TouchableOpacity
                style={styles.acceptButton}
                onPress={() => handleAccept(item)}
                disabled={actionId === item.id}
              >
                {actionId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.acceptButtonText}>Accept</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectButton}
                onPress={() => handleReject(item)}
                disabled={actionId === item.id}
              >
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => handleCancel(item)}
              disabled={actionId === item.id}
            >
              {actionId === item.id ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pending Requests</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'incoming' && styles.activeTab]}
          onPress={() => setActiveTab('incoming')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'incoming' && styles.activeTabText,
            ]}
          >
            Incoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'outgoing' && styles.activeTab]}
          onPress={() => setActiveTab('outgoing')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'outgoing' && styles.activeTabText,
            ]}
          >
            Outgoing
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                loadRequests(false);
              }}
              tintColor={colors.primary.main}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>
                No {activeTab} requests
              </Text>
            </View>
          }
        />
      )}

      {/* Verification Modal */}
      <Modal
        visible={verifyModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVerifyModal({ visible: false, request: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔐 Verify Identity</Text>

            <Text style={styles.modalSubtitle}>
              Verify {verifyModal.request?.sender_username}'s key fingerprint:
            </Text>

            {verifyModal.request?.sender_public_key_fingerprint && (
              <View style={styles.fingerprintBox}>
                <Text style={styles.fingerprintLabel}>Their Fingerprint:</Text>
                <Text style={styles.fingerprintValue}>
                  {formatFingerprint(
                    verifyModal.request.sender_public_key_fingerprint,
                    false
                  )}
                </Text>
              </View>
            )}

            <Text style={styles.modalNote}>
              ⚠️ For maximum security, verify this fingerprint through a trusted
              channel (in person, phone call, etc.)
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setVerifyModal({ visible: false, request: null })}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={completeAccept}
              >
                <Text style={styles.modalConfirmText}>Accept & Trust</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: colors.primary.main,
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary.main,
  },
  tabText: {
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    color: colors.primary.main,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  requestItem: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  requestInfo: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  requestText: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  fingerprint: {
    color: colors.text.secondary,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  message: {
    color: colors.text.secondary,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  timeRemaining: {
    color: colors.text.secondary,
    fontSize: 11,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: colors.primary.main,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  rejectButtonText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  cancelButtonText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.background.secondary,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  fingerprintBox: {
    backgroundColor: colors.background.primary,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  fingerprintLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    marginBottom: 8,
  },
  fingerprintValue: {
    color: colors.text.primary,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
  },
  modalNote: {
    color: '#eab308',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  modalCancelText: {
    color: colors.text.secondary,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary.main,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});

