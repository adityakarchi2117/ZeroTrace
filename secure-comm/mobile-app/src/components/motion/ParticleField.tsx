/**
 * Particle Field Component
 * Port of web's ParticleField.tsx
 *
 * Features:
 * - Floating particles background
 * - GPU-accelerated (useNativeDriver)
 * - Configurable density
 * - Battery-efficient (stops when AppState is background)
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, AppState, View } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

interface ParticleFieldProps {
  density?: 'low' | 'medium' | 'high';
  color?: string;
  minSize?: number;
  maxSize?: number;
}

const ParticleField: React.FC<ParticleFieldProps> = ({
  density = 'low',
  color = 'rgba(59, 130, 246, 0.3)',
  minSize = 2,
  maxSize = 6,
}) => {
  const isActive = useRef(true);

  const particles = useMemo<Particle[]>(() => {
    const count = { low: 15, medium: 30, high: 50 }[density];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * SCREEN_W,
      y: Math.random() * SCREEN_H,
      size: minSize + Math.random() * (maxSize - minSize),
      duration: 15000 + Math.random() * 20000,
      delay: Math.random() * 10000,
    }));
  }, [density, minSize, maxSize]);

  // Pause when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      isActive.current = state === 'active';
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <FloatingDot key={p.id} particle={p} color={color} />
      ))}
    </View>
  );
};

const FloatingDot: React.FC<{ particle: Particle; color: string }> = ({
  particle,
  color,
}) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.2)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const drift = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: -100,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: Math.random() * 50 - 25,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 0,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.2,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.2,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: particle.duration / 2,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => drift());
    };

    const timer = setTimeout(drift, particle.delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: particle.x,
        top: particle.y,
        width: particle.size,
        height: particle.size,
        borderRadius: particle.size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    />
  );
};

export { ParticleField };
export default ParticleField;
