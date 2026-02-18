/**
 * OfflineBanner
 * Shows a persistent banner when the device is offline
 * Automatically hides when connection is restored
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';

interface Props {
    isConnected: boolean;
    isWsConnected?: boolean;
}

const OfflineBanner: React.FC<Props> = ({ isConnected, isWsConnected }) => {
    const [visible, setVisible] = React.useState(false);
    const slideAnim = React.useRef(new Animated.Value(-50)).current;

    React.useEffect(() => {
        const shouldShow = !isConnected || (isConnected && isWsConnected === false);

        if (shouldShow && !visible) {
            setVisible(true);
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 80,
                friction: 10,
            }).start();
        } else if (!shouldShow && visible) {
            Animated.timing(slideAnim, {
                toValue: -50,
                duration: 300,
                useNativeDriver: true,
            }).start(() => setVisible(false));
        }
    }, [isConnected, isWsConnected, visible, slideAnim]);

    if (!visible) return null;

    const message = !isConnected
        ? 'No internet connection'
        : 'Reconnecting...';

    const backgroundColor = !isConnected
        ? colors.status.error
        : colors.status.warning;

    return (
        <Animated.View
            style={[
                styles.container,
                { backgroundColor, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <Icon
                name={!isConnected ? 'cloud-offline' : 'sync'}
                size={16}
                color="#fff"
            />
            <Text style={styles.text}>{message}</Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        gap: 8,
        zIndex: 1000,
    },
    text: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default OfflineBanner;
