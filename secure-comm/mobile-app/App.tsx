/**
 * CipherLink Mobile App
 * End-to-end encrypted messaging for iOS and Android
 */

import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import FlashMessage from 'react-native-flash-message';
import 'react-native-get-random-values'; // Required for crypto

import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { initializeCrypto } from './src/utils/crypto';
import { colors } from './src/theme/colors';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Remote debugger',
]);

const App: React.FC = () => {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize cryptographic libraries
        await initializeCrypto();
        
        // Check for stored authentication
        await initializeAuth();
      } catch (error) {
        console.error('App initialization error:', error);
      }
    };

    initialize();
  }, [initializeAuth]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background.primary}
          translucent={false}
        />
        <AppNavigator />
        <FlashMessage position="top" />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
};

export default App;