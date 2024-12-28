/**
 * @fileoverview Entry point for the React Native mobile application of the AI-Enhanced Group Chat Platform.
 * Implements core providers, theme support, navigation, and state management with comprehensive monitoring.
 * @version 1.0.0
 */

import React, { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { registerRootComponent } from 'expo';
import { ThemeProvider } from '@rneui/themed';
import { useColorScheme } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';
import * as SplashScreen from 'expo-splash-screen';
import * as Analytics from '@datadog/mobile-react-native';

// Internal imports
import AppNavigator from './src/navigation/AppNavigator';
import store from './src/store/store';
import { lightTheme, darkTheme } from './styles/theme';
import { initializeTheme } from './store/slices/themeSlice';
import { PERFORMANCE_METRICS } from './config/constants';

// Keep splash screen visible while we initialize
SplashScreen.preventAutoHideAsync();

/**
 * Error fallback component for graceful error handling
 */
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <View style={styles.errorContainer}>
    <Text style={styles.errorText}>Something went wrong:</Text>
    <Text style={styles.errorMessage}>{error.message}</Text>
    <Button title="Try again" onPress={resetErrorBoundary} />
  </View>
);

/**
 * Root component that wraps the application with necessary providers
 */
const App: React.FC = () => {
  const colorScheme = useColorScheme();
  const [appIsReady, setAppIsReady] = useState(false);

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize analytics
        await Analytics.init({
          applicationId: process.env.EXPO_PUBLIC_DATADOG_APP_ID,
          clientToken: process.env.EXPO_PUBLIC_DATADOG_CLIENT_TOKEN,
          env: process.env.EXPO_PUBLIC_ENV || 'production',
          trackInteractions: true,
          trackResources: true,
          trackErrors: true,
        });

        // Initialize theme based on system preference
        store.dispatch(initializeTheme());

        // Track app load performance
        const loadTime = performance.now();
        Analytics.addTiming('app_load', loadTime);

        setAppIsReady(true);
      } catch (error) {
        console.error('App initialization failed:', error);
        Analytics.addError(error);
      }
    };

    initializeApp();
  }, []);

  // Handle app ready state
  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        Analytics.addError(error);
        console.error('App Error:', error);
      }}
    >
      <Provider store={store}>
        <ThemeProvider theme={colorScheme === 'dark' ? darkTheme : lightTheme}>
          <NavigationContainer
            onStateChange={(state) => {
              // Track screen views
              const currentScreen = state?.routes[state.routes.length - 1]?.name;
              if (currentScreen) {
                Analytics.addAction('screen_view', { screen: currentScreen });
              }
            }}
            onReady={() => {
              // Track navigation ready time
              const navReadyTime = performance.now();
              Analytics.addTiming('navigation_ready', navReadyTime);
            }}
            fallback={<ActivityIndicator size="large" />}
          >
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </Provider>
    </ErrorBoundary>
  );
};

// Styles for error fallback
const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorMessage: {
    color: 'red',
    marginBottom: 20,
  },
});

// Performance monitoring
if (__DEV__) {
  const perf = require('react-native-performance');
  perf.initializePerformanceMonitoring({
    metrics: PERFORMANCE_METRICS,
    thresholds: {
      renderTimeout: 2000, // 2s as per requirements
      interactionTimeout: 100,
    },
  });
}

// Register the root component
registerRootComponent(App);

export default App;