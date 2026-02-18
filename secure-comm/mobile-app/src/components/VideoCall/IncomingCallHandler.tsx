/**
 * IncomingCallHandler
 * Listens for WebSocket call events and shows incoming call UI
 * Should be rendered in the app root to catch calls on any screen
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Vibration,
    Dimensions,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { wsManager } from '../../services/websocket';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface IncomingCall {
    callId: string;
    callerUsername: string;
    callType: 'audio' | 'video';
}

const IncomingCallHandler: React.FC = () => {
    const navigation = useNavigation<any>();
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const vibrationRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleCallOffer = (data: any) => {
            const call: IncomingCall = {
                callId: data.call_id || `incoming_${Date.now()}`,
                callerUsername: data.caller_username || data.sender_username || 'Unknown',
                callType: data.call_type || 'audio',
            };

            setIncomingCall(call);

            // Vibrate continuously
            vibrationRef.current = setInterval(() => {
                Vibration.vibrate(1000);
            }, 2000);
        };

        const handleCallEnd = () => {
            dismissCall();
        };

        const handleCallRejected = () => {
            dismissCall();
        };

        wsManager.on('call_offer', handleCallOffer);
        wsManager.on('call_ended', handleCallEnd);
        wsManager.on('call_rejected', handleCallRejected);

        return () => {
            wsManager.off('call_offer', handleCallOffer);
            wsManager.off('call_ended', handleCallEnd);
            wsManager.off('call_rejected', handleCallRejected);
            if (vibrationRef.current) {
                clearInterval(vibrationRef.current);
            }
        };
    }, []);

    const dismissCall = useCallback(() => {
        setIncomingCall(null);
        Vibration.cancel();
        if (vibrationRef.current) {
            clearInterval(vibrationRef.current);
            vibrationRef.current = null;
        }
    }, []);

    const handleAnswer = useCallback(() => {
        if (!incomingCall) return;

        dismissCall();
        navigation.navigate('Call', {
            username: incomingCall.callerUsername,
            userId: 0, // Will be resolved from contacts
            callType: incomingCall.callType,
            isIncoming: true,
            callId: incomingCall.callId,
        });
    }, [incomingCall, dismissCall, navigation]);

    const handleReject = useCallback(() => {
        if (!incomingCall) return;
        wsManager.sendCallReject(incomingCall.callerUsername, incomingCall.callId);
        dismissCall();
    }, [incomingCall, dismissCall]);

    if (!incomingCall) return null;

    return (
        <Modal
            visible={!!incomingCall}
            transparent
            animationType="slide"
            onRequestClose={handleReject}
        >
            <View style={styles.container}>
                <View style={styles.card}>
                    {/* Call type indicator */}
                    <View style={styles.callTypeIndicator}>
                        <Icon
                            name={incomingCall.callType === 'video' ? 'videocam' : 'call'}
                            size={20}
                            color={colors.primary.main}
                        />
                        <Text style={styles.callTypeText}>
                            Incoming {incomingCall.callType} call
                        </Text>
                    </View>

                    {/* Caller avatar */}
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {incomingCall.callerUsername.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View style={styles.pulseRing} />
                    </View>

                    {/* Caller info */}
                    <Text style={styles.callerName}>
                        {incomingCall.callerUsername}
                    </Text>
                    <Text style={styles.encryptedLabel}>
                        🔒 End-to-end encrypted
                    </Text>

                    {/* Action buttons */}
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={handleReject}
                        >
                            <Icon name="close" size={28} color="#fff" />
                            <Text style={styles.actionLabel}>Decline</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, styles.answerButton]}
                            onPress={handleAnswer}
                        >
                            <Icon
                                name={incomingCall.callType === 'video' ? 'videocam' : 'call'}
                                size={28}
                                color="#fff"
                            />
                            <Text style={styles.actionLabel}>Answer</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    card: {
        width: SCREEN_WIDTH * 0.85,
        backgroundColor: colors.background.secondary,
        borderRadius: 28,
        padding: 32,
        alignItems: 'center',
    },
    callTypeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: `${colors.primary.main}20`,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 28,
    },
    callTypeText: {
        color: colors.primary.main,
        fontSize: 14,
        fontWeight: '600',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 20,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.primary.main,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    avatarText: {
        fontSize: 42,
        fontWeight: '700',
        color: '#fff',
    },
    pulseRing: {
        position: 'absolute',
        top: -10,
        left: -10,
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: `${colors.primary.main}40`,
    },
    callerName: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text.primary,
        marginBottom: 6,
    },
    encryptedLabel: {
        fontSize: 13,
        color: colors.text.muted,
        marginBottom: 32,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 40,
    },
    actionButton: {
        alignItems: 'center',
        gap: 8,
    },
    rejectButton: {
        alignItems: 'center',
    },
    answerButton: {
        alignItems: 'center',
    },
    actionLabel: {
        color: colors.text.secondary,
        fontSize: 13,
        fontWeight: '500',
    },
});

export default IncomingCallHandler;
