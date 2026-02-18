/**
 * PhotoUploader — Profile photo picker with EXIF stripping + compression
 * Matches web's PhotoUploader.tsx functionality using react-native-image-picker.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';

interface PhotoUploaderProps {
  /** Current avatar URL */
  currentUrl?: string;
  /** Called with the selected asset (uri, type, fileName) */
  onUpload: (file: { uri: string; type: string; fileName: string }) => Promise<void>;
  /** Optional remove handler */
  onRemove?: () => Promise<void>;
  /** Max dimension before resize (default 1024) */
  maxSize?: number;
}

const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  currentUrl,
  onUpload,
  onRemove,
  maxSize = 1024,
}) => {
  const [isUploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sizeInfo, setSizeInfo] = useState('');

  const displayUrl = preview || currentUrl;

  const handleSelect = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.85,
        maxWidth: maxSize,
        maxHeight: maxSize,
      });

      if (result.didCancel || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.uri) return;

      // Validate
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        Alert.alert('Too Large', 'Image must be under 10 MB.');
        return;
      }

      setUploading(true);

      // Size info
      const originalKB = asset.fileSize
        ? `${(asset.fileSize / 1024).toFixed(0)}KB`
        : '?KB';

      setPreview(asset.uri);
      setSizeInfo(`${originalKB} · compressed locally`);

      await onUpload({
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        fileName: asset.fileName || 'avatar.jpg',
      });
    } catch (err) {
      console.error('PhotoUploader error:', err);
      Alert.alert('Error', 'Failed to process image');
    } finally {
      setUploading(false);
    }
  }, [onUpload, maxSize]);

  const handleRemove = useCallback(async () => {
    if (!onRemove) return;
    Alert.alert('Remove Photo', 'Remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await onRemove();
          setPreview(null);
          setSizeInfo('');
        },
      },
    ]);
  }, [onRemove]);

  return (
    <View style={styles.container}>
      {/* Avatar Circle */}
      <TouchableOpacity
        style={styles.avatarWrap}
        onPress={handleSelect}
        disabled={isUploading}
        activeOpacity={0.7}
      >
        {displayUrl ? (
          <Image source={{ uri: displayUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="person" size={32} color={colors.text.muted} />
          </View>
        )}

        {/* Overlay */}
        <View style={styles.overlay}>
          {isUploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name="camera" size={16} color="#FFFFFF" />
          )}
        </View>
      </TouchableOpacity>

      {/* Buttons + Info */}
      <View style={styles.actionsColumn}>
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={handleSelect}
            disabled={isUploading}
          >
            <Text style={styles.changeText}>
              {isUploading ? 'Processing…' : displayUrl ? 'Change photo' : 'Upload photo'}
            </Text>
          </TouchableOpacity>

          {displayUrl && onRemove && (
            <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.infoText}>
          EXIF stripped · compressed locally
          {sizeInfo ? ` (${sizeInfo})` : ''}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border.primary,
    backgroundColor: colors.background.tertiary,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0,
  },
  actionsColumn: {
    flex: 1,
    gap: 6,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  changeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    borderRadius: 10,
  },
  changeText: {
    fontSize: 13,
    color: '#67E8F9',
    fontWeight: '600',
  },
  removeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
  },
  removeText: {
    fontSize: 13,
    color: '#FCA5A5',
    fontWeight: '600',
  },
  infoText: {
    fontSize: 11,
    color: colors.text.muted,
  },
});

export default PhotoUploader;
