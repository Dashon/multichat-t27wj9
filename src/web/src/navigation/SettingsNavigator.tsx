import React, { useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'; // v6.16.0
import Analytics from '@mixpanel/browser'; // v2.47.0

// Internal imports
import ProfileScreen from '../screens/settings/ProfileScreen';
import PreferencesScreen from '../screens/settings/PreferencesScreen';
import ThemeScreen from '../screens/settings/ThemeScreen';
import { ROUTE_PATHS } from '../config/routes.config';

// Analytics configuration
Analytics.init(process.env.REACT_APP_MIXPANEL_TOKEN || '');

/**
 * Enhanced settings navigation component that manages routing between different settings screens
 * Implements Material Design 3 principles with enhanced accessibility and transitions
 */
const SettingsNavigator: React.FC = React.memo(() => {
  const location = useLocation();

  /**
   * Track screen views for analytics
   */
  const trackScreenView = useCallback((screenName: string) => {
    Analytics.track('Settings Screen View', {
      screen: screenName,
      timestamp: new Date().toISOString(),
      path: location.pathname
    });
  }, [location.pathname]);

  /**
   * Handle navigation errors
   */
  const handleNavigationError = useCallback((error: Error) => {
    console.error('Settings navigation error:', error);
    Analytics.track('Settings Navigation Error', {
      error: error.message,
      path: location.pathname,
      timestamp: new Date().toISOString()
    });
  }, [location.pathname]);

  /**
   * Effect to handle route changes and analytics
   */
  useEffect(() => {
    const currentRoute = location.pathname.split('/').pop();
    if (currentRoute) {
      trackScreenView(currentRoute);
    }
  }, [location.pathname, trackScreenView]);

  /**
   * Error boundary for settings navigation
   */
  const handleError = useCallback((error: Error) => {
    handleNavigationError(error);
    // Could implement additional error handling here
    return (
      <Navigate 
        to={ROUTE_PATHS.SETTINGS_PROFILE} 
        replace 
        state={{ error: error.message }} 
      />
    );
  }, [handleNavigationError]);

  return (
    <Routes>
      {/* Profile Settings Route */}
      <Route
        path={ROUTE_PATHS.SETTINGS_PROFILE}
        element={
          <ProfileScreen
            onError={handleError}
            testId="settings-profile-screen"
          />
        }
      />

      {/* Preferences Settings Route */}
      <Route
        path={ROUTE_PATHS.SETTINGS_PREFERENCES}
        element={
          <PreferencesScreen
            onError={handleError}
            testId="settings-preferences-screen"
          />
        }
      />

      {/* Theme Settings Route */}
      <Route
        path={ROUTE_PATHS.SETTINGS_THEME}
        element={
          <ThemeScreen
            onError={handleError}
            testId="settings-theme-screen"
          />
        }
      />

      {/* Default Redirect */}
      <Route
        path="*"
        element={
          <Navigate
            to={ROUTE_PATHS.SETTINGS_PROFILE}
            replace
            state={{ from: location }}
          />
        }
      />
    </Routes>
  );
});

// Set display name for debugging
SettingsNavigator.displayName = 'SettingsNavigator';

export default SettingsNavigator;