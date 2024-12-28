/**
 * @fileoverview Authentication navigation component implementing secure routing
 * with Material Design 3 principles and WCAG 2.1 Level AA compliance
 * @version 1.0.0
 */

import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Internal imports
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import { ROUTE_PATHS } from '../config/routes.config';
import { useAuth } from '../hooks/useAuth';

// Animation variants for route transitions
const pageTransitionVariants = {
  initial: {
    opacity: 0,
    x: -20,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

/**
 * Wrapper component for animated route transitions
 */
const AnimatedPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial="initial"
    animate="animate"
    exit="exit"
    variants={pageTransitionVariants}
    style={{
      width: '100%',
      height: '100%',
      position: 'absolute',
    }}
  >
    {children}
  </motion.div>
);

/**
 * Authentication navigator component managing secure routing between auth screens
 */
const AuthNavigator: React.FC = React.memo(() => {
  const location = useLocation();
  const { isAuthenticated, authLoading } = useAuth();

  // Redirect to chat if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Use replace to prevent back navigation to auth screens
      window.history.replaceState(null, '', '/chat');
    }
  }, [isAuthenticated]);

  // Show loading state
  if (authLoading) {
    return (
      <div
        style={styles.loadingContainer}
        role="progressbar"
        aria-label="Loading authentication"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Loading indicator would be implemented here */}
        </motion.div>
      </div>
    );
  }

  // Redirect to chat if authenticated
  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <div style={styles.container} role="main">
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route
            path={ROUTE_PATHS.LOGIN}
            element={
              <AnimatedPage>
                <LoginScreen />
              </AnimatedPage>
            }
          />
          <Route
            path={ROUTE_PATHS.REGISTER}
            element={
              <AnimatedPage>
                <RegisterScreen />
              </AnimatedPage>
            }
          />
          {/* Redirect to login for any unmatched auth routes */}
          <Route
            path="*"
            element={<Navigate to={ROUTE_PATHS.LOGIN} replace />}
          />
        </Routes>
      </AnimatePresence>
    </div>
  );
});

// Styles object following Material Design 3 principles
const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'var(--md-sys-color-background)',
    position: 'relative' as const,
    overflow: 'hidden',
    minHeight: '100vh',
  },
  loadingContainer: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--md-sys-color-background)',
  },
};

// Set display name for debugging
AuthNavigator.displayName = 'AuthNavigator';

export default AuthNavigator;