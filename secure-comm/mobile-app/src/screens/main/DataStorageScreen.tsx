import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    TextInput,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { secureProfileService, BackupResponse } from '../../services/secureProfileApi';
import { encryptedVault } from '../../services/encryptedVault';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { showMessage } from 'react-native-flash-message';


const DataStorageScreen: React.FC = () => {
    const navigation = useNavigation();
    const { user } = useAuthStore();
    const { logout } = useChatStore(); // If restore succeeds, maybe logout? or just reload keys

    const [backups, setBackups] = useState<BackupResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalType, setModalType] = useState<'create' | 'restore'>('create');
    const [password, setPassword] = useState('');
    const [selectedBackupId, setSelectedBackupId] = useState<number | null>(null);

    useEffect(() => {
        loadBackups();
    }, []);

    const loadBackups = async () => {
        try {
            setLoading(true);
            const list = await secureProfileService.listBackups();
            setBackups(list);
        } catch (error) {
            console.error('Failed to load backups:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBackup = () => {
        setModalType('create');
        setPassword('');
        setModalVisible(true);
    };

    const handleRestoreBackup = (backupId: number) => {
        setSelectedBackupId(backupId);
        setModalType('restore');
        setPassword('');
        setModalVisible(true);
    };

    const executeAction = async () => {
        if (!password) {
            showMessage({ message: 'Password required', type: 'warning' });
            return;
        }

        setModalVisible(false);
        setProcessing(true);

        try {
            if (modalType === 'create') {
                const success = await secureProfileService.createBackup(
                    user?.username || '',
                    password,
                    { /* minimal profile data if any */ },
                    { /* metadata */ }
                );
                if (success) {
                    showMessage({ message: 'Backup created successfully', type: 'success' });
                    loadBackups();
                } else {
                    showMessage({ message: 'Backup creation failed', type: 'danger' });
                }
            } else {
                // RESTORE
                if (!selectedBackupId) return;

                // 1. Fetch backup payload from server
                // We need raw access to restoreBackup from api to get the payload
                // secureProfileService.restoreBackup doesn't exist in the high-level service in the same way?
                // Let's check secureProfileApi directly.

                throw new Error('Restore not fully implemented in UI yet');
                // Logic would be:
                // const payload = await secureProfileApi.restoreBackup(selectedBackupId);
                // const success = await encryptedVault.restoreFromBackup(user.username, payload, pubKey, privKey);
            }
        } catch (error: any) {
            showMessage({ message: error.message || 'Operation failed', type: 'danger' });
        } finally {
            setProcessing(false);
        }
    };

    const renderBackupItem = (backup: BackupResponse) => (
        <GlassCard key={backup.id}>
            <TouchableOpacity
                style={styles.backupItem}
                onPress={() => handleRestoreBackup(backup.id)}
            >
                <View style={styles.iconContainer}>
                    <Icon name="cloud-done" size={24} color={colors.primary.main} />
                </View>
                <View style={styles.backupInfo}>
                    <Text style={styles.backupDate}>
                        {new Date(backup.created_at).toLocaleString()}
                    </Text>
                    <Text style={styles.backupDetails}>
                        Type: {backup.backup_type} • ID: {backup.id}
                    </Text>
                </View>
                <Icon name="download-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
        </GlassCard>
    );

    return (
        <View style={styles.container}>
            <Glassmorphism style={styles.header} blur="lg">
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Icon name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Storage & Data</Text>
                </View>
            </Glassmorphism>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                    <GlassCard>
                        <TouchableOpacity style={styles.actionButton} onPress={handleCreateBackup}>
                            <View style={[styles.actionIcon, { backgroundColor: `${colors.status.success}20` }]}>
                                <Icon name="add-circle" size={28} color={colors.status.success} />
                            </View>
                            <View>
                                <Text style={styles.actionTitle}>Create New Backup</Text>
                                <Text style={styles.actionDesc}>Encrypt chats & keys to server</Text>
                            </View>
                        </TouchableOpacity>
                    </GlassCard>

                    <GlassCard>
                        <TouchableOpacity style={styles.actionButton}>
                            <View style={[styles.actionIcon, { backgroundColor: `${colors.status.error}20` }]}>
                                <Icon name="trash" size={28} color={colors.status.error} />
                            </View>
                            <View>
                                <Text style={styles.actionTitle}>Clear Local Cache</Text>
                                <Text style={styles.actionDesc}>Free up space on this device</Text>
                            </View>
                        </TouchableOpacity>
                    </GlassCard>
                </View>

                <Text style={styles.sectionHeader}>Cloud Backups</Text>

                {loading ? (
                    <ActivityIndicator size="small" color={colors.primary.main} />
                ) : backups.length === 0 ? (
                    <Text style={styles.emptyText}>No backups found.</Text>
                ) : (
                    <View style={styles.listContainer}>
                        {backups.map(renderBackupItem)}
                    </View>
                )}

            </ScrollView>

            {/* Password Modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Glassmorphism style={styles.modalContent} blur="xl">
                        <Text style={styles.modalTitle}>
                            {modalType === 'create' ? 'Protect Backup' : 'Decrypt Backup'}
                        </Text>
                        <Text style={styles.modalSub}>
                            {modalType === 'create'
                                ? 'Enter a password to encrypt this backup. You will need it to restore.'
                                : 'Enter the password used to create this backup.'}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor={colors.text.muted}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            autoFocus
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.modalButtonCancel}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.modalButtonConfirm}
                                onPress={executeAction}
                            >
                                <Text style={styles.modalButtonTextConfirm}>
                                    {modalType === 'create' ? 'Create' : 'Restore'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Glassmorphism>
                </View>
            </Modal>

            {processing && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary.main} />
                    <Text style={styles.loadingText}>Processing...</Text>
                </View>
            )}
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
    backButton: { marginRight: 16 },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text.primary,
    },
    content: { padding: 20 },
    actionsContainer: { gap: 16, marginBottom: 32 },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    actionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text.primary,
    },
    actionDesc: {
        fontSize: 13,
        color: colors.text.secondary,
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.secondary,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    listContainer: { gap: 12 },
    emptyText: {
        textAlign: 'center',
        color: colors.text.muted,
        marginTop: 20,
    },
    backupItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
    },
    iconContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: `${colors.primary.main}15`,
        borderRadius: 10,
        marginRight: 12,
    },
    backupInfo: { flex: 1 },
    backupDate: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.text.primary,
    },
    backupDetails: {
        fontSize: 12,
        color: colors.text.muted,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: colors.background.secondary,
        borderRadius: 24,
        padding: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text.primary,
        marginBottom: 8,
        textAlign: 'center',
    },
    modalSub: {
        fontSize: 14,
        color: colors.text.secondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    input: {
        backgroundColor: colors.background.tertiary,
        borderRadius: 12,
        padding: 16,
        color: colors.text.primary,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border.primary,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButtonCancel: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.background.tertiary,
        alignItems: 'center',
    },
    modalButtonConfirm: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.primary.main,
        alignItems: 'center',
    },
    modalButtonTextCancel: {
        color: colors.text.primary,
        fontWeight: '600',
    },
    modalButtonTextConfirm: {
        color: '#FFF',
        fontWeight: '600',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: '#FFF',
        fontSize: 16,
    },
});

export default DataStorageScreen;
