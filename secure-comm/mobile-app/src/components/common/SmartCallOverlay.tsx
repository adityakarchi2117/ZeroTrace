/**
 * SmartCallOverlay — Minimized call card overlay.
 * Mirrors web's SmartCallOverlay.tsx with call duration, quick controls,
 * auto-minimize on backgrounding, and restore functionality.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  AppState,
  AppStateStatus,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SmartCallOverlayProps {
  isInCall: boolean;
  callDuration: number;
  remoteUsername: string;
  isMuted: boolean;
  isVideoOff: boolean;
  isVideoCall: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  onRestore: () => void;
}

const SmartCallOverlay: React.FC<SmartCallOverlayProps> = ({
  isInCall,
  callDuration,
  remoteUsername,
  isMuted,
  isVideoOff,
  isVideoCall,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  onRestore,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Auto-show when in call and user navigates away
  useEffect(() => {
    if (!isInCall) {
      setIsVisible(false);
      return;
    }

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isInCall) {
        setIsVisible(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    
    // Show overlay by default when in call
    setIsVisible(true);

    return () => sub.remove();
  }, [isInCall]);

  // Slide animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isVisible ? 0 : 100,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [isVisible]);

  // Pulsing indicator
  useEffect(() => {
    if (isInCall) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isInCall]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isInCall || !isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* Green border glow */}
      <View style={styles.glowBorder}>
        <View style={styles.card}>
          {/* Avatar & Info */}
          <View style={styles.infoSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {remoteUsername.charAt(0).toUpperCase()}
              </Text>
              {/* Green ring */}
              <View style={styles.avatarRing} />
            </View>
            <View style={styles.callInfo}>
              <Text style={styles.username} numberOfLines={1}>{remoteUsername}</Text>
              <View style={styles.durationRow}>
                <Animated.View
                  style={[
                    styles.pulseDot,
                    {
                      opacity: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1],
                      }),
                    },
                  ]}
                />
                <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
              </View>
            </View>
          </View>

          {/* Quick Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              onPress={onToggleMute}
            >
              <Icon
                name={isMuted ? 'mic-off' : 'mic'}
                size={18}
                color={isMuted ? '#EF4444' : '#FFF'}
              />
            </TouchableOpacity>

            {isVideoCall && (
              <TouchableOpacity
                style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
                onPress={onToggleVideo}
              >
                <Icon
                  name={isVideoOff ? 'videocam-off' : 'videocam'}
                  size={18}
                  color={isVideoOff ? '#EF4444' : '#FFF'}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.restoreBtn} onPress={onRestore}>
              <Icon name="expand" size={18} color="#3B82F6" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.endCallBtn} onPress={onEndCall}>
              <Icon name="call" size={18} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Pulsing indicator dot */}
      <Animated.View
        style={[
          styles.indicatorDot,
          {
            opacity: pulseAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 1],
            }),
            transform: [{
              scale: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.3],
              }),
            }],
          },
        ]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    left: 16,
    zIndex: 99999,
    elevation: 99999,
  },
  glowBorder: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 20,
    padding: 14,
  },
  infoSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  avatarRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  callInfo: {
    flex: 1,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  duration: {
    fontSize: 13,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  restoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorDot: {
    position: 'absolute',
    top: -4,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
});

export default SmartCallOverlay;
