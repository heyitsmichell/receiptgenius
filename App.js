import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors } from './src/theme/theme';
import { CONFIG } from './src/config/config';

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

function HybridWebShell({ targetUrl, onFallbackToOffline }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={colors.background} />
      <View style={styles.webviewContainer}>
        {hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚡</Text>
            <Text style={styles.errorTitle}>Offline or Unreachable</Text>
            <Text style={styles.errorSubtitle}>
              Could not connect to the live Vercel web shell ({targetUrl}). You can switch to local offline mode to view and record receipts using device storage.
            </Text>
            <View style={styles.errorActionRow}>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setHasError(false);
                  setIsLoading(true);
                  setKey((prev) => prev + 1);
                }}
              >
                <Text style={styles.retryButtonText}>🔄 Retry Online</Text>
              </TouchableOpacity>

              {onFallbackToOffline && (
                <TouchableOpacity
                  style={styles.fallbackButton}
                  onPress={onFallbackToOffline}
                >
                  <Text style={styles.fallbackButtonText}>⚡ Use Offline Mode</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <WebView
            key={key}
            source={{ uri: targetUrl }}
            style={styles.webview}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            onHttpError={(syntheticEvent) => {
              const { statusCode } = syntheticEvent.nativeEvent;
              if (statusCode >= 500) {
                setHasError(true);
              }
            }}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
        )}
        {isLoading && !hasError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Connecting to Vercel Live Shell...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function NativeAppContent({ isOfflineFallback, onRetryOnline }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={colors.background} />
      {isOfflineFallback && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            ⚡ Offline Mode — Running locally from device memory
          </Text>
          {onRetryOnline && (
            <TouchableOpacity style={styles.reconnectButton} onPress={onRetryOnline}>
              <Text style={styles.reconnectButtonText}>Try Live Shell</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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
    </SafeAreaView>
  );
}

export default function App() {
  const vercelUrl = (CONFIG.VERCEL_APP_URL || '').trim();
  const [useOfflineFallback, setUseOfflineFallback] = useState(false);

  // If running on web (`expo export -p web` for Vercel deployment) or no Vercel URL configured,
  // render the standard React Navigation interface without offline fallback banners.
  if (Platform.OS === 'web' || !vercelUrl.startsWith('http')) {
    return <NativeAppContent isOfflineFallback={false} />;
  }

  // If in offline fallback mode (user opted to use local storage when WebView couldn't connect),
  // render native app with offline status bar.
  if (useOfflineFallback) {
    return (
      <NativeAppContent
        isOfflineFallback={true}
        onRetryOnline={() => setUseOfflineFallback(false)}
      />
    );
  }

  // Otherwise, render the hybrid WebView shell pointing to Vercel
  return (
    <HybridWebShell
      targetUrl={vercelUrl}
      onFallbackToOffline={() => setUseOfflineFallback(true)}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    color: colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.background,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  errorActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryButtonText: {
    color: '#003824',
    fontWeight: '700',
    fontSize: 15,
  },
  fallbackButton: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  fallbackButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  offlineBanner: {
    backgroundColor: 'rgba(78, 222, 163, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(78, 222, 163, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineBannerText: {
    color: '#4edea3',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  reconnectButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginLeft: 10,
  },
  reconnectButtonText: {
    color: '#003824',
    fontSize: 11,
    fontWeight: '700',
  },
});
