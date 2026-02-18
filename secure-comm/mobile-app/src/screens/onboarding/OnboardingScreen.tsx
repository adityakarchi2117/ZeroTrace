/**
 * OnboardingScreen — Enhanced multi-page onboarding with animations
 * Features: ParticleField background, EncryptionLock animation, staggered text reveals,
 * swipeable pages, animated progress dots, security feature checklist.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
  Dimensions,
  FlatList,
  ViewToken,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { EncryptionLock } from '../../components/motion/EncryptionLock';
import { ParticleField } from '../../components/motion/ParticleField';
import { durations, easings } from '../../components/motion/config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingScreenProps {
  navigation: any;
}

// Pages
const PAGES = [
  {
    icon: 'lock-closed',
    title: 'End-to-End\nEncryption',
    subtitle: 'Messages are encrypted on your device. Not even our servers can read them.',
    gradient: ['#3B82F6', '#8B5CF6'] as const,
  },
  {
    icon: 'key',
    title: 'Zero-Knowledge\nArchitecture',
    subtitle: 'Your private keys never leave your device. We can\'t access your data — ever.',
    gradient: ['#8B5CF6', '#EC4899'] as const,
  },
  {
    icon: 'shield-checkmark',
    title: 'Perfect Forward\nSecrecy',
    subtitle: 'Every message uses a unique session key. Even if one is compromised, past messages stay safe.',
    gradient: ['#06B6D4', '#3B82F6'] as const,
  },
  {
    icon: 'finger-print',
    title: 'Verify Your\nContacts',
    subtitle: 'Compare key fingerprints to ensure you\'re talking to who you think you are.',
    gradient: ['#10B981', '#06B6D4'] as const,
  },
];

const FEATURES = [
  { icon: 'checkmark-circle', text: 'End-to-end encryption', color: '#4ADE80' },
  { icon: 'checkmark-circle', text: 'Zero-knowledge server', color: '#4ADE80' },
  { icon: 'checkmark-circle', text: 'Perfect Forward Secrecy', color: '#4ADE80' },
  { icon: 'checkmark-circle', text: 'Open-source cryptography', color: '#4ADE80' },
];

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ navigation }) => {
  const setFirstLaunch = useAuthStore((s) => s.setFirstLaunch);
  const flatListRef = useRef<FlatList>(null);

  const [currentPage, setCurrentPage] = useState(0);

  // Animation values
  const fadeIn = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const titleSlide = useRef(new Animated.Value(30)).current;
  const subtitleSlide = useRef(new Animated.Value(30)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;
  const featureAnims = useRef(FEATURES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Staggered entrance animation
    Animated.sequence([
      // Fade in background
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: durations.fade,
        useNativeDriver: true,
      }),
      // Logo pop
      Animated.spring(logoScale, {
        toValue: 1,
        stiffness: 200,
        damping: 15,
        useNativeDriver: true,
      }),
      // Title slide up
      Animated.parallel([
        Animated.timing(titleSlide, {
          toValue: 0,
          duration: durations.slideIn,
          easing: easings.decelerate,
          useNativeDriver: true,
        }),
        Animated.timing(subtitleSlide, {
          toValue: 0,
          duration: durations.slideIn,
          easing: easings.decelerate,
          delay: 100,
          useNativeDriver: true,
        }),
      ]),
      // Features stagger
      Animated.stagger(
        120,
        featureAnims.map((a) =>
          Animated.timing(a, {
            toValue: 1,
            duration: 250,
            easing: easings.decelerate,
            useNativeDriver: true,
          }),
        ),
      ),
      // Button
      Animated.timing(buttonFade, {
        toValue: 1,
        duration: durations.fade,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleContinue = () => {
    setFirstLaunch(false);
    navigation.replace('Login');
  };

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentPage + 1 });
    } else {
      handleContinue();
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentPage(viewableItems[0].index);
      }
    },
  ).current;

  const renderPage = ({ item, index }: { item: typeof PAGES[0]; index: number }) => (
    <View style={styles.page}>
      {/* Icon */}
      <LinearGradient
        colors={[...item.gradient]}
        style={styles.pageIconWrap}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.pageIconInner}>
          <Icon name={item.icon} size={40} color={item.gradient[0]} />
        </View>
      </LinearGradient>

      <Text style={styles.pageTitle}>{item.title}</Text>
      <Text style={styles.pageSubtitle}>{item.subtitle}</Text>
    </View>
  );

  const isLastPage = currentPage === PAGES.length - 1;

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      {/* Particle background */}
      <View style={StyleSheet.absoluteFill}>
        <ParticleField density="low" color="rgba(59, 130, 246, 0.15)" />
      </View>

      <LinearGradient
        colors={['#0f172a', '#1e293b', '#0f172a']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
        <EncryptionLock size={64} />
      </Animated.View>

      <Animated.Text
        style={[styles.appName, { transform: [{ translateY: titleSlide }] }]}
      >
        CipherLink
      </Animated.Text>
      <Animated.Text
        style={[styles.tagline, { transform: [{ translateY: subtitleSlide }] }]}
      >
        Private by design. Secure by default.
      </Animated.Text>

      {/* Swipeable pages */}
      <View style={styles.pagerWrap}>
        <FlatList
          ref={flatListRef}
          data={PAGES}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderPage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        />

        {/* Dots */}
        <View style={styles.dotsRow}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                currentPage === i ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Security features */}
      <View style={styles.featuresWrap}>
        {FEATURES.map((f, i) => (
          <Animated.View
            key={f.text}
            style={[
              styles.featureRow,
              {
                opacity: featureAnims[i],
                transform: [
                  {
                    translateX: featureAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Icon name={f.icon} size={16} color={f.color} />
            <Text style={styles.featureText}>{f.text}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Buttons */}
      <Animated.View style={[styles.buttonsRow, { opacity: buttonFade }]}>
        {!isLastPage && (
          <TouchableOpacity style={styles.skipButton} onPress={handleContinue}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, isLastPage && { flex: 1 }]}
          onPress={handleNext}
        >
          <LinearGradient
            colors={['#3B82F6', '#8B5CF6']}
            style={styles.nextGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.nextText}>
              {isLastPage ? 'Get Started' : 'Next'}
            </Text>
            <Icon
              name={isLastPage ? 'arrow-forward' : 'chevron-forward'}
              size={18}
              color="#FFF"
            />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: SCREEN_HEIGHT * 0.08,
    paddingBottom: 40,
    backgroundColor: '#0f172a',
  },
  logoWrap: {
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 24,
  },
  pagerWrap: {
    height: 260,
    marginBottom: 16,
  },
  page: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  pageIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageIconInner: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 30,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#3B82F6',
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#334155',
  },
  featuresWrap: {
    alignSelf: 'center',
    gap: 6,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  buttonsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    width: '100%',
    marginTop: 'auto',
  },
  skipButton: {
    flex: 0.4,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '600',
  },
  nextButton: {
    flex: 0.6,
    borderRadius: 14,
    overflow: 'hidden',
  },
  nextGradient: {
    flexDirection: 'row',
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  nextText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default OnboardingScreen;
