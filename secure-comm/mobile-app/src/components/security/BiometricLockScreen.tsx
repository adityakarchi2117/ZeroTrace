/**
 * BiometricLockScreen
 * Full-screen lock overlay that requires biometric auth to proceed
 * Renders on top of navigation when biometric lock is enabled
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    AppState,
    AppStateStatus,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import { biometricService, BiometricCapability } from '../../services/biometric';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
    onAuthenticated: () => void;
}

const BiometricLockScreen: React.FC<Props> = ({ onAuthenticated }) => {
    const [capability, setCapability] = useState<BiometricCapability | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempts, setAttempts] = useState(0);

    useEffect(() => {
        checkAndPrompt();
    }, []);

    // Auto-prompt when app comes to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                checkAndPrompt();
            }
        });
        return () => subscription.remove();
    }, []);

    const checkAndPrompt = useCallback(async () => {
        const cap = await biometricService.checkCapability();
        setCapability(cap);

        if (cap.available) {
            promptAuth();
        }
    }, []);

    const promptAuth = useCallback(async () => {
        setError(null);
        const success = await biometricService.authenticate('Unlock ZeroTrace');
        if (success) {
            onAuthenticated();
        } else {
            setAttempts((a) => a + 1);
            setError('Authentication failed. Please try again.');
        }
    }, [onAuthenticated]);

    const getIcon = (): string => {
        if (!capability) return 'lock-closed';
        switch (capability.biometryType) {
            case 'face':
                return 'scan';
            case 'fingerprint':
                return 'finger-print';
            case 'iris':
                return 'eye';
            default:
                return 'lock-closed';
        }
    };

    return (
        <View style={styles.container}>
            {/* Background overlay */}
            <View style={styles.overlay} />

            {/* Content */}
            <View style={styles.content}>
                {/* App branding */}
                <View style={styles.brandContainer}>
                    <View style={styles.logoContainer}>
                        <Icon name="shield-checkmark" size={48} color={colors.primary.main} />
                    </View>
                    <Text style={styles.appName}>ZeroTrace</Text>
                    <Text style={styles.tagline}>End-to-end encrypted</Text>
                </View>

                {/* Lock icon */}
                <TouchableOpacity style={styles.lockButton} onPress={promptAuth} activeOpacity={0.7}>
                    <View style={styles.lockIconContainer}>
                        <Icon name={getIcon()} size={56} color={colors.primary.main} />
                    </View>
                    <Text style={styles.lockLabel}>
                        {capability?.label || 'Authenticate'} to unlock
                    </Text>
                </TouchableOpacity>

                {/* Error */}
                {error && (
                    <View style={styles.errorContainer}>
                        <Icon name="alert-circle" size={18} color={colors.status.error} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Retry button */}
                <TouchableOpacity style={styles.retryButton} onPress={promptAuth}>
                    <Text style={styles.retryText}>Tap to authenticate</Text>
                </TouchableOpacity>

                {/* Too many attempts */}
                {attempts >= 5 && (
                    <Text style={styles.warningText}>
                        Too many failed attempts. Please use your device PIN/pattern.
                    </Text>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.background.primary,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    brandContainer: {
        alignItems: 'center',
        marginBottom: 60,
    },
    logoContainer: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: `${colors.primary.main}20`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    appName: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.text.primary,
        letterSpacing: 1,
    },
    tagline: {
        fontSize: 14,
        color: colors.text.muted,
        marginTop: 4,
    },
    lockButton: {
        alignItems: 'center',
        marginBottom: 32,
    },
    lockIconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: `${colors.primary.main}15`,
        borderWidth: 2,
        borderColor: `${colors.primary.main}40`,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    lockLabel: {
        fontSize: 16,
        color: colors.text.secondary,
        fontWeight: '500',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: `${colors.status.error}20`,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 16,
    },
    errorText: {
        fontSize: 14,
        color: colors.status.error,
        fontWeight: '500',
    },
    retryButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    retryText: {
        fontSize: 15,
        color: colors.primary.main,
        fontWeight: '600',
    },
    warningText: {
        fontSize: 13,
        color: colors.status.warning,
        textAlign: 'center',
        marginTop: 16,
        maxWidth: SCREEN_WIDTH * 0.7,
    },
});

export default BiometricLockScreen;
