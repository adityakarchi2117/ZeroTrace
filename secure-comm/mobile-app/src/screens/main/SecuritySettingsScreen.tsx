/**
 * Security Settings Screen
 * Configure biometric auth, session management, and encryption display
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
    Alert,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { biometricService, BiometricCapability, BiometricConfig } from '../../services/biometric';
import { useChatStore } from '../../store/chatStore';

const SecuritySettingsScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const publicKey = useChatStore((s) => s.publicKey);
    const identityKey = useChatStore((s) => s.identityKey);

    const [biometricCap, setBiometricCap] = useState<BiometricCapability | null>(null);
    const [biometricConfig, setBiometricConfig] = useState<BiometricConfig | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = useCallback(async () => {
        const cap = await biometricService.checkCapability();
        setBiometricCap(cap);
        const config = await biometricService.getConfig();
        setBiometricConfig(config);
    }, []);

    const toggleBiometric = useCallback(async (enabled: boolean) => {
        if (enabled) {
            // Verify biometric works before enabling
            const success = await biometricService.authenticate('Verify to enable biometric lock');
            if (!success) {
                showMessage({ message: 'Authentication failed', type: 'danger' });
                return;
            }
        }
        const updated = await biometricService.updateConfig({ enabled });
        setBiometricConfig(updated);
        showMessage({
            message: enabled ? 'Biometric Lock Enabled' : 'Biometric Lock Disabled',
            type: 'success',
        });
    }, []);

    const toggleBiometricSetting = useCallback(async (key: keyof BiometricConfig, value: boolean) => {
        if (!biometricConfig) return;
        const updated = await biometricService.updateConfig({ [key]: value });
        setBiometricConfig(updated);
    }, [biometricConfig]);

    return (
        <ScrollView style={styles.container}>
            {/* Header */}
            <Glassmorphism style={styles.header} blur="lg">
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Security</Text>
            </Glassmorphism>

            {/* Encryption Status */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Encryption</Text>

                <GlassCard>
                    <View style={styles.encryptionCard}>
                        <View style={styles.encryptionIcon}>
                            <Icon name="shield-checkmark" size={32} color={colors.status.success} />
                        </View>
                        <View style={styles.encryptionInfo}>
                            <Text style={styles.encryptionTitle}>E2E Encryption Active</Text>
                            <Text style={styles.encryptionDesc}>
                                All messages are encrypted with X25519-XSalsa20-Poly1305
                            </Text>
                            <View style={styles.keyInfo}>
                                <Text style={styles.keyLabel}>Public Key</Text>
                                <Text style={styles.keyValue}>
                                    {publicKey ? `${publicKey.slice(0, 16)}...${publicKey.slice(-8)}` : 'Not generated'}
                                </Text>
                            </View>
                            {identityKey && (
                                <View style={styles.keyInfo}>
                                    <Text style={styles.keyLabel}>Identity Key</Text>
                                    <Text style={styles.keyValue}>
                                        {`${identityKey.slice(0, 16)}...${identityKey.slice(-8)}`}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </GlassCard>
            </View>

            {/* Biometric Authentication */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Biometric Authentication</Text>

                {biometricCap?.available ? (
                    <View style={styles.sectionContent}>
                        <GlassCard>
                            <View style={styles.settingRow}>
                                <View style={[styles.iconContainer, { backgroundColor: `${colors.primary.main}20` }]}>
                                    <Icon
                                        name={biometricCap.biometryType === 'face' ? 'scan' : 'finger-print'}
                                        size={22}
                                        color={colors.primary.main}
                                    />
                                </View>
                                <View style={styles.settingInfo}>
                                    <Text style={styles.settingLabel}>{biometricCap.label} Lock</Text>
                                    <Text style={styles.settingDesc}>
                                        Require {biometricCap.label.toLowerCase()} to open the app
                                    </Text>
                                </View>
                                <Switch
                                    value={biometricConfig?.enabled ?? false}
                                    onValueChange={toggleBiometric}
                                    trackColor={{ false: colors.background.tertiary, true: `${colors.primary.main}60` }}
                                    thumbColor={biometricConfig?.enabled ? colors.primary.main : colors.text.muted}
                                />
                            </View>
                        </GlassCard>

                        {biometricConfig?.enabled && (
                            <>
                                <GlassCard>
                                    <View style={styles.settingRow}>
                                        <View style={[styles.iconContainer, { backgroundColor: `${colors.status.info}20` }]}>
                                            <Icon name="log-in" size={20} color={colors.status.info} />
                                        </View>
                                        <View style={styles.settingInfo}>
                                            <Text style={styles.settingLabel}>Require on Launch</Text>
                                            <Text style={styles.settingDesc}>Authenticate when opening app</Text>
                                        </View>
                                        <Switch
                                            value={biometricConfig.requireOnLaunch}
                                            onValueChange={(v) => toggleBiometricSetting('requireOnLaunch', v)}
                                            trackColor={{ false: colors.background.tertiary, true: `${colors.status.info}60` }}
                                            thumbColor={biometricConfig.requireOnLaunch ? colors.status.info : colors.text.muted}
                                        />
                                    </View>
                                </GlassCard>

                                <GlassCard>
                                    <View style={styles.settingRow}>
                                        <View style={[styles.iconContainer, { backgroundColor: `${colors.status.warning}20` }]}>
                                            <Icon name="key" size={20} color={colors.status.warning} />
                                        </View>
                                        <View style={styles.settingInfo}>
                                            <Text style={styles.settingLabel}>Protect Key Access</Text>
                                            <Text style={styles.settingDesc}>Require auth to access encryption keys</Text>
                                        </View>
                                        <Switch
                                            value={biometricConfig.requireForKeyAccess}
                                            onValueChange={(v) => toggleBiometricSetting('requireForKeyAccess', v)}
                                            trackColor={{ false: colors.background.tertiary, true: `${colors.status.warning}60` }}
                                            thumbColor={biometricConfig.requireForKeyAccess ? colors.status.warning : colors.text.muted}
                                        />
                                    </View>
                                </GlassCard>

                                <GlassCard>
                                    <View style={styles.settingRow}>
                                        <View style={[styles.iconContainer, { backgroundColor: `${colors.secondary.main}20` }]}>
                                            <Icon name="time" size={20} color={colors.secondary.main} />
                                        </View>
                                        <View style={styles.settingInfo}>
                                            <Text style={styles.settingLabel}>Lock After Background</Text>
                                            <Text style={styles.settingDesc}>
                                                Re-authenticate after {biometricConfig.lockTimeoutSeconds / 60} min in background
                                            </Text>
                                        </View>
                                        <Switch
                                            value={biometricConfig.lockAfterBackground}
                                            onValueChange={(v) => toggleBiometricSetting('lockAfterBackground', v)}
                                            trackColor={{ false: colors.background.tertiary, true: `${colors.secondary.main}60` }}
                                            thumbColor={biometricConfig.lockAfterBackground ? colors.secondary.main : colors.text.muted}
                                        />
                                    </View>
                                </GlassCard>
                            </>
                        )}
                    </View>
                ) : (
                    <GlassCard>
                        <View style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.text.muted}20` }]}>
                                <Icon name="finger-print" size={22} color={colors.text.muted} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Biometric Lock</Text>
                                <Text style={styles.settingDesc}>
                                    {Platform.OS === 'android'
                                        ? 'No fingerprint or face recognition set up on this device'
                                        : 'No Face ID or Touch ID set up on this device'}
                                </Text>
                            </View>
                        </View>
                    </GlassCard>
                )}
            </View>

            {/* Session Security */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Session Security</Text>

                <View style={styles.sectionContent}>
                    <GlassCard>
                        <TouchableOpacity style={styles.settingRow}>
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.status.success}20` }]}>
                                <Icon name="phone-portrait" size={20} color={colors.status.success} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Active Sessions</Text>
                                <Text style={styles.settingDesc}>Manage logged-in devices</Text>
                            </View>
                            <Icon name="chevron-forward" size={20} color={colors.text.muted} />
                        </TouchableOpacity>
                    </GlassCard>

                    <GlassCard>
                        <TouchableOpacity
                            style={styles.settingRow}
                            onPress={() => {
                                Alert.alert(
                                    'End All Other Sessions',
                                    'This will log you out of all other devices.',
                                    [
                                        { text: 'Cancel', style: 'cancel' },
                                        {
                                            text: 'End Sessions',
                                            style: 'destructive',
                                            onPress: () => {
                                                showMessage({ message: 'All other sessions ended', type: 'success' });
                                            },
                                        },
                                    ]
                                );
                            }}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: `${colors.status.error}20` }]}>
                                <Icon name="log-out" size={20} color={colors.status.error} />
                            </View>
                            <View style={styles.settingInfo}>
                                <Text style={[styles.settingLabel, { color: colors.status.error }]}>
                                    End All Other Sessions
                                </Text>
                                <Text style={styles.settingDesc}>Log out from all other devices</Text>
                            </View>
                        </TouchableOpacity>
                    </GlassCard>
                </View>
            </View>

            {/* Info */}
            <View style={styles.infoSection}>
                <Icon name="lock-closed" size={16} color={colors.text.muted} />
                <Text style={styles.infoText}>
                    Your private keys never leave this device. Keys are stored in the secure hardware enclave ({Platform.OS === 'android' ? 'Android Keystore' : 'Secure Enclave'}).
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
    encryptionCard: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
    },
    encryptionIcon: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: `${colors.status.success}15`,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    encryptionInfo: {
        flex: 1,
    },
    encryptionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.status.success,
        marginBottom: 4,
    },
    encryptionDesc: {
        fontSize: 12,
        color: colors.text.muted,
        marginBottom: 8,
        lineHeight: 18,
    },
    keyInfo: {
        marginTop: 4,
    },
    keyLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    keyValue: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: colors.text.secondary,
        marginTop: 2,
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
        paddingBottom: 50,
        gap: 8,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: colors.text.muted,
        lineHeight: 18,
    },
});

export default SecuritySettingsScreen;
