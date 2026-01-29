import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

import ChatsScreen from '../screens/main/ChatsScreen';
import ContactsScreen from '../screens/main/ContactsScreen';
import VaultScreen from '../screens/main/VaultScreen';
import SettingsScreen from '../screens/main/SettingsScreen';

import { colors } from '../theme/colors';

export type MainTabParamList = {
  Chats: undefined;
  Contacts: undefined;
  Vault: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Chats':
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
              break;
            case 'Contacts':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Vault':
              iconName = focused ? 'lock-closed' : 'lock-closed-outline';
              break;
            case 'Settings':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'circle';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary.main,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: {
          backgroundColor: colors.background.secondary,
          borderTopColor: colors.border.primary,
          borderTopWidth: 1,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen 
        name="Chats" 
        component={ChatsScreen}
        options={{
          tabBarBadge: undefined, // TODO: Add unread count
        }}
      />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;