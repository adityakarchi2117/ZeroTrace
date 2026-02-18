/**
 * Spotlight Card Component
 * Port of web's SpotlightCard.tsx
 *
 * Features:
 * - Touch-responsive gradient spotlight
 * - Radial glow follows finger position
 * - Configurable spotlight color
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  Animated,
  View,
  StyleSheet,
  GestureResponderEvent,
  LayoutChangeEvent,
  ViewStyle,
  StyleProp,
} from 'react-native';

interface SpotlightCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  spotlightColor?: string;
  spotlightRadius?: number;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  style,
  spotlightColor = 'rgba(82, 39, 255, 0.25)',
  spotlightRadius = 120,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  }, []);

  const handleTouchStart = (e: GestureResponderEvent) => {
    setTouchPos({
      x: e.nativeEvent.locationX,
      y: e.nativeEvent.locationY,
    });
    Animated.timing(opacity, {
      toValue: 0.6,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    setTouchPos({
      x: e.nativeEvent.locationX,
      y: e.nativeEvent.locationY,
    });
  };

  const handleTouchEnd = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 500,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View
      style={[styles.container, style]}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderStart={handleTouchStart}
      onResponderMove={handleTouchMove}
      onResponderEnd={handleTouchEnd}
      onResponderRelease={handleTouchEnd}
    >
      {/* Spotlight overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity,
            borderRadius: 16,
            overflow: 'hidden',
          },
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: spotlightColor,
              borderRadius: spotlightRadius,
              width: spotlightRadius * 2,
              height: spotlightRadius * 2,
              left: touchPos.x - spotlightRadius,
              top: touchPos.y - spotlightRadius,
            },
          ]}
        />
      </Animated.View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 16,
  },
});

export { SpotlightCard };
export default SpotlightCard;
