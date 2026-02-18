/**
 * Circular Text Component
 * Port of web's CircularText.tsx
 *
 * Features:
 * - Text arranged in a circle
 * - Continuous rotation animation
 * - Configurable spin duration
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text, StyleSheet } from 'react-native';

interface CircularTextProps {
  text: string;
  spinDuration?: number;
  radius?: number;
  fontSize?: number;
  color?: string;
}

const CircularText: React.FC<CircularTextProps> = ({
  text,
  spinDuration = 20,
  radius = 60,
  fontSize = 12,
  color = '#FFFFFF',
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const letters = Array.from(text);

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: spinDuration * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, [spinDuration]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const containerSize = radius * 2 + fontSize * 2;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: containerSize,
          height: containerSize,
          transform: [{ rotate: rotation }],
        },
      ]}
    >
      {letters.map((letter, i) => {
        const angleInDeg = (360 / letters.length) * i;
        const angleInRad = (angleInDeg * Math.PI) / 180;
        const x = radius * Math.sin(angleInRad);
        const y = -radius * Math.cos(angleInRad);

        return (
          <View
            key={i}
            style={[
              styles.letterContainer,
              {
                transform: [
                  { translateX: x },
                  { translateY: y },
                  { rotate: `${angleInDeg}deg` },
                ],
              },
            ]}
          >
            <Text style={[styles.letter, { fontSize, color }]}>
              {letter}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    fontWeight: '900',
  },
});

export { CircularText };
export default CircularText;
