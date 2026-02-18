/**
 * DraggablePiP — Picture-in-Picture floating window for calls.
 * Mirrors web's DraggablePiP.tsx with drag, resize, swap, and expand controls.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DraggablePiPProps {
  children: React.ReactNode;
  initialWidth?: number;
  initialHeight?: number;
  onSwap?: () => void;
  onExpand?: () => void;
  isExpanded?: boolean;
  visible?: boolean;
}

const DraggablePiP: React.FC<DraggablePiPProps> = ({
  children,
  initialWidth = 160,
  initialHeight = 120,
  onSwap,
  onExpand,
  isExpanded = false,
  visible = true,
}) => {
  const pan = useRef(new Animated.ValueXY({
    x: SCREEN_WIDTH - initialWidth - 16,
    y: SCREEN_HEIGHT - initialHeight - 120,
  })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [showControls, setShowControls] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastTap = useRef(0);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
    onPanResponderGrant: () => {
      setIsDragging(true);
      setShowControls(true);
      pan.extractOffset();
      Animated.spring(scale, {
        toValue: 1.05,
        useNativeDriver: true,
      }).start();

      // Double-tap detection
      const now = Date.now();
      if (now - lastTap.current < 300) {
        onSwap?.();
      }
      lastTap.current = now;
    },
    onPanResponderMove: Animated.event(
      [null, { dx: pan.x, dy: pan.y }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: (_, gs) => {
      pan.flattenOffset();
      setIsDragging(false);
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();

      // Snap to edges
      const x = (gs.moveX || SCREEN_WIDTH / 2);
      const snapX = x < SCREEN_WIDTH / 2 ? 16 : SCREEN_WIDTH - initialWidth - 16;
      const currentY = gs.moveY - initialHeight / 2;
      const clampedY = Math.max(60, Math.min(currentY, SCREEN_HEIGHT - initialHeight - 60));

      Animated.spring(pan, {
        toValue: { x: snapX, y: clampedY },
        useNativeDriver: false,
        tension: 40,
        friction: 8,
      }).start();

      // Auto-hide controls
      setTimeout(() => setShowControls(false), 3000);
    },
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: initialWidth,
          height: initialHeight,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Video content */}
      <View style={styles.videoContainer}>
        {children}
      </View>

      {/* Controls overlay */}
      {showControls && (
        <View style={styles.controlsOverlay}>
          {/* Drag handle */}
          <View style={styles.dragHandle} />

          {/* Buttons */}
          <View style={styles.controlsRow}>
            {onSwap && (
              <TouchableOpacity style={styles.controlButton} onPress={onSwap}>
                <Icon name="swap-horizontal" size={16} color="#FFF" />
              </TouchableOpacity>
            )}
            {onExpand && (
              <TouchableOpacity style={styles.controlButton} onPress={onExpand}>
                <Icon name={isExpanded ? 'contract' : 'expand'} size={16} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 9999,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  videoContainer: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DraggablePiP;
