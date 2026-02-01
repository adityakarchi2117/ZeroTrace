import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { colors } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { TiltAvatar } from '../../components/motion/TiltAvatar';
import { Glassmorphism, GlassCard } from '../../components/motion/Glassmorphism';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { login, isLoading } = useAuthStore();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    try {
      await login(username.trim(), password);
    } catch (error) {
      Alert.alert('Login Failed', 'Invalid username or password');
    }
  };

  const navigateToRegister = () => {
    navigation.navigate('Register');
  };

  // Animated scale for inputs
  const inputScale = useSharedValue(1);
  
  const animatedInputStyle = useAnimatedStyle(() => ({
    transform: [{ scale: inputScale.value }],
  }));

  const handleFocus = () => {
    inputScale.value = withSpring(1.02, { damping: 15 });
  };

  const handleBlur = () => {
    inputScale.value = withSpring(1, { damping: 15 });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Logo Section with 3D Tilt */}
        <View style={styles.logoSection}>
          <TiltAvatar style={styles.logoContainer} maxTilt={15} scale={1.1}>
            <View style={styles.logoBackground}>
              <Icon name="lock-closed" size={40} color={colors.primary.main} />
            </View>
          </TiltAvatar>
          <Text style={styles.title}>CipherLink</Text>
          <Text style={styles.subtitle}>Private by design. Secure by default.</Text>
        </View>

        {/* Form Section with Glassmorphism */}
        <GlassCard style={styles.formCard}>
          <Text style={styles.formTitle}>Welcome Back</Text>
          <Text style={styles.formSubtitle}>Sign in to access your encrypted messages</Text>

          <Animated.View style={[styles.inputContainer, animatedInputStyle]}>
            <Icon name="person-outline" size={20} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={colors.text.muted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </Animated.View>

          <Animated.View style={[styles.inputContainer, animatedInputStyle]}>
            <Icon name="lock-closed-outline" size={20} color={colors.text.muted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={colors.text.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Icon
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.loginButtonText}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Text>
            <Icon name="arrow-forward" size={18} color={colors.text.inverse} style={styles.buttonIcon} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Security Features with Glassmorphism */}
        <View style={styles.featuresSection}>
          <Glassmorphism style={styles.featureCard} blur="sm">
            <Icon name="shield-checkmark" size={20} color={colors.status.success} />
            <Text style={styles.featureText}>End-to-end encryption</Text>
          </Glassmorphism>
          <Glassmorphism style={styles.featureCard} blur="sm">
            <Icon name="eye-off" size={20} color={colors.status.success} />
            <Text style={styles.featureText}>Zero-knowledge server</Text>
          </Glassmorphism>
          <Glassmorphism style={styles.featureCard} blur="sm">
            <Icon name="key" size={20} color={colors.status.success} />
            <Text style={styles.featureText}>Perfect Forward Secrecy</Text>
          </Glassmorphism>
        </View>

        {/* Register Link */}
        <View style={styles.registerSection}>
          <Text style={styles.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={navigateToRegister}>
            <Text style={styles.registerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoBackground: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
    shadowColor: colors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  formCard: {
    marginBottom: 24,
    padding: 24,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.tertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.primary,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  loginButton: {
    backgroundColor: colors.primary.main,
    borderRadius: 12,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  buttonIcon: {
    marginLeft: 8,
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.primary.main,
  },
  featuresSection: {
    marginBottom: 24,
    gap: 8,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
  featureText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 12,
    fontWeight: '500',
  },
  registerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  registerLink: {
    fontSize: 14,
    color: colors.primary.main,
    fontWeight: '600',
  },
});

export default LoginScreen;