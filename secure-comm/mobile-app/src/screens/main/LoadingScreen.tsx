/**
 * LoadingScreen — CipherLink splash/loading screen
 * Matches web's LoadingScreen.tsx with animated logo, bouncing dots,
 * and security features checklist.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';
import { durations, easings } from '../../components/motion/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing secure connection',
}) => {
  // Logo pulse
  const logoPulse = useRef(new Animated.Value(1)).current;

  // Bouncing dots
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  // Staggered feature rows
  const features = [
    { icon: 'checkmark-circle', label: 'End-to-end encryption' },
    { icon: 'checkmark-circle', label: 'Zero-knowledge server' },
    { icon: 'checkmark-circle', label: 'Perfect Forward Secrecy' },
  ];
  const featureAnims = useRef(features.map(() => new Animated.Value(0))).current;

  // Dots text animation
  const dotsOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Logo pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 2. Bouncing dots — staggered loop
    const bounceDot = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -12,
            duration: 300,
            easing: easings.bounce,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            easing: easings.decelerate,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay), // keep total cycle 900ms
        ]),
      );
    bounceDot(dot1, 0).start();
    bounceDot(dot2, 150).start();
    bounceDot(dot3, 300).start();

    // 3. Stagger feature rows
    Animated.stagger(
      200,
      featureAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: durations.slideIn,
          easing: easings.decelerate,
          useNativeDriver: true,
        }),
      ),
    ).start();

    // 4. Dots text blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotsOpacity, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(dotsOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <LinearGradient
      colors={['#0f172a', '#1e293b', '#0f172a']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoPulse }] }]}>
        <LinearGradient
          colors={['#3B82F6', '#8B5CF6']}
          style={styles.logoOuter}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.logoInner}>
            <Icon name="lock-closed" size={32} color="#60A5FA" />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* App Name */}
      <Text style={styles.appName}>CipherLink</Text>
      <Text style={styles.tagline}>Private by design. Secure by default.</Text>

      {/* Bouncing Dots */}
      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: ['#3B82F6', '#8B5CF6', '#06B6D4'][i],
                transform: [{ translateY: anim }],
              },
            ]}
          />
        ))}
      </View>

      {/* Message */}
      <Animated.Text style={[styles.message, { opacity: dotsOpacity }]}>
        {message}...
      </Animated.Text>

      {/* Security Features */}
      <View style={styles.featuresWrap}>
        {features.map((feat, i) => (
          <Animated.View
            key={feat.label}
            style={[
              styles.featureRow,
              {
                opacity: featureAnims[i],
                transform: [
                  {
                    translateY: featureAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Icon name={feat.icon} size={16} color="#4ADE80" />
            <Text style={styles.featureText}>{feat.label}</Text>
          </Animated.View>
        ))}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    marginBottom: 24,
  },
  logoOuter: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoInner: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
    height: 24,
    alignItems: 'flex-end',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  message: {
    fontSize: 16,
    color: '#CBD5E1',
    marginBottom: 32,
  },
  featuresWrap: {
    gap: 8,
    alignItems: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});

export default LoadingScreen;
