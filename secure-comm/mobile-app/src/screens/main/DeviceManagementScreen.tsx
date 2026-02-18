import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';
import { deviceLinkService, DeviceInfoType } from '../../services/deviceLinkService';
import { showMessage } from 'react-native-flash-message';


const DeviceManagementScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const [devices, setDevices] = useState<DeviceInfoType[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const currentDeviceId = deviceLinkService.getDeviceId();

    const loadDevices = async () => {
        try {
            const list = await deviceLinkService.listDevices();
            setDevices(list);
        } catch (error) {
            console.error('Failed to load devices:', error);
            showMessage({ message: 'Failed to load devices', type: 'danger' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadDevices();
        }, [])
    );

    const handleRefresh = () => {
        setRefreshing(true);
        loadDevices();
    };

    const handleRevoke = (device: DeviceInfoType) => {
        Alert.alert(
            'Revoke Device',
            `Are you sure you want to unlink "${device.device_name}"? This will log it out immediately.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            // If revoking NOT self, we should ideally rotate DEK too, but basic revoke is safer for now
                            await deviceLinkService.revokeDevice(device.device_id, 'user_initiated', false);
                            showMessage({ message: 'Device revoked successfully', type: 'success' });

                            if (device.device_id === currentDeviceId) {
                                // We revoked ourselves, restart app or logout
                                // navigate to Auth... handle in store
                            }

                            loadDevices();
                        } catch (error) {
                            showMessage({ message: 'Failed to revoke device', type: 'danger' });
                            setLoading(false);
                        }
                    },
                },
            ]
        );
    };

    const getDeviceIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'android': return 'logo-android';
            case 'ios': return 'logo-apple';
            case 'web': return 'logo-chrome'; // or globe
            case 'desktop': return 'desktop';
            default: return 'phone-portrait';
        }
    };

    const renderDeviceItem = (device: DeviceInfoType) => {
        const isCurrent = device.device_id === currentDeviceId;
        const isActive = device.is_active;

        return (
            <GlassCard key={device.id}>
                <View style={styles.deviceItem}>
                    <View style={[styles.iconContainer, isCurrent && { backgroundColor: `${colors.primary.main}20` }]}>
                        <Icon
                            name={getDeviceIcon(device.device_type)}
                            size={24}
                            color={isCurrent ? colors.primary.main : colors.text.secondary}
                        />
                    </View>

                    <View style={styles.deviceInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.deviceName}>{device.device_name}</Text>
                            {isCurrent && (
                                <View style={styles.currentBadge}>
                                    <Text style={styles.currentBadgeText}>THIS DEVICE</Text>
                                </View>
                            )}
                        </View>

                        <Text style={styles.deviceDetail}>
                            {isActive ? 'Active now' : `Last active ${device.last_verified_at ? new Date(device.last_verified_at).toLocaleDateString() : 'Unknown'}`}
                        </Text>
                        <Text style={styles.deviceLocation}>
                            {device.last_ip || 'Unknown Location'}
                        </Text>
                    </View>

                    {!isCurrent && (
                        <TouchableOpacity
                            onPress={() => handleRevoke(device)}
                            style={styles.revokeButton}
                        >
                            <Icon name="trash-outline" size={20} color={colors.status.error} />
                        </TouchableOpacity>
                    )}
                </View>
            </GlassCard>
        );
    };

    return (
        <View style={styles.container}>
            <Glassmorphism style={styles.header} blur="lg">
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Icon name="arrow-back" size={24} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Linked Devices</Text>
                </View>
            </Glassmorphism>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary.main} />}
            >
                <View style={styles.heroSection}>
                    <View style={styles.heroIcon}>
                        <Icon name="laptop-outline" size={48} color={colors.primary.main} />
                    </View>
                    <Text style={styles.heroTitle}>Use ZeroTrace on other devices</Text>
                    <TouchableOpacity
                        style={styles.linkButton}
                        onPress={() => navigation.navigate('QRScanner')}
                    >
                        <Text style={styles.linkButtonText}>Link a Device</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.sectionHeader}>Active Sessions</Text>

                {loading && !refreshing ? (
                    <ActivityIndicator size="large" color={colors.primary.main} style={{ marginTop: 20 }} />
                ) : (
                    <View style={styles.listContainer}>
                        {devices.map(renderDeviceItem)}
                    </View>
                )}
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
    heroSection: {
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 10,
    },
    heroIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: `${colors.primary.main}15`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    heroTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 24,
    },
    linkButton: {
        backgroundColor: colors.primary.main,
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 24,
        shadowColor: colors.primary.main,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    linkButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.secondary,
        textTransform: 'uppercase',
        marginBottom: 12,
        marginTop: 10,
    },
    listContainer: {
        gap: 12,
    },
    deviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background.tertiary,
        marginRight: 16,
    },
    deviceInfo: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 8,
    },
    deviceName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text.primary,
    },
    currentBadge: {
        backgroundColor: `${colors.status.success}20`,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    currentBadgeText: {
        fontSize: 10,
        color: colors.status.success,
        fontWeight: '700',
    },
    deviceDetail: {
        fontSize: 13,
        color: colors.text.secondary,
        marginBottom: 2,
    },
    deviceLocation: {
        fontSize: 12,
        color: colors.text.muted,
    },
    revokeButton: {
        padding: 8,
    },
});

export default DeviceManagementScreen;
