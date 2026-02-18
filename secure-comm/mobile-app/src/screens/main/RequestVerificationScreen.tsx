import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  verificationAPI,
  VerificationType,
  getBadgeColor,
  getBadgeIcon,
  getBadgeLabel,
  formatVerificationType,
} from '../../services/verificationApi';

const VERIFICATION_TYPES: VerificationType[] = [
  'identity',
  'organization',
  'developer',
  'creator',
  'business',
  'government',
  'media',
];

export default function RequestVerificationScreen() {
  const navigation = useNavigation();
  const [selectedType, setSelectedType] = useState<VerificationType | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Error', 'Please select a verification type');
      return;
    }

    if (!notes.trim()) {
      Alert.alert('Error', 'Please provide details about why you need this verification');
      return;
    }

    setSubmitting(true);
    try {
      await verificationAPI.createVerificationRequest({
        verification_type: selectedType,
        notes: notes.trim(),
        supporting_documents: {},
      });

      Alert.alert(
        'Request Submitted',
        'Your verification request has been submitted and will be reviewed by our team.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Failed to submit request:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit verification request');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTypeOption = (type: VerificationType) => {
    const isSelected = selectedType === type;
    const color = getBadgeColor(type);
    const icon = getBadgeIcon(type);
    const label = getBadgeLabel(type);

    return (
      <TouchableOpacity
        key={type}
        style={[
          styles.typeOption,
          isSelected && { borderColor: color, backgroundColor: color + '10' },
        ]}
        onPress={() => setSelectedType(type)}
      >
        <View style={[styles.typeIcon, { backgroundColor: color + '20' }]}>
          <Text style={[styles.typeIconText, { color }]}>{icon}</Text>
        </View>
        <View style={styles.typeInfo}>
          <Text style={styles.typeLabel}>{label}</Text>
          <Text style={styles.typeDescription}>{getTypeDescription(type)}</Text>
        </View>
        {isSelected && (
          <View style={[styles.checkmark, { backgroundColor: color }]}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Request Verification</Text>
          <Text style={styles.subtitle}>
            Choose the type of verification that best represents you or your organization
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Type</Text>
          <View style={styles.typesList}>
            {VERIFICATION_TYPES.map(renderTypeOption)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Information</Text>
          <Text style={styles.sectionSubtitle}>
            Tell us why you need this verification and provide any relevant details
          </Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Explain why you need this verification..."
            placeholderTextColor="#64748B"
            multiline
            numberOfLines={6}
            value={notes}
            onChangeText={setNotes}
            textAlignVertical="top"
          />
          <Text style={styles.helperText}>
            Include links to your website, social media profiles, or other proof of identity
          </Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Review Process</Text>
            <Text style={styles.infoText}>
              Your request will be reviewed by our team. This typically takes 3-5 business days.
              You'll be notified once your request is processed.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, (!selectedType || !notes.trim() || submitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!selectedType || !notes.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getTypeDescription(type: VerificationType): string {
  const descriptions: Record<VerificationType, string> = {
    identity: 'Verify your personal identity',
    organization: 'For non-profit organizations',
    developer: 'For software developers and engineers',
    creator: 'For content creators and artists',
    business: 'For businesses and companies',
    government: 'For government officials and agencies',
    media: 'For journalists and media outlets',
    custom: 'Custom verification type',
  };
  return descriptions[type] || '';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    lineHeight: 20,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  typesList: {
    gap: 12,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#334155',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  typeIconText: {
    fontSize: 24,
  },
  typeInfo: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 13,
    color: '#94A3B8',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  notesInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#334155',
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
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
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#334155',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
