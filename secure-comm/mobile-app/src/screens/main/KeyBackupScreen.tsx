/**
 * Key Backup Screen
 * Allows user to create, export, and restore encryption key backups
 * Accessible from the Vault tab
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    Share,
    Clipboard,
    ActivityIndicator,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { showMessage } from 'react-native-flash-message';

import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { keyBackupService, KeyBackup } from '../../services/keyBackup';
import { useChatStore } from '../../store/chatStore';

const KeyBackupScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const publicKey = useChatStore((s) => s.publicKey);
    const privateKey = useChatStore((s) => s.privateKey);
    const identityKey = useChatStore((s) => s.identityKey);

    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [restorePassphrase, setRestorePassphrase] = useState('');
    const [restoreData, setRestoreData] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasLocalBackup, setHasLocalBackup] = useState(false);
    const [mode, setMode] = useState<'overview' | 'create' | 'restore'>('overview');

    useEffect(() => {
        checkLocalBackup();
    }, []);

    const checkLocalBackup = useCallback(async () => {
        const exists = await keyBackupService.hasLocalBackup();
        setHasLocalBackup(exists);
    }, []);

    // ─── Create Backup ──────────────────────

    const handleCreateBackup = useCallback(async () => {
        if (passphrase.length < 8) {
            showMessage({ message: 'Passphrase must be at least 8 characters', type: 'danger' });
            return;
        }
        if (passphrase !== confirmPassphrase) {
            showMessage({ message: 'Passphrases do not match', type: 'danger' });
            return;
        }
        if (!publicKey || !privateKey) {
            showMessage({ message: 'No keys found to backup', type: 'danger' });
            return;
        }

        setIsProcessing(true);
        try {
            const backup = await keyBackupService.createBackup(
                {
                    publicKey,
                    privateKey,
                    identityKey: identityKey || undefined,
                },
                passphrase
            );

            // Store locally
            await keyBackupService.storeBackupLocally(backup);
            setHasLocalBackup(true);

            // Offer to export
            Alert.alert(
                'Backup Created',
                'Your keys have been encrypted and stored locally. Would you like to export the backup?',
                [
                    { text: 'Later', style: 'cancel' },
                    {
                        text: 'Export',
                        onPress: () => handleExportBackup(backup),
                    },
                ]
            );

            setPassphrase('');
            setConfirmPassphrase('');
            setMode('overview');
        } catch (error: any) {
            showMessage({
                message: 'Backup Failed',
                description: error.message,
                type: 'danger',
            });
        } finally {
            setIsProcessing(false);
        }
    }, [passphrase, confirmPassphrase, publicKey, privateKey, identityKey]);

    // ─── Export Backup ──────────────────────

    const handleExportBackup = useCallback(async (backup?: KeyBackup) => {
        try {
            const backupToExport = backup || await keyBackupService.getLocalBackup();
            if (!backupToExport) {
                showMessage({ message: 'No backup found', type: 'warning' });
                return;
            }

            const backupStr = keyBackupService.exportBackupAsString(backupToExport);

            await Share.share({
                message: backupStr,
                title: 'ZeroTrace Key Backup',
            });
        } catch (error: any) {
            showMessage({
                message: 'Export failed',
                description: error.message,
                type: 'danger',
            });
        }
    }, []);

    // ─── Copy Backup to Clipboard ───────────

    const handleCopyBackup = useCallback(async () => {
        try {
            const backup = await keyBackupService.getLocalBackup();
            if (!backup) {
                showMessage({ message: 'No backup found', type: 'warning' });
                return;
            }
            const backupStr = keyBackupService.exportBackupAsString(backup);
            Clipboard.setString(backupStr);
            showMessage({ message: 'Backup copied to clipboard', type: 'success' });
        } catch (error: any) {
            showMessage({ message: 'Copy failed', description: error.message, type: 'danger' });
        }
    }, []);

    // ─── Restore Backup ────────────────────

    const handleRestore = useCallback(async () => {
        if (!restoreData.trim()) {
            showMessage({ message: 'Please paste your backup data', type: 'warning' });
            return;
        }
        if (!restorePassphrase) {
            showMessage({ message: 'Please enter your passphrase', type: 'warning' });
            return;
        }

        setIsProcessing(true);
        try {
            const backup = keyBackupService.importBackupFromString(restoreData.trim());
            const keys = await keyBackupService.restoreBackup(backup, restorePassphrase);

            Alert.alert(
                'Keys Restored',
                `Your encryption keys have been decrypted successfully.\n\nPublic Key: ${keys.publicKey.slice(0, 12)}...`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            // TODO: Store restored keys in chatStore
                            showMessage({ message: 'Keys restored successfully', type: 'success' });
                            setMode('overview');
                        },
                    },
                ]
            );
        } catch (error: any) {
            showMessage({
                message: 'Restore Failed',
                description: error.message,
                type: 'danger',
            });
        } finally {
            setIsProcessing(false);
        }
    }, [restoreData, restorePassphrase]);

    // ─── Delete Local Backup ────────────────

    const handleDeleteBackup = useCallback(() => {
        Alert.alert(
            'Delete Local Backup',
            'This will remove the key backup from this device. Make sure you have exported a copy.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await keyBackupService.removeLocalBackup();
                        setHasLocalBackup(false);
                        showMessage({ message: 'Local backup removed', type: 'info' });
                    },
                },
            ]
        );
    }, []);

    // ─── Render Overview ────────────────────

    const renderOverview = () => (
        <>
            {/* Status Card */}
            <View style={styles.section}>
                <GlassCard>
                    <View style={styles.statusCard}>
                        <TiltAvatar maxTilt={12} scale={1.05}>
                            <View style={[styles.statusIcon, { backgroundColor: hasLocalBackup ? `${colors.status.success}20` : `${colors.status.warning}20` }]}>
                                <Icon
                                    name={hasLocalBackup ? 'shield-checkmark' : 'shield-outline'}
                                    size={32}
                                    color={hasLocalBackup ? colors.status.success : colors.status.warning}
                                />
                            </View>
                        </TiltAvatar>
                        <View style={styles.statusInfo}>
                            <Text style={styles.statusTitle}>
                                {hasLocalBackup ? 'Backup Available' : 'No Backup'}
                            </Text>
                            <Text style={styles.statusDesc}>
                                {hasLocalBackup
                                    ? 'Your keys are backed up locally on this device.'
                                    : 'Create a backup to protect your encryption keys.'}
                            </Text>
                        </View>
                    </View>
                </GlassCard>
            </View>

            {/* Actions */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Actions</Text>

                <View style={styles.actionsGrid}>
                    <TouchableOpacity style={styles.actionCard} onPress={() => setMode('create')}>
                        <View style={[styles.actionIcon, { backgroundColor: `${colors.primary.main}20` }]}>
                            <Icon name="key" size={24} color={colors.primary.main} />
                        </View>
                        <Text style={styles.actionLabel}>Create Backup</Text>
                        <Text style={styles.actionDesc}>Encrypt & save keys</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionCard} onPress={() => setMode('restore')}>
                        <View style={[styles.actionIcon, { backgroundColor: `${colors.status.info}20` }]}>
                            <Icon name="download" size={24} color={colors.status.info} />
                        </View>
                        <Text style={styles.actionLabel}>Restore Keys</Text>
                        <Text style={styles.actionDesc}>From backup data</Text>
                    </TouchableOpacity>

                    {hasLocalBackup && (
                        <>
                            <TouchableOpacity style={styles.actionCard} onPress={() => handleExportBackup()}>
                                <View style={[styles.actionIcon, { backgroundColor: `${colors.status.success}20` }]}>
                                    <Icon name="share" size={24} color={colors.status.success} />
                                </View>
                                <Text style={styles.actionLabel}>Export</Text>
                                <Text style={styles.actionDesc}>Share backup file</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.actionCard} onPress={handleCopyBackup}>
                                <View style={[styles.actionIcon, { backgroundColor: `${colors.secondary.main}20` }]}>
                                    <Icon name="copy" size={24} color={colors.secondary.main} />
                                </View>
                                <Text style={styles.actionLabel}>Copy</Text>
                                <Text style={styles.actionDesc}>To clipboard</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {/* Danger Zone */}
            {hasLocalBackup && (
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.status.error }]}>Danger Zone</Text>
                    <GlassCard>
                        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteBackup}>
                            <Icon name="trash" size={22} color={colors.status.error} />
                            <Text style={styles.dangerText}>Delete Local Backup</Text>
                        </TouchableOpacity>
                    </GlassCard>
                </View>
            )}

            {/* Info */}
            <View style={styles.infoSection}>
                <Icon name="information-circle" size={16} color={colors.text.muted} />
                <Text style={styles.infoText}>
                    Key backups are encrypted with your passphrase using XSalsa20-Poly1305.
                    Store your passphrase securely — it cannot be recovered.
                </Text>
            </View>
        </>
    );

    // ─── Render Create Form ─────────────────

    const renderCreateForm = () => (
        <View style={styles.section}>
            <GlassCard>
                <View style={styles.formCard}>
                    <Text style={styles.formTitle}>Create Key Backup</Text>
                    <Text style={styles.formDesc}>
                        Enter a strong passphrase to encrypt your keys. You'll need this passphrase to restore your keys later.
                    </Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Passphrase</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.input}
                                value={passphrase}
                                onChangeText={setPassphrase}
                                secureTextEntry={!showPassphrase}
                                placeholder="Enter a strong passphrase (min 8 chars)"
                                placeholderTextColor={colors.text.muted}
                                autoCapitalize="none"
                            />
                            <TouchableOpacity onPress={() => setShowPassphrase(!showPassphrase)}>
                                <Icon
                                    name={showPassphrase ? 'eye-off' : 'eye'}
                                    size={22}
                                    color={colors.text.muted}
                                />
                            </TouchableOpacity>
                        </View>
                        {passphrase.length > 0 && passphrase.length < 8 && (
                            <Text style={styles.inputError}>Min 8 characters required</Text>
                        )}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Confirm Passphrase</Text>
                        <TextInput
                            style={styles.input}
                            value={confirmPassphrase}
                            onChangeText={setConfirmPassphrase}
                            secureTextEntry
                            placeholder="Re-enter passphrase"
                            placeholderTextColor={colors.text.muted}
                            autoCapitalize="none"
                        />
                        {confirmPassphrase.length > 0 && passphrase !== confirmPassphrase && (
                            <Text style={styles.inputError}>Passphrases don't match</Text>
                        )}
                    </View>

                    <View style={styles.formButtons}>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => { setMode('overview'); setPassphrase(''); setConfirmPassphrase(''); }}
                        >
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.createBtn, isProcessing && styles.btnDisabled]}
                            onPress={handleCreateBackup}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Icon name="shield-checkmark" size={18} color="#fff" />
                                    <Text style={styles.createBtnText}>Create Backup</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </GlassCard>
        </View>
    );

    // ─── Render Restore Form ────────────────

    const renderRestoreForm = () => (
        <View style={styles.section}>
            <GlassCard>
                <View style={styles.formCard}>
                    <Text style={styles.formTitle}>Restore Keys</Text>
                    <Text style={styles.formDesc}>
                        Paste your backup data and enter the passphrase used during creation.
                    </Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Backup Data</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={restoreData}
                            onChangeText={setRestoreData}
                            placeholder='Paste backup JSON here...'
                            placeholderTextColor={colors.text.muted}
                            multiline
                            numberOfLines={4}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Passphrase</Text>
                        <TextInput
                            style={styles.input}
                            value={restorePassphrase}
                            onChangeText={setRestorePassphrase}
                            secureTextEntry
                            placeholder="Enter backup passphrase"
                            placeholderTextColor={colors.text.muted}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.formButtons}>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => { setMode('overview'); setRestoreData(''); setRestorePassphrase(''); }}
                        >
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.createBtn, { backgroundColor: colors.status.info }, isProcessing && styles.btnDisabled]}
                            onPress={handleRestore}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Icon name="download" size={18} color="#fff" />
                                    <Text style={styles.createBtnText}>Restore</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </GlassCard>
        </View>
    );

    // ─── Main Render ────────────────────────

    return (
        <ScrollView style={styles.container}>
            {/* Header */}
            <Glassmorphism style={styles.header} blur="lg">
                <TouchableOpacity onPress={() => mode === 'overview' ? navigation.goBack() : setMode('overview')} style={styles.backButton}>
                    <Icon name="arrow-back" size={24} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {mode === 'overview' ? 'Key Backup' : mode === 'create' ? 'Create Backup' : 'Restore Keys'}
                </Text>
            </Glassmorphism>

            {mode === 'overview' && renderOverview()}
            {mode === 'create' && renderCreateForm()}
            {mode === 'restore' && renderRestoreForm()}
        </ScrollView>
    );
};

