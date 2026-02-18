/**
 * Encryption Lock Animation Component
 * Port of web's EncryptionLock.tsx
 *
 * Features:
 * - Rotating lock icon
 * - Pulsing glow effect
 * - Orbiting particle dots
 * - Shows E2E encryption visually
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme/colors';

interface EncryptionLockProps {
  isEncrypting?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showParticles?: boolean;
  color?: string;
}

const sizeMap = { sm: 16, md: 24, lg: 32 };

export const EncryptionLock: React.FC<EncryptionLockProps> = ({
  isEncrypting = true,
  size = 'md',
  showParticles = true,
  color = colors.primary.main,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0)),
  ).current;

  const iconSize = sizeMap[size];

  useEffect(() => {
    if (!isEncrypting) return;

    // Continuous rotation
    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Pulsing glow
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    rotate.start();
    glow.start();

    // Orbiting particles
    if (showParticles) {
      particleAnims.forEach((anim, i) => {
        Animated.loop(
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            delay: i * 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ).start();
      });
    }

    return () => {
      rotate.stop();
      glow.stop();
      particleAnims.forEach((a) => a.stopAnimation());
    };
  }, [isEncrypting]);

  const rotateInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  if (!isEncrypting) {
    return (
      <View style={{ width: iconSize, height: iconSize, justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="lock-closed" size={iconSize * 0.7} color={color} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: iconSize * 2, height: iconSize * 2 }]}>
      {/* Glow pulse behind lock */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: iconSize * 1.8,
            height: iconSize * 1.8,
            borderRadius: iconSize,
            backgroundColor: color,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* Orbiting particles */}
      {showParticles &&
        particleAnims.map((anim, i) => {
          const angle = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [`${(i * 60)}deg`, `${(i * 60) + 360}deg`],
          });
          const particleOpacity = anim.interpolate({
            inputRange: [0, 0.3, 0.7, 1],
            outputRange: [0, 1, 1, 0],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  opacity: particleOpacity,
                  backgroundColor: color,
                  transform: [
                    { rotate: angle },
                    { translateX: iconSize * 0.9 },
                  ],
                },
              ]}
            />
          );
        })}

      {/* Rotating lock */}
      <Animated.View
        style={{
          transform: [{ rotateY: rotateInterpolation }],
        }}
      >
        <Icon name="lock-closed" size={iconSize} color={color} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default EncryptionLock;
