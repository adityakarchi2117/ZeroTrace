import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuthStore } from '../store/authStore';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import KeyGenerationScreen from '../screens/auth/KeyGenerationScreen';

// Main App
import MainTabNavigator from './MainTabNavigator';
import AddContactScreen from '../screens/main/AddContactScreen';
import PendingRequestsScreen from '../screens/main/PendingRequestsScreen';
import QRScannerScreen from '../screens/main/QRScannerScreen';
import BlockedUsersScreen from '../screens/main/BlockedUsersScreen';
import TrustVerificationScreen from '../screens/main/TrustVerificationScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import PrivacySettingsScreen from '../screens/main/PrivacySettingsScreen';
import ChatScreen from '../screens/main/ChatScreen';
import NotificationSettingsScreen from '../screens/main/NotificationSettingsScreen';
import SecuritySettingsScreen from '../screens/main/SecuritySettingsScreen';
import KeyBackupScreen from '../screens/main/KeyBackupScreen';
import AppearanceSettingsScreen from '../screens/main/AppearanceSettingsScreen';
import DeviceManagementScreen from '../screens/main/DeviceManagementScreen';
import DataStorageScreen from '../screens/main/DataStorageScreen';
import WallpaperSettingsScreen from '../screens/main/WallpaperSettingsScreen';
import SessionManagementScreen from '../screens/main/SessionManagementScreen';
import AccountActionsScreen from '../screens/main/AccountActionsScreen';
import TrustedContactsScreen from '../screens/main/TrustedContactsScreen';
import LoadingScreen from '../screens/main/LoadingScreen';

// Onboarding
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

import CallScreenWrapper from '../screens/main/CallScreenWrapper';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  KeyGeneration: { username: string; password: string };
  MainApp: undefined;
  AddContact: undefined;
  PendingRequests: undefined;
  QRScanner: undefined;
  BlockedUsers: undefined;
  TrustVerification: { contact: any };
  Profile: { userId?: number };
  EditProfile: undefined;
  PrivacySettings: undefined;
  Chat: { userId: number; username: string };
  Call: { username: string; userId: number; callType: 'audio' | 'video'; isIncoming: boolean; callId?: string };
  NotificationSettings: undefined;
  SecuritySettings: undefined;
  KeyBackup: undefined;
  AppearanceSettings: undefined;
  DeviceManagement: undefined;
  DataStorage: undefined;
  WallpaperSettings: undefined;
  SessionManagement: undefined;
  AccountActions: undefined;
  TrustedContacts: undefined;
  Loading: undefined;
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
        <Stack.Group>
          <Stack.Screen name="MainApp" component={MainTabNavigator} />
          <Stack.Screen name="AddContact" component={AddContactScreen} />
          <Stack.Screen name="PendingRequests" component={PendingRequestsScreen} />
          <Stack.Screen name="QRScanner" component={QRScannerScreen} />
          <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
          <Stack.Screen name="TrustVerification" component={TrustVerificationScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Call" component={CallScreenWrapper} options={{ gestureEnabled: false }} />
          <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
          <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} />
          <Stack.Screen name="KeyBackup" component={KeyBackupScreen} />
          <Stack.Screen name="AppearanceSettings" component={AppearanceSettingsScreen} />
          <Stack.Screen name="DeviceManagement" component={DeviceManagementScreen} />
          <Stack.Screen name="DataStorage" component={DataStorageScreen} />
          <Stack.Screen name="WallpaperSettings" component={WallpaperSettingsScreen} />
          <Stack.Screen name="SessionManagement" component={SessionManagementScreen} />
          <Stack.Screen name="AccountActions" component={AccountActionsScreen} />
          <Stack.Screen name="TrustedContacts" component={TrustedContactsScreen} />
          <Stack.Screen name="Loading" component={LoadingScreen} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
