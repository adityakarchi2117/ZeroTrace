/**
 * Electric Border Component
 * Port of web's ElectricBorder.tsx
 *
 * Features:
 * - Animated gradient border that pulses/rotates
 * - Neon glow effect using LinearGradient
 * - Configurable color, speed, thickness
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface ElectricBorderProps {
  children?: React.ReactNode;
  color?: string;
  speed?: number;
  borderRadius?: number;
  thickness?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

const ElectricBorder: React.FC<ElectricBorderProps> = ({
  children,
  color = '#5227FF',
  speed = 1,
  borderRadius = 24,
  thickness = 2,
  style,
  disabled = false,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) return;

    // Rotating gradient
    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000 / speed,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Pulsing glow
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500 / speed,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500 / speed,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );

    rotate.start();
    glow.start();

    return () => {
      rotate.stop();
      glow.stop();
    };
  }, [disabled, speed]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  const shadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 12],
  });

  if (disabled) {
    return <View style={[{ borderRadius }, style]}>{children}</View>;
  }

  return (
    <View style={[styles.wrapper, { borderRadius }, style]}>
      {/* Animated gradient border layer */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            transform: [{ rotate: rotation }],
            overflow: 'hidden',
          },
        ]}
      >
        <LinearGradient
          colors={[color, 'transparent', color, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Glow shadow */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            shadowColor: color,
            shadowOpacity,
            shadowRadius,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          },
        ]}
      />

      {/* Inner content with padding for border */}
      <View
        style={[
          styles.inner,
          {
            borderRadius: borderRadius - thickness,
            margin: thickness,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  inner: {
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
});

export { ElectricBorder };
export default ElectricBorder;
