import React from 'react';
import { Animated, StyleProp, View, ViewStyle } from 'react-native';

import { colors } from '../../theme/colors';

type BlurLevel = 'sm' | 'md' | 'lg' | 'xl';

interface GlassProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  blur?: BlurLevel;
  interactive?: boolean;
}

const blurOpacity: Record<BlurLevel, string> = {
  sm: 'rgba(255, 255, 255, 0.06)',
  md: 'rgba(255, 255, 255, 0.10)',
  lg: 'rgba(255, 255, 255, 0.14)',
  xl: 'rgba(255, 255, 255, 0.18)',
};

export const Glassmorphism: React.FC<GlassProps> = ({
  children,
  style,
  blur = 'md',
}) => {
  return (
    <View
      style={[
        {
          backgroundColor: blurOpacity[blur],
          borderWidth: 1,
          borderColor: colors.border.primary,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const GlassCard: React.FC<GlassProps> = ({ children, style, blur = 'sm' }) => {
  return (
    <Glassmorphism
      blur={blur}
      style={[
        {
          borderRadius: 16,
          backgroundColor: colors.background.secondary,
        },
        style,
      ]}
    >
      {children}
    </Glassmorphism>
  );
};

export const TiltCard: React.FC<GlassProps> = ({ children, style }) => {
  return <GlassCard style={style}>{children}</GlassCard>;
};

interface FloatingGlassProps {
  children?: React.ReactNode;
  delay?: number;
}

export const FloatingGlass: React.FC<FloatingGlassProps> = ({ children, delay = 0 }) => {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(8)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};
