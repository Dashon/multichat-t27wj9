/**
 * @fileoverview Main navigation component that orchestrates routing between authentication,
 * chat, and settings sections with enhanced security and accessibility features.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useMediaQuery, CircularProgress, Box } from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';

// Internal imports
import AuthNavigator from './AuthNavigator';
import ChatNavigator from './ChatNavigator';
import SettingsNavigator from './SettingsNavigator';
import { ROUTE_PATHS } from '../config/routes.config';
import { useAuth } from '../hooks/useAuth';

// Styled components with Material Design 3 principles
const LoadingContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  backgroundColor: theme.palette.background.default,
}));

/**
 * Protected route wrapper component with authentication checks
 */
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <LoadingContainer>
        <CircularProgress 
          size={40} 
          aria-label="Checking authentication"
        />
      </LoadingContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate 
        to={ROUTE_PATHS.AUTH} 
        state={{ from: location }} 
        replace 
      />
    );
  }

  return <>{children}</>;
};

/**
 * Main navigation component implementing protected routes and responsive design
 */
const AppNavigator: React.FC = React.memo(() => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isAuthenticated, isLoading } = useAuth();
  const [isNavigating, setIsNavigating] = useState(false);

  /**
   * Handles route change announcements for accessibility
   */
  const announceRouteChange = useCallback((path: string) => {
    const routeName = path.split('/').pop() || 'home';
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = `Navigated to ${routeName}`;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, []);

  /**
   * Effect to handle navigation state and announcements
   */
  useEffect(() => {
    return () => {
      setIsNavigating(false);
    };
  }, []);

  if (isLoading) {
    return (
      <LoadingContainer>
        <CircularProgress 
          size={40} 
          aria-label="Loading application"
        />
      </LoadingContainer>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication routes */}
        <Route 
          path={`${ROUTE_PATHS.AUTH}/*`} 
          element={
            isAuthenticated ? (
              <Navigate to={ROUTE_PATHS.CHAT} replace />
            ) : (
              <AuthNavigator />
            )
          } 
        />

        {/* Protected chat routes */}
        <Route
          path={`${ROUTE_PATHS.CHAT}/*`}
          element={
            <ProtectedRoute>
              <ChatNavigator
                onlineStatus={true}
                initialAgentPanelState={!isMobile}
              />
            </ProtectedRoute>
          }
        />

        {/* Protected settings routes */}
        <Route
          path={`${ROUTE_PATHS.SETTINGS}/*`}
          element={
            <ProtectedRoute>
              <SettingsNavigator />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route
          path="*"
          element={
            <Navigate
              to={isAuthenticated ? ROUTE_PATHS.CHAT : ROUTE_PATHS.AUTH}
              replace
            />
          }
        />
      </Routes>

      {/* Hidden live region for route announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
    </BrowserRouter>
  );
});

AppNavigator.displayName = 'AppNavigator';

export default AppNavigator;