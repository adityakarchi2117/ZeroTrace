/**
 * Call History Screen
 * Displays call logs with call type, duration, and action buttons
 * Mirrors web client call history with premium mobile UX
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { colors } from '../../theme/colors';
import { Glassmorphism } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { useChatStore } from '../../store/chatStore';
import { storage } from '../../services/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────

interface CallLog {
    id: string;
    username: string;
    userId: number;
    callType: 'audio' | 'video';
    direction: 'incoming' | 'outgoing' | 'missed';
    duration: number; // seconds
    timestamp: string;
    status: 'completed' | 'missed' | 'declined' | 'failed';
}

type FilterType = 'all' | 'missed';

// ─── Helper Functions ──────────────────────────────

const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}:${secs.toString().padStart(2, '0')}`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatCallTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    const days = hours / 24;

    if (hours < 1) {
        const mins = Math.floor(diff / (1000 * 60));
        return mins <= 0 ? 'Just now' : `${mins}m ago`;
    }
    if (hours < 24) {
        return `${Math.floor(hours)}h ago`;
    }
    if (days < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getCallIcon = (log: CallLog): { name: string; color: string } => {
    if (log.direction === 'missed' || log.status === 'missed') {
        return { name: 'call', color: colors.status.error };
    }
    if (log.direction === 'incoming') {
        return {
            name: log.callType === 'video' ? 'videocam' : 'call',
            color: colors.status.success,
        };
    }
    return {
        name: log.callType === 'video' ? 'videocam-outline' : 'call-outline',
        color: colors.primary.main,
    };
};

const getDirectionIcon = (log: CallLog): string => {
    if (log.direction === 'missed') return 'arrow-down-outline';
    if (log.direction === 'incoming') return 'arrow-down-outline';
    return 'arrow-up-outline';
};

// ─── Component ─────────────────────────────────────

const CallHistoryScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const callHistory = useChatStore((s) => s.callHistory);
    const [localHistory, setLocalHistory] = useState<CallLog[]>([]);
    const [filter, setFilter] = useState<FilterType>('all');
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadHistory();
    }, [callHistory]);

    const loadHistory = useCallback(async () => {
        // Merge store call history with locally cached history
        const cached = await storage.getCallHistory();
        const all = [...(callHistory || []), ...cached];

        // Deduplicate by id
        const unique = all.reduce((acc: CallLog[], log: any) => {
            const id = log.id || log.call_id || `${log.username}_${log.timestamp}`;
            if (!acc.find((l) => l.id === id)) {
                acc.push({
                    id,
                    username: log.username || log.caller_username || log.remote_username || 'Unknown',
                    userId: log.userId || log.user_id || 0,
                    callType: log.callType || log.call_type || 'audio',
                    direction: log.direction || 'outgoing',
                    duration: log.duration || 0,
                    timestamp: log.timestamp || log.created_at || new Date().toISOString(),
                    status: log.status || 'completed',
                });
            }
            return acc;
        }, []);

        // Sort newest first
        unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLocalHistory(unique);
    }, [callHistory]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadHistory();
        setRefreshing(false);
    }, [loadHistory]);

    const filteredHistory = filter === 'missed'
        ? localHistory.filter((l) => l.direction === 'missed' || l.status === 'missed')
        : localHistory;

    const handleCall = (log: CallLog, type: 'audio' | 'video') => {
        navigation.navigate('Call', {
            username: log.username,
            userId: log.userId,
            callType: type,
            isIncoming: false,
        });
    };

    const renderCallItem = ({ item }: { item: CallLog }) => {
        const callIcon = getCallIcon(item);
        const isMissed = item.direction === 'missed' || item.status === 'missed';

        return (
            <TouchableOpacity
                style={styles.callItem}
                onPress={() => handleCall(item, item.callType)}
                activeOpacity={0.7}
            >
                {/* Avatar */}
                <TiltAvatar maxTilt={8} scale={1.03}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {item.username.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                </TiltAvatar>

                {/* Call info */}
                <View style={styles.callInfo}>
                    <Text style={[styles.username, isMissed && styles.missedText]}>
                        {item.username}
                    </Text>
                    <View style={styles.callMeta}>
                        <Icon
                            name={getDirectionIcon(item)}
                            size={14}
                            color={isMissed ? colors.status.error : colors.text.muted}
                        />
                        <Icon
                            name={callIcon.name}
                            size={14}
                            color={callIcon.color}
                            style={{ marginLeft: 4 }}
                        />
                        <Text style={styles.callMetaText}>
                            {isMissed
                                ? 'Missed'
                                : item.duration > 0
                                    ? formatDuration(item.duration)
                                    : item.status === 'declined'
                                        ? 'Declined'
                                        : 'No answer'}
                        </Text>
                    </View>
                </View>

                {/* Time & action */}
                <View style={styles.callRight}>
                    <Text style={styles.callTime}>{formatCallTime(item.timestamp)}</Text>
                    <View style={styles.callActions}>
                        <TouchableOpacity
                            style={styles.callActionBtn}
                            onPress={() => handleCall(item, 'audio')}
                        >
                            <Icon name="call-outline" size={20} color={colors.primary.main} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.callActionBtn}
                            onPress={() => handleCall(item, 'video')}
                        >
                            <Icon name="videocam-outline" size={20} color={colors.primary.main} />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <Glassmorphism style={styles.header} blur="lg">
                <Text style={styles.headerTitle}>Calls</Text>
            </Glassmorphism>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
                <TouchableOpacity
                    style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                    onPress={() => setFilter('all')}
                >
                    <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
                        All
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterTab, filter === 'missed' && styles.filterTabActive]}
                    onPress={() => setFilter('missed')}
                >
                    <Text style={[styles.filterText, filter === 'missed' && styles.filterTextActive]}>
                        Missed
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Call list */}
            <FlatList
                data={filteredHistory}
                renderItem={renderCallItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <TiltAvatar maxTilt={15} scale={1.08}>
                            <View style={styles.emptyIcon}>
                                <Icon name="call-outline" size={48} color={colors.primary.main} />
                            </View>
                        </TiltAvatar>
                        <Text style={styles.emptyTitle}>
                            {filter === 'missed' ? 'No missed calls' : 'No call history'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            Your calls will appear here
                        </Text>
                    </View>
                }
            />
        </View>
    );
};

// ─── Styles ────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.text.primary,
    },
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    filterTab: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: colors.background.secondary,
    },
    filterTabActive: {
        backgroundColor: colors.primary.main,
    },
    filterText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.muted,
    },
    filterTextActive: {
        color: '#fff',
    },
    list: {
        padding: 16,
    },
    callItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: colors.background.secondary,
        borderRadius: 16,
        marginBottom: 8,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.secondary.main,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    callInfo: {
        flex: 1,
    },
    username: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 4,
    },
    missedText: {
        color: colors.status.error,
    },
    callMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    callMetaText: {
        fontSize: 13,
        color: colors.text.muted,
        marginLeft: 4,
    },
    callRight: {
        alignItems: 'flex-end',
    },
    callTime: {
        fontSize: 12,
        color: colors.text.muted,
        marginBottom: 6,
    },
    callActions: {
        flexDirection: 'row',
        gap: 8,
    },
    callActionBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: `${colors.primary.main}15`,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyIcon: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.background.secondary,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: colors.text.secondary,
    },
});

export default CallHistoryScreen;
