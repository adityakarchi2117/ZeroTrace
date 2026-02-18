/**
 * ReportDialog — User report modal with reason selection and confirmation.
 * Mirrors web's ReportDialog.tsx identically.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { profileAPI, ReportReason } from '../../services/profileApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetUsername: string;
}

const reportReasons: { key: ReportReason; emoji: string; label: string }[] = [
  { key: 'fake_profile', emoji: '🎭', label: 'Fake Profile' },
  { key: 'impersonation', emoji: '👤', label: 'Impersonation' },
  { key: 'harassment', emoji: '⚠️', label: 'Harassment' },
  { key: 'spam', emoji: '📨', label: 'Spam' },
  { key: 'inappropriate', emoji: '🚫', label: 'Inappropriate' },
  { key: 'other', emoji: '📝', label: 'Other' },
];

const ReportDialog: React.FC<ReportDialogProps> = ({
  isOpen,
  onClose,
  targetUsername,
}) => {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason(null);
      setDescription('');
      setSubmitting(false);
      setSubmitted(false);
      setReportId(null);
    }
  }, [isOpen, targetUsername]);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const result = await profileAPI.reportUser({
        reported_username: targetUsername,
        reason,
        description: description.trim() || undefined,
      });
      setReportId(result.report_id);
      setSubmitted(true);
      showMessage({
        message: 'Report Submitted',
        description: 'Thank you for helping keep the community safe.',
        type: 'success',
      });
    } catch (e) {
      showMessage({
        message: 'Report Failed',
        description: 'Could not submit report. Please try again.',
        type: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {submitted ? (
            /* ─── Confirmation Phase ─── */
            <View style={styles.confirmContent}>
              <View style={styles.confirmIcon}>
                <Icon name="checkmark-circle" size={48} color="#06B6D4" />
              </View>
              <Text style={styles.confirmTitle}>Report Submitted</Text>
              <Text style={styles.confirmDesc}>
                We take reports seriously. Our team will review this report and take appropriate action.
              </Text>
              {reportId && (
                <View style={styles.reportIdBox}>
                  <Text style={styles.reportIdLabel}>Report ID</Text>
                  <Text style={styles.reportIdValue}>{reportId}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ─── Form Phase ─── */
            <ScrollView contentContainerStyle={styles.formContent}>
              {/* Header */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Report @{targetUsername}</Text>
                  <Text style={styles.subtitle}>Select a reason for your report</Text>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Icon name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Reason Grid */}
              <View style={styles.reasonGrid}>
                {reportReasons.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={[
                      styles.reasonCard,
                      reason === r.key && styles.reasonCardSelected,
                    ]}
                    onPress={() => setReason(r.key)}
                  >
                    <Text style={styles.reasonEmoji}>{r.emoji}</Text>
                    <Text
                      style={[
                        styles.reasonLabel,
                        reason === r.key && styles.reasonLabelSelected,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={styles.descLabel}>Additional Details (Optional)</Text>
              <TextInput
                style={styles.descInput}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe what happened..."
                placeholderTextColor={colors.text.muted}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/1000</Text>

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    !reason && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!reason || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: SCREEN_WIDTH - 48,
    maxHeight: '80%',
    backgroundColor: colors.background.primary,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  /* ── Form Phase ── */
  formContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  reasonCard: {
    width: (SCREEN_WIDTH - 48 - 48 - 10) / 2,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  reasonCardSelected: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  reasonEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  reasonLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  reasonLabelSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  descLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 8,
  },
  descInput: {
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: colors.text.primary,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  charCount: {
    fontSize: 11,
    color: colors.text.muted,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  /* ── Confirmation Phase ── */
  confirmContent: {
    padding: 32,
    alignItems: 'center',
  },
  confirmIcon: {
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  confirmDesc: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  reportIdBox: {
    backgroundColor: colors.background.secondary,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  reportIdLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 4,
  },
  reportIdValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#06B6D4',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  doneButton: {
    backgroundColor: 'rgba(6, 182, 212, 0.8)',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default ReportDialog;