// ─── Styles ────────────────────────────────────────

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
    statusCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
    },
    statusIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    statusInfo: {
        flex: 1,
    },
    statusTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 4,
    },
    statusDesc: {
        fontSize: 14,
        color: colors.text.secondary,
        lineHeight: 20,
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    actionCard: {
        width: '47%',
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    actionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 4,
    },
    actionDesc: {
        fontSize: 11,
        color: colors.text.muted,
    },
    dangerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
        gap: 12,
    },
    dangerText: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.status.error,
    },
    formCard: {
        padding: 20,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
    },
    formTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 8,
    },
    formDesc: {
        fontSize: 14,
        color: colors.text.secondary,
        lineHeight: 20,
        marginBottom: 20,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text.muted,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background.tertiary,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    input: {
        flex: 1,
        height: 48,
        color: colors.text.primary,
        fontSize: 15,
        backgroundColor: colors.background.tertiary,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
        paddingTop: 12,
    },
    inputError: {
        fontSize: 12,
        color: colors.status.error,
        marginTop: 4,
        marginLeft: 4,
    },
    formButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 8,
    },
    cancelBtn: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
    },
    cancelBtnText: {
        fontSize: 15,
        color: colors.text.secondary,
        fontWeight: '500',
    },
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.primary.main,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
    },
    createBtnText: {
        fontSize: 15,
        color: '#fff',
        fontWeight: '600',
    },
    btnDisabled: {
        opacity: 0.6,
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

export default KeyBackupScreen;
