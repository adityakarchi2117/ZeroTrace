/**
 * WallpaperSettingsScreen — Full wallpaper customization.
 * Mirrors web's WallpaperSettings.tsx with preset gallery,
 * custom image upload, URL input, opacity/blur adjustments, and live preview.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Dimensions,
  Image,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';

import { colors } from '../../theme/colors';
import { Glassmorphism } from '../../components/motion/Glassmorphism';
import {
  loadAppearanceSettings,
  saveAppearanceSettings,
  AppearanceSettings,
  WallpaperSettings,
  presetWallpapers,
} from '../../services/appearanceService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PRESET_SIZE = (SCREEN_WIDTH - 80) / 4;
const WALLPAPER_STORAGE_KEY = 'zerotrace_wallpaper_custom';

const WallpaperSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [settings, setSettings] = useState<AppearanceSettings | null>(null);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await loadAppearanceSettings();
    setSettings(data);
    // Load custom wallpaper
    const saved = await AsyncStorage.getItem(WALLPAPER_STORAGE_KEY);
    if (saved) setCustomImage(saved);
  };

  const updateWallpaper = async (update: Partial<WallpaperSettings>) => {
    if (!settings) return;
    const newWallpaper = { ...settings.wallpaper, ...update };
    const newSettings = { ...settings, wallpaper: newWallpaper };
    setSettings(newSettings);
    await saveAppearanceSettings(newSettings);
  };

  const handlePresetSelect = (presetId: string) => {
    updateWallpaper({ type: 'preset', value: presetId, enabled: presetId !== 'none' });
  };

  const handleImagePick = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.8,
      });

      if (result.assets?.[0]?.uri) {
        const imageUri = result.assets[0].uri;
        await AsyncStorage.setItem(WALLPAPER_STORAGE_KEY, imageUri);
        setCustomImage(imageUri);
        updateWallpaper({ type: 'custom', value: 'custom', enabled: true });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load image');
    }
  };

  const handleDeleteCustom = async () => {
    await AsyncStorage.removeItem(WALLPAPER_STORAGE_KEY);
    setCustomImage(null);
    updateWallpaper({ type: 'preset', value: 'none', enabled: false });
  };

  const handleUrlApply = () => {
    if (urlInput.trim()) {
      updateWallpaper({ type: 'custom', value: urlInput.trim(), enabled: true });
      setShowUrlInput(false);
    }
  };

  if (!settings) return <View style={styles.container} />;

  const wallpaper = settings.wallpaper;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Glassmorphism style={styles.header} blur="lg">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Icon name="image" size={22} color="#06B6D4" />
          <Text style={styles.headerTitle}>Chat Wallpaper</Text>
        </View>
      </Glassmorphism>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Enable Toggle */}
        <View style={styles.toggleSection}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Enable Wallpaper</Text>
            <Text style={styles.toggleDesc}>Show background in chat</Text>
          </View>
          <Switch
            value={wallpaper.enabled}
            onValueChange={(val) => updateWallpaper({ enabled: val })}
            trackColor={{ false: colors.background.tertiary, true: '#06B6D4' }}
            thumbColor="#FFF"
          />
        </View>

        {/* Preset Wallpapers */}
        <Text style={styles.sectionTitle}>Presets</Text>
        <View style={styles.presetsGrid}>
          {presetWallpapers.map((preset) => {
            const isSelected = wallpaper.type === 'preset' && wallpaper.value === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetItem, isSelected && styles.presetItemSelected]}
                onPress={() => handlePresetSelect(preset.id)}
              >
                {preset.id === 'none' ? (
                  <View style={styles.presetNone}>
                    <Icon name="close-circle" size={24} color={colors.text.muted} />
                  </View>
                ) : (
                  <LinearGradient
                    colors={preset.colors}
                    style={styles.presetGradient}
                  />
                )}
                {isSelected && (
                  <View style={styles.presetCheck}>
                    <Icon name="checkmark" size={14} color="#FFF" />
                  </View>
                )}
                <Text style={styles.presetName} numberOfLines={1}>{preset.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Upload */}
        <Text style={styles.sectionTitle}>Custom Image</Text>
        <TouchableOpacity style={styles.uploadZone} onPress={handleImagePick}>
          {customImage ? (
            <View style={styles.customPreviewContainer}>
              <Image source={{ uri: customImage }} style={styles.customPreview} />
              <TouchableOpacity style={styles.deleteCustom} onPress={handleDeleteCustom}>
                <Icon name="trash" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Icon name="cloud-upload" size={32} color={colors.text.muted} />
              <Text style={styles.uploadText}>Tap to choose an image</Text>
              <Text style={styles.uploadHint}>Max 5MB • JPG, PNG</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* URL Input */}
        <TouchableOpacity
          style={styles.urlToggle}
          onPress={() => setShowUrlInput(!showUrlInput)}
        >
          <Icon name="link" size={18} color="#06B6D4" />
          <Text style={styles.urlToggleText}>Set from URL</Text>
          <Icon name={showUrlInput ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text.muted} />
        </TouchableOpacity>

        {showUrlInput && (
          <View style={styles.urlInputRow}>
            <TextInput
              style={styles.urlInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://example.com/wallpaper.jpg"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity
              style={[styles.urlApplyBtn, !urlInput.trim() && { opacity: 0.5 }]}
              onPress={handleUrlApply}
              disabled={!urlInput.trim()}
            >
              <Text style={styles.urlApplyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Adjustments */}
        <Text style={styles.sectionTitle}>Adjustments</Text>
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Opacity</Text>
            <Text style={styles.sliderValue}>{wallpaper.opacity}%</Text>
          </View>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${wallpaper.opacity}%` }]} />
            <TouchableOpacity
              style={[styles.sliderThumb, { left: `${wallpaper.opacity}%` }]}
              onPress={() => {}}
            />
          </View>
          {/* Simple buttons for adjustment */}
          <View style={styles.adjustRow}>
            <TouchableOpacity
              style={styles.adjustBtn}
              onPress={() => updateWallpaper({ opacity: Math.max(10, wallpaper.opacity - 10) })}
            >
              <Icon name="remove" size={18} color={colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.adjustBtn}
              onPress={() => updateWallpaper({ opacity: Math.min(100, wallpaper.opacity + 10) })}
            >
              <Icon name="add" size={18} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Blur</Text>
            <Text style={styles.sliderValue}>{wallpaper.blur}px</Text>
          </View>
          <View style={styles.adjustRow}>
            <TouchableOpacity
              style={styles.adjustBtn}
              onPress={() => updateWallpaper({ blur: Math.max(0, wallpaper.blur - 2) })}
            >
              <Icon name="remove" size={18} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.adjustValue}>{wallpaper.blur}</Text>
            <TouchableOpacity
              style={styles.adjustBtn}
              onPress={() => updateWallpaper({ blur: Math.min(20, wallpaper.blur + 2) })}
            >
              <Icon name="add" size={18} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Preview */}
        <Text style={styles.sectionTitle}>Preview</Text>
        <View style={styles.previewContainer}>
          {wallpaper.enabled && wallpaper.value !== 'none' && wallpaper.type === 'preset' ? (
            <LinearGradient
              colors={presetWallpapers.find(p => p.id === wallpaper.value)?.colors || ['#1a1a2e', '#16213e']}
              style={[styles.previewBg, { opacity: wallpaper.opacity / 100 }]}
            />
          ) : wallpaper.enabled && customImage ? (
            <Image
              source={{ uri: customImage }}
              style={[styles.previewBg, { opacity: wallpaper.opacity / 100 }]}
              blurRadius={wallpaper.blur}
            />
          ) : null}
          {/* Mock messages */}
          <View style={styles.previewMessages}>
            <View style={[styles.previewBubble, styles.previewBubbleLeft]}>
              <View style={styles.previewBar} />
            </View>
            <View style={[styles.previewBubble, styles.previewBubbleRight]}>
              <View style={[styles.previewBar, { width: 60 }]} />
            </View>
            <View style={[styles.previewBubble, styles.previewBubbleLeft]}>
              <View style={[styles.previewBar, { width: 80 }]} />
            </View>
          </View>
        </View>
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
    gap: 10,
  },
  backButton: {
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  toggleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.secondary,
    padding: 16,
    borderRadius: 14,
    marginBottom: 24,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  presetItem: {
    alignItems: 'center',
    width: PRESET_SIZE,
  },
  presetItemSelected: {},
  presetGradient: {
    width: PRESET_SIZE,
    height: PRESET_SIZE,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetNone: {
    width: PRESET_SIZE,
    height: PRESET_SIZE,
    borderRadius: 14,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  presetCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#06B6D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetName: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 6,
    textAlign: 'center',
  },
  uploadZone: {
    marginBottom: 16,
  },
  uploadPlaceholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border.primary,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background.secondary,
  },
  uploadText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  uploadHint: {
    fontSize: 12,
    color: colors.text.muted,
  },
  customPreviewContainer: {
    position: 'relative',
  },
  customPreview: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    backgroundColor: colors.background.secondary,
  },
  deleteCustom: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  urlToggleText: {
    fontSize: 14,
    color: '#06B6D4',
    flex: 1,
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  urlInput: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  urlApplyBtn: {
    backgroundColor: '#06B6D4',
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
  },
  urlApplyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  sliderSection: {
    backgroundColor: colors.background.secondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sliderLabel: {
    fontSize: 14,
    color: colors.text.primary,
  },
  sliderValue: {
    fontSize: 14,
    color: '#06B6D4',
    fontWeight: '600',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: colors.background.tertiary,
    borderRadius: 2,
    marginBottom: 8,
  },
  sliderFill: {
    height: 4,
    backgroundColor: '#06B6D4',
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#06B6D4',
    marginLeft: -8,
  },
  adjustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  adjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustValue: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  previewContainer: {
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    marginBottom: 20,
  },
  previewBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  previewMessages: {
    padding: 16,
    gap: 8,
  },
  previewBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    maxWidth: '60%',
  },
  previewBubbleLeft: {
    backgroundColor: 'rgba(55, 65, 81, 0.7)',
    alignSelf: 'flex-start',
  },
  previewBubbleRight: {
    backgroundColor: 'rgba(59, 130, 246, 0.7)',
    alignSelf: 'flex-end',
  },
  previewBar: {
    width: 100,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
});

export default WallpaperSettingsScreen;
