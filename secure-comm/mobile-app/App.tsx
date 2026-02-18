/**
 * ZeroTrace Mobile App
 * End-to-end encrypted messaging for iOS and Android
 *
 * Root component integrating:
 * - Navigation
 * - Auth initialization (authStore + chatStore)
 * - Biometric lock screen
 * - Offline banner
 * - Incoming call handler
 * - Network monitoring
 * - Notification service
 */

import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar, LogBox, AppState, AppStateStatus, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import FlashMessage from 'react-native-flash-message';
import 'react-native-get-random-values'; // Required for crypto

import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { useChatStore } from './src/store/chatStore';
import { initializeCrypto } from './src/utils/crypto';
import { colors } from './src/theme/colors';
import IncomingCallHandler from './src/components/VideoCall/IncomingCallHandler';
import BiometricLockScreen from './src/components/security/BiometricLockScreen';
import OfflineBanner from './src/components/common/OfflineBanner';
import { biometricService } from './src/services/biometric';
import { networkMonitor, useNetworkStatus } from './src/services/networkMonitor';
import { notificationService } from './src/services/notifications';
import { wsManager } from './src/services/websocket';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Remote debugger',
  'Require cycle',
]);

const App: React.FC = () => {
  const { initializeAuth, isAuthenticated } = useAuthStore();
  const initializeChatAuth = useChatStore((s) => s.initializeAuth);

  const [isLocked, setIsLocked] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const networkStatus = useNetworkStatus();

  // ─── Initialization ─────────────────────

  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize cryptographic libraries
        await initializeCrypto();

        // Initialize biometric service
        await biometricService.initialize();

        // Check if biometric lock is required on launch
        if (biometricService.shouldRequireOnLaunch()) {
          setIsLocked(true);
        }

        // Check for stored authentication (legacy auth store)
        await initializeAuth();

        // Initialize chat store (loads keys, connects WS, loads data)
        await initializeChatAuth();

        // Start network monitoring
        networkMonitor.start();

        // Initialize notification service
        await notificationService.initialize();

        setIsInitialized(true);
      } catch (error) {
        console.error('App initialization error:', error);
        setIsInitialized(true); // Still show app even on error
      }
    };

    initialize();

    return () => {
      networkMonitor.stop();
    };
  }, [initializeAuth, initializeChatAuth]);

  // ─── App State Monitoring (Biometric) ───

  useEffect(() => {
    let backgroundTime = 0;

    const subscription = AppState.addEventListener(
      'change',
      async (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          backgroundTime = Date.now();
        }

        if (nextState === 'active' && backgroundTime > 0) {
          const elapsed = (Date.now() - backgroundTime) / 1000;
          backgroundTime = 0;

          // Check if biometric re-auth is needed
          if (isAuthenticated && biometricService.shouldRequireAuth()) {
            setIsLocked(true);
          }
        }
      }
    );

    return () => subscription.remove();
  }, [isAuthenticated]);

  // ─── Biometric Unlock Handler ───────────

  const handleBiometricUnlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  // ─── Render ─────────────────────────────

  if (!isInitialized) {
    // Could show a splash screen here
    return (
      <View style={styles.splash}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background.primary}
          translucent={false}
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <NavigationContainer>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background.primary}
          translucent={false}
        />

        {/* Main Navigation */}
        <AppNavigator />

        {/* Offline/Reconnecting Banner */}
        <OfflineBanner
          isConnected={networkStatus.isConnected}
          isWsConnected={isAuthenticated ? wsManager.isConnected() : undefined}
        />

        {/* Incoming Call Handler (app-wide) */}
        <IncomingCallHandler />

        {/* Biometric Lock Overlay */}
        {isLocked && isAuthenticated && (
          <BiometricLockScreen onAuthenticated={handleBiometricUnlock} />
        )}

        {/* Flash Messages */}
        <FlashMessage position="top" />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
});

export default App;