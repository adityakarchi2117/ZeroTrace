import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuthStore } from '../store/authStore';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import KeyGenerationScreen from '../screens/auth/KeyGenerationScreen';

// Main App
import MainTabNavigator from './MainTabNavigator';

// Onboarding
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  KeyGeneration: { username: string; password: string };
  MainApp: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const { isAuthenticated, isFirstLaunch } = useAuthStore();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardStyleInterpolator: ({ current, layouts }) => ({
          cardStyle: {
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [layouts.screen.width, 0],
                }),
              },
            ],
          },
        }),
      }}
    >
      {isFirstLaunch ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : !isAuthenticated ? (
        <Stack.Group>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="KeyGeneration" component={KeyGenerationScreen} />
        </Stack.Group>
      ) : (
        <Stack.Screen name="MainApp" component={MainTabNavigator} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;