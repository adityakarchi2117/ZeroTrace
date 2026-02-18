import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  verificationAPI,
  VerificationRequest,
  getStatusColor,
  formatVerificationType,
} from '../../services/verificationApi';

export default function VerificationHistoryScreen() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const data = await verificationAPI.getMyRequests();
      setRequests(data.sort((a, b) => 
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      ));
    } catch (error: any) {
      console.error('Failed to load requests:', error);
      Alert.alert('Error', 'Failed to load verification history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRequests();
  };

  const renderRequest = (request: VerificationRequest) => {
    const statusColor = getStatusColor(request.status);

    return (
      <View key={request.id} style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <Text style={styles.requestType}>
            {formatVerificationType(request.verification_type)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>
              {request.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.requestDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Submitted:</Text>
            <Text style={styles.detailValue}>
              {new Date(request.submitted_at).toLocaleDateString()}
            </Text>
          </View>

          {request.reviewed_at && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reviewed:</Text>
              <Text style={styles.detailValue}>
                {new Date(request.reviewed_at).toLocaleDateString()}
              </Text>
            </View>
          )}

          {request.notes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesLabel}>Your Notes:</Text>
              <Text style={styles.notesText}>{request.notes}</Text>
            </View>
          )}

          {request.rejection_reason && (
            <View style={styles.rejectionSection}>
              <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
              <Text style={styles.rejectionText}>{request.rejection_reason}</Text>
            </View>
          )}
        </View>

        {request.status === 'pending' && (
          <View style={styles.pendingNote}>
            <Text style={styles.pendingNoteText}>
              ⏳ Your request is being reviewed. This typically takes 3-5 business days.
            </Text>
          </View>
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
          <Text style={styles.title}>Verification History</Text>
          <Text style={styles.subtitle}>
            {requests.length === 0
              ? 'No verification requests yet'
              : `${requests.length} request${requests.length > 1 ? 's' : ''}`}
          </Text>
        </View>

        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No History</Text>
            <Text style={styles.emptyText}>
              You haven't submitted any verification requests yet
            </Text>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {requests.map(renderRequest)}
          </View>
        )}
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
  requestsList: {
    padding: 16,
  },
  requestCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestType: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  requestDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  detailValue: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  notesSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  rejectionSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  rejectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FCA5A5',
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 13,
    color: '#FECACA',
    lineHeight: 18,
  },
  pendingNote: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#1E3A5F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  pendingNoteText: {
    fontSize: 13,
    color: '#93C5FD',
    lineHeight: 18,
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
  },
});
