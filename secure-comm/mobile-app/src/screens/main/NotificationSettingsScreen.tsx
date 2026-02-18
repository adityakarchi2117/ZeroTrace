/**
 * Notification Settings Screen
 * Configures push notification preferences
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { notificationService, NotificationConfig } from '../../services/notifications';

const NotificationSettingsScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const [config, setConfig] = useState<NotificationConfig | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = useCallback(async () => {
        const c = await notificationService.getConfig();
        setConfig(c);
    }, []);

    const toggleSetting = useCallback(async (key: keyof NotificationConfig, value: boolean) => {
        if (!config) return;
        const updated = { ...config, [key]: value };
        setConfig(updated);
        await notificationService.updateConfig({ [key]: value });
    }, [config]);

    if (!config) return null;

    return (
        <ScrollView style={styles.container}>
            {/* Header */}
            <Glassmorphism style={styles.header} blur="lg">
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notifications</Text>
            </Glassmorphism>

            {/* Master Toggle */}
            <View style={styles.section}>
                <GlassCard>
                    <View style={styles.settingRow}>
                        <View style={[styles.iconContainer, { backgroundColor: `${colors.primary.main}20` }]}>
                            <Icon name="notifications" size={22} color={colors.primary.main} />
                        </View>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>Enable Notifications</Text>
                            <Text style={styles.settingDesc}>Receive push notifications</Text>
                        </View>
                        <Switch
                            value={config.enabled}
                            onValueChange={(v) => toggleSetting('enabled', v)}
                            trackColor={{ false: colors.background.tertiary, true: `${colors.primary.main}60` }}
                            thumbColor={config.enabled ? colors.primary.main : colors.text.muted}
                        />
                    </View>
                </GlassCard>
            </View>

            {/* Message Notifications */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Messages</Text>

                <View style={styles.sectionContent}>
                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.status.success}20` }]}>
                                <Icon name="chatbubble" size={20} color={colors.status.success} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Message Notifications</Text>
                                <Text style={styles.settingDesc}>New message alerts</Text>
                            </View>
                            <Switch
                                value={config.messageNotifications}
                                onValueChange={(v) => toggleSetting('messageNotifications', v)}
                                trackColor={{ false: colors.background.tertiary, true: `${colors.status.success}60` }}
                                thumbColor={config.messageNotifications ? colors.status.success : colors.text.muted}
                                disabled={!config.enabled}
                            />
                        </View>
                    </GlassCard>

                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.status.info}20` }]}>
                                <Icon name="eye" size={20} color={colors.status.info} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Show Previews</Text>
                                <Text style={styles.settingDesc}>Display message content in notifications</Text>
                            </View>
                            <Switch
                                value={config.showPreviews}
                                onValueChange={(v) => toggleSetting('showPreviews', v)}
                                trackColor={{ false: colors.background.tertiary, true: `${colors.status.info}60` }}
                                thumbColor={config.showPreviews ? colors.status.info : colors.text.muted}
                                disabled={!config.enabled}
                            />
                        </View>
                    </GlassCard>
                </View>
            </View>

            {/* Call Notifications */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Calls</Text>

                <View style={styles.sectionContent}>
                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.primary.main}20` }]}>
                                <Icon name="call" size={20} color={colors.primary.main} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Call Notifications</Text>
                                <Text style={styles.settingDesc}>Incoming call alerts</Text>
                            </View>
                            <Switch
                                value={config.callNotifications}
                                onValueChange={(v) => toggleSetting('callNotifications', v)}
                                trackColor={{ false: colors.background.tertiary, true: `${colors.primary.main}60` }}
                                thumbColor={config.callNotifications ? colors.primary.main : colors.text.muted}
                                disabled={!config.enabled}
                            />
                        </View>
                    </GlassCard>
                </View>
            </View>

            {/* Social Notifications */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Social</Text>

                <View style={styles.sectionContent}>
                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.status.warning}20` }]}>
                                <Icon name="person-add" size={20} color={colors.status.warning} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Friend Requests</Text>
                                <Text style={styles.settingDesc}>New friend request alerts</Text>
                            </View>
                            <Switch
                                value={config.friendRequestNotifications}
                                onValueChange={(v) => toggleSetting('friendRequestNotifications', v)}
                                trackColor={{ false: colors.background.tertiary, true: `${colors.status.warning}60` }}
                                thumbColor={config.friendRequestNotifications ? colors.status.warning : colors.text.muted}
                                disabled={!config.enabled}
                            />
                        </View>
                    </GlassCard>
                </View>
            </View>

            {/* Sound & Vibration */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Alerts</Text>

                <View style={styles.sectionContent}>
                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.secondary.main}20` }]}>
                                <Icon name="musical-notes" size={20} color={colors.secondary.main} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Sound</Text>
                                <Text style={styles.settingDesc}>Play notification sounds</Text>
                            </View>
                            <Switch
                                value={config.sound}
                                onValueChange={(v) => toggleSetting('sound', v)}
                                trackColor={{ false: colors.background.tertiary, true: `${colors.secondary.main}60` }}
                                thumbColor={config.sound ? colors.secondary.main : colors.text.muted}
                                disabled={!config.enabled}
                            />
                        </View>
                    </GlassCard>

                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.secondary.main}20` }]}>
                                <Icon name="phone-portrait" size={20} color={colors.secondary.main} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Vibration</Text>
                                <Text style={styles.settingDesc}>Vibrate on notifications</Text>
                            </View>
                            <Switch
                                value={config.vibration}
                                onValueChange={(v) => toggleSetting('vibration', v)}
                                trackColor={{ false: colors.background.tertiary, true: `${colors.secondary.main}60` }}
                                thumbColor={config.vibration ? colors.secondary.main : colors.text.muted}
                                disabled={!config.enabled}
                            />
                        </View>
                    </GlassCard>
                </View>
            </View>

            {/* Info */}
            <View style={styles.infoSection}>
                <Icon name="information-circle" size={16} color={colors.text.muted} />
                <Text style={styles.infoText}>
                    Notifications are end-to-end encrypted. Message previews are generated locally on your device.
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        gap: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.text.primary,
    },
    section: {
        paddingHorizontal: 16,
        marginTop: 24,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text.muted,
        textTransform: 'uppercase',
        marginBottom: 12,
        marginLeft: 8,
    },
    sectionContent: {
        gap: 8,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingInfo: {
        flex: 1,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text.primary,
    },
    settingDesc: {
        fontSize: 13,
        color: colors.text.muted,
        marginTop: 2,
    },
    infoSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingVertical: 24,
        gap: 8,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: colors.text.muted,
        lineHeight: 18,
    },
});

export default NotificationSettingsScreen;
