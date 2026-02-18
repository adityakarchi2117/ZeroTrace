/**
 * Animated Message Bubble Component
 * Port of web's AnimatedMessage.tsx
 *
 * Features:
 * - 3D bubble pop animation on send
 * - Float-in from depth on receive
 * - Glow pulse effect for new sent messages
 * - Staggered list entrance
 */

import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';
import { springConfigs, durations, easings } from './config';

interface AnimatedMessageProps {
  children: React.ReactNode;
  isSent: boolean;
  isNew?: boolean;
  index?: number;
  style?: StyleProp<ViewStyle>;
}

export const AnimatedMessage: React.FC<AnimatedMessageProps> = ({
  children,
  isSent,
  isNew = false,
  index = 0,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(isSent ? 20 : 20)).current;
  const translateX = useRef(new Animated.Value(isSent ? 30 : -30)).current;
  const scale = useRef(new Animated.Value(isSent ? 0.8 : 0.9)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index * 50, 300);

    // Main entrance animation
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        ...springConfigs.gentle,
        delay,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        ...springConfigs.gentle,
        delay,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        ...springConfigs.gentle,
        delay,
      }),
      Animated.spring(scale, {
        toValue: 1,
        ...(isSent ? springConfigs.bouncy : springConfigs.gentle),
        delay,
      }),
    ]).start();

    // Glow pulse for new sent messages
    if (isSent && isNew) {
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.4,
          duration: 400,
          delay: delay + 200,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, []);

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: [
            { translateY },
            { translateX },
            { scale },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

export default AnimatedMessage;
