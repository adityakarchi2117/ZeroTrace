/**
 * Key Generation Screen with Glassmorphism and 3D Effects
 * Displays cryptographic key generation progress
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import { colors } from '../../theme/colors';
import { Glassmorphism } from '../../components/motion/Glassmorphism';
import { TiltAvatar } from '../../components/motion/TiltAvatar';

interface KeyGenerationScreenProps {
  route?: {
    params: {
      username: string;
      password: string;
    };
  };
}

const steps = [
  { id: 1, label: 'Generating identity key...', icon: 'key' },
  { id: 2, label: 'Creating signed pre-keys...', icon: 'shield' },
  { id: 3, label: 'Generating one-time pre-keys...', icon: 'lock-closed' },
  { id: 4, label: 'Registering with server...', icon: 'cloud-upload' },
  { id: 5, label: 'Finalizing setup...', icon: 'checkmark' },
];

const KeyGenerationScreen: React.FC<KeyGenerationScreenProps> = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress] = useState(new RNAnimated.Value(0));

  useEffect(() => {
    // Simulate key generation steps
    let step = 0;
    const interval = setInterval(() => {
      if (step < steps.length) {
        setCurrentStep(step);
        RNAnimated.timing(progress, {
          toValue: ((step + 1) / steps.length) * 100,
          duration: 500,
          useNativeDriver: false,
        }).start();
        step++;
      } else {
        clearInterval(interval);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const width = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Background decoration */}
      <View style={styles.bgDecoration}>
        <View style={[styles.bgCircle, { top: -100, left: -100 }]} />
        <View style={[styles.bgCircle, { bottom: -150, right: -100 }]} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* 3D Animated Lock Icon */}
        <TiltAvatar style={styles.iconContainer} maxTilt={25} scale={1.15}>
          <Glassmorphism style={styles.lockIcon} blur="xl">
            <Icon name="lock-closed" size={48} color={colors.primary.main} />
          </Glassmorphism>
        </TiltAvatar>

        <Text style={styles.title}>Generating Keys</Text>
        <Text style={styles.subtitle}>
          Creating your cryptographic identity. This may take a moment...
        </Text>

        {/* Progress Bar */}
        <Glassmorphism style={styles.progressContainer} blur="md">
          <RNAnimated.View style={[styles.progressBar, { width }]} />
        </Glassmorphism>

        {/* Steps */}
        <View style={styles.stepsContainer}>
          {steps.map((step, index) => (
            <View key={step.id} style={styles.stepRow}>
              <View
                style={[
                  styles.stepIcon,
                  index <= currentStep && styles.stepIconActive,
                ]}
              >
                <Icon
                  name={step.icon}
                  size={16}
                  color={index <= currentStep ? colors.text.inverse : colors.text.muted}
                />
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  index <= currentStep && styles.stepLabelActive,
                ]}
              >
                {step.label}
              </Text>
              {index < currentStep && (
                <Icon
                  name="checkmark-circle"
                  size={18}
                  color={colors.status.success}
                  style={styles.stepCheck}
                />
              )}
            </View>
          ))}
        </View>

        {/* Security Note */}
        <Glassmorphism style={styles.securityNote} blur="sm">
          <Icon name="shield-checkmark" size={20} color={colors.status.success} />
          <Text style={styles.securityText}>
            Your private keys never leave this device
          </Text>
        </Glassmorphism>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  bgDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bgCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: `${colors.primary.main}10`,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    marginBottom: 32,
  },
  lockIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  progressContainer: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 32,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary.main,
    borderRadius: 4,
  },
  stepsContainer: {
    width: '100%',
    marginBottom: 32,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepIconActive: {
    backgroundColor: colors.primary.main,
  },
  stepLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text.muted,
  },
  stepLabelActive: {
    color: colors.text.primary,
    fontWeight: '500',
  },
  stepCheck: {
    marginLeft: 8,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  securityText: {
    marginLeft: 12,
    fontSize: 14,
    color: colors.text.secondary,
  },
});

export default KeyGenerationScreen;
