import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { Glassmorphism } from '../../components/motion/Glassmorphism';
import {
    loadAppearanceSettings,
    saveAppearanceSettings,
    AppearanceSettings,
    accentColors,
    AccentColor,
    bubbleStyleConfig,
    BubbleStyle,
    fontStyleConfig,
    FontStyle,
    fontSizeValues,
    FontSize,
    densityValues,
    ChatDensity,
    ThemeMode,
} from '../../services/appearanceService';

const AppearanceSettingsScreen: React.FC = () => {
    const navigation = useNavigation();
    const [settings, setSettings] = useState<AppearanceSettings | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const data = await loadAppearanceSettings();
        setSettings(data);
    };

    const updateSetting = async (key: keyof AppearanceSettings, value: any) => {
        if (!settings) return;
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        await saveAppearanceSettings(newSettings);
        // In a real app, you might use a Context or Event Emitter to trigger immediate re-render of themed components
    };

    if (!settings) return <View style={styles.container} />;

    const renderSectionHeader = (title: string) => (
        <Text style={styles.sectionHeader}>{title}</Text>
    );

    const renderColorOption = (key: AccentColor) => {
        const color = accentColors[key];
        const isSelected = settings.accent === key;
        return (
            <TouchableOpacity
                key={key}
                style={[
                    styles.colorOption,
                    { backgroundColor: color.primary },
                    isSelected && styles.colorOptionSelected,
                ]}
                onPress={() => updateSetting('accent', key)}
            >
                {isSelected && <Icon name="checkmark" size={16} color="#FFF" />}
            </TouchableOpacity>
        );
    };

    const renderThemeOption = (mode: ThemeMode, icon: string, label: string) => {
        const isSelected = settings.theme === mode;
        return (
            <TouchableOpacity
                style={[
                    styles.optionCard,
                    isSelected && { borderColor: colors.primary.main, borderWidth: 2 },
                ]}
                onPress={() => updateSetting('theme', mode)}
            >
                <Icon
                    name={icon}
                    size={24}
                    color={isSelected ? colors.primary.main : colors.text.secondary}
                />
                <Text
                    style={[
                        styles.optionLabel,
                        isSelected && { color: colors.primary.main, fontWeight: 'bold' },
                    ]}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <Glassmorphism style={styles.header} blur="lg">
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Icon name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Appearance</Text>
                </View>
            </Glassmorphism>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Theme Mode */}
                {renderSectionHeader('Theme')}
                <View style={styles.optionsRow}>
                    {renderThemeOption('light', 'sunny', 'Light')}
                    {renderThemeOption('dark', 'moon', 'Dark')}
                    {renderThemeOption('system', 'settings', 'System')}
                </View>

                {/* Accent Color */}
                {renderSectionHeader('Accent Color')}
                <View style={styles.colorsRow}>
                    {(Object.keys(accentColors) as AccentColor[]).map(renderColorOption)}
                </View>

                {/* Bubble Style */}
                {renderSectionHeader('Chat Bubbles')}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                    {Object.entries(bubbleStyleConfig).map(([key, config]) => (
                        <TouchableOpacity
                            key={key}
                            style={[
                                styles.bubbleOption,
                                settings.bubbleStyle === key && styles.selectedBubbleOption,
                            ]}
                            onPress={() => updateSetting('bubbleStyle', key as BubbleStyle)}
                        >
                            <View style={[
                                styles.bubblePreview,
                                {
                                    borderRadius: config.borderRadius,
                                    borderWidth: config.borderWidth,
                                    borderColor: config.borderWidth > 0 ? colors.border.primary : 'transparent',
                                    backgroundColor: settings.bubbleStyle === key ? colors.primary.main : colors.background.secondary,
                                }
                            ]}>
                                <Text style={{ color: settings.bubbleStyle === key ? '#FFF' : colors.text.primary }}>Hi</Text>
                            </View>
                            <Text style={styles.bubbleLabel}>{config.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Font Style */}
                {renderSectionHeader('Font Style')}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                    {Object.entries(fontStyleConfig).map(([key, config]) => (
                        <TouchableOpacity
                            key={key}
                            style={[
                                styles.bubbleOption,
                                settings.fontStyle === key && styles.selectedBubbleOption,
                            ]}
                            onPress={() => updateSetting('fontStyle', key as FontStyle)}
                        >
                            <View style={styles.fontPreview}>
                                <Text style={[styles.fontPreviewText, { fontFamily: config.family }]}>Aa</Text>
                            </View>
                            <Text style={styles.bubbleLabel}>{config.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Other Toggles */}
                {renderSectionHeader('Display')}

                {/* Font Size */}
                <Text style={styles.subLabel}>Font Size</Text>
                <View style={styles.optionsRow}>
                    {(['small', 'medium', 'large'] as FontSize[]).map((size) => {
                        const isSelected = settings.fontSize === size;
                        const vals = fontSizeValues[size];
                        return (
                            <TouchableOpacity
                                key={size}
                                style={[
                                    styles.optionCard,
                                    isSelected && { borderColor: colors.primary.main, borderWidth: 2 },
                                ]}
                                onPress={() => updateSetting('fontSize', size)}
                            >
                                <Text style={{
                                    fontSize: vals.base,
                                    color: isSelected ? colors.primary.main : colors.text.secondary,
                                    fontWeight: isSelected ? 'bold' : 'normal',
                                }}>
                                    Aa
                                </Text>
                                <Text style={[
                                    styles.optionLabel,
                                    isSelected && { color: colors.primary.main, fontWeight: 'bold' },
                                ]}>
                                    {size.charAt(0).toUpperCase() + size.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Chat Density */}
                <Text style={[styles.subLabel, { marginTop: 16 }]}>Chat Density</Text>
                <View style={styles.optionsRow}>
                    {(['compact', 'comfortable', 'spacious'] as ChatDensity[]).map((density) => {
                        const isSelected = settings.density === density;
                        const densityIcons: Record<ChatDensity, string> = {
                            compact: 'list',
                            comfortable: 'reorder-three',
                            spacious: 'reorder-four',
                        };
                        return (
                            <TouchableOpacity
                                key={density}
                                style={[
                                    styles.optionCard,
                                    isSelected && { borderColor: colors.primary.main, borderWidth: 2 },
                                ]}
                                onPress={() => updateSetting('density', density)}
                            >
                                <Icon
                                    name={densityIcons[density]}
                                    size={22}
                                    color={isSelected ? colors.primary.main : colors.text.secondary}
                                />
                                <Text style={[
                                    styles.optionLabel,
                                    isSelected && { color: colors.primary.main, fontWeight: 'bold' },
                                ]}>
                                    {density.charAt(0).toUpperCase() + density.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Wallpaper */}
                {renderSectionHeader('Wallpaper')}
                <TouchableOpacity
                    style={styles.wallpaperNav}
                    onPress={() => (navigation as any).navigate('WallpaperSettings')}
                >
                    <View style={styles.wallpaperPreview}>
                        {settings.wallpaper?.enabled ? (
                            <Icon name="image" size={24} color={colors.primary.main} />
                        ) : (
                            <Icon name="image-outline" size={24} color={colors.text.muted} />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.toggleLabel}>Chat Wallpaper</Text>
                        <Text style={{ fontSize: 12, color: colors.text.muted, marginTop: 2 }}>
                            {settings.wallpaper?.enabled ? 'Custom wallpaper active' : 'Default background'}
                        </Text>
                    </View>
                    <Icon name="chevron-forward" size={20} color={colors.text.muted} />
                </TouchableOpacity>

                <View style={{ height: 12 }} />
                <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Message Previews</Text>
                    <Switch
                        value={settings.messagePreview}
                        onValueChange={(val) => updateSetting('messagePreview', val)}
                        trackColor={{ false: colors.background.tertiary, true: colors.primary.main }}
                        thumbColor={'#FFF'}
                    />
                </View>
                <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Animations</Text>
                    <Switch
                        value={settings.animationsEnabled}
                        onValueChange={(val) => updateSetting('animationsEnabled', val)}
                        trackColor={{ false: colors.background.tertiary, true: colors.primary.main }}
                        thumbColor={'#FFF'}
                    />
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
    },
    backButton: {
        marginRight: 16,
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
    sectionHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.secondary,
        textTransform: 'uppercase',
        marginTop: 24,
        marginBottom: 12,
    },
    optionsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    optionCard: {
        flex: 1,
        backgroundColor: colors.background.secondary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 80,
    },
    optionLabel: {
        marginTop: 8,
        fontSize: 14,
        color: colors.text.secondary,
    },
    colorsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    colorOption: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    colorOptionSelected: {
        borderWidth: 3,
        borderColor: colors.background.primary,
        elevation: 4,
    },
    horizontalScroll: {
        marginHorizontal: -20,
        paddingHorizontal: 20,
    },
    bubbleOption: {
        alignItems: 'center',
        marginRight: 16,
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    selectedBubbleOption: {
        backgroundColor: colors.background.secondary,
        borderColor: colors.primary.main,
    },
    bubblePreview: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        minWidth: 60,
        alignItems: 'center',
        marginBottom: 8,
    },
    bubbleLabel: {
        fontSize: 12,
        color: colors.text.secondary,
    },
    fontPreview: {
        width: 60,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background.tertiary,
        borderRadius: 8,
        marginBottom: 8,
    },
    fontPreviewText: {
        fontSize: 18,
        color: colors.text.primary,
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.primary,
    },
    toggleLabel: {
        fontSize: 16,
        color: colors.text.primary,
    },
    subLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text.muted,
        marginBottom: 8,
    },
    wallpaperNav: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: colors.background.secondary,
        borderRadius: 14,
        gap: 14,
    },
    wallpaperPreview: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: colors.background.tertiary,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default AppearanceSettingsScreen;
