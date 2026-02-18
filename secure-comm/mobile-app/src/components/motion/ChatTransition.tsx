/**
 * Chat Transition Component
 * Port of web's ChatTransition.tsx
 *
 * Features:
 * - Slide + fade when entering a chat
 * - Scale-down when exiting
 * - "Entering a private space" effect
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { easings, durations } from './config';

interface ChatTransitionProps {
  children: React.ReactNode;
  isActive: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ChatTransition: React.FC<ChatTransitionProps> = ({
  children,
  isActive,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(50)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: durations.rotate3d,
          easing: easings.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: durations.rotate3d,
          easing: easings.smooth,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: durations.rotate3d,
          easing: easings.smooth,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -30,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive]);

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          opacity,
          transform: [{ translateX }, { scale }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

export default ChatTransition;
