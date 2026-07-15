import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from './src/theme/theme';

import DashboardScreen from './src/screens/DashboardScreen';
import ScanReceiptScreen from './src/screens/ScanReceiptScreen';
import SpendingHistoryScreen from './src/screens/SpendingHistoryScreen';
import GoogleSheetsSyncScreen from './src/screens/GoogleSheetsSyncScreen';

const Tab = createBottomTabNavigator();

const DarkNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.onSurface,
    border: colors.surfaceHighest,
    primary: colors.primary,
  },
};

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer theme={DarkNavigationTheme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.onSurfaceVariant,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.surfaceHighest,
              borderTopWidth: 1,
              height: 64,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{
              tabBarLabel: 'Dashboard',
            }}
          />
          <Tab.Screen
            name="Scan"
            component={ScanReceiptScreen}
            options={{
              tabBarLabel: 'Scan Receipt',
            }}
          />
          <Tab.Screen
            name="History"
            component={SpendingHistoryScreen}
            options={{
              tabBarLabel: 'History & Ledger',
            }}
          />
          <Tab.Screen
            name="SheetsSync"
            component={GoogleSheetsSyncScreen}
            options={{
              tabBarLabel: 'Sheets Sync',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
