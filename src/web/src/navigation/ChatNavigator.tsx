/**
 * @fileoverview ChatNavigator component implementing secure, responsive, and accessible
 * navigation structure for chat-related screens in the AI-Enhanced Group Chat Platform.
 * @version 1.0.0
 */

import React, { useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Internal imports
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatRoomScreen from '../screens/chat/ChatRoomScreen';
import { ROUTE_PATHS } from '../config/routes.config';
import { UserRole } from '../types/user';

/**
 * Props interface for ChatNavigator component
 */
interface ChatNavigatorProps {
  /** User authentication status */
  isAuthenticated: boolean;
  /** User's role for access control */
  userRole: UserRole;
}

/**
 * ChatNavigator component that handles routing for chat-related screens
 * with authentication, responsiveness, and accessibility features
 */
const ChatNavigator: React.FC<ChatNavigatorProps> = ({
  isAuthenticated,
  userRole
}) => {
  const location = useLocation();

  /**
   * Validates user access to chat routes based on role
   */
  const validateAccess = useCallback(() => {
    if (!isAuthenticated) {
      return false;
    }

    // Basic users and above can access chat features
    return [
      UserRole.USER,
      UserRole.PREMIUM_USER,
      UserRole.MODERATOR,
      UserRole.ADMIN
    ].includes(userRole);
  }, [isAuthenticated, userRole]);

  /**
   * Handles route change analytics and accessibility announcements
   */
  useEffect(() => {
    // Track route changes for analytics
    if (window.analytics) {
      window.analytics.page({
        path: location.pathname,
        title: document.title,
        url: window.location.href
      });
    }

    // Announce route changes for screen readers
    const routeAnnouncement = document.getElementById('route-announcer');
    if (routeAnnouncement) {
      routeAnnouncement.textContent = `Navigated to ${document.title}`;
    }
  }, [location]);

  /**
   * Renders protected route with access validation
   */
  const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
    if (!validateAccess()) {
      return (
        <Navigate
          to={ROUTE_PATHS.LOGIN}
          state={{ from: location }}
          replace
        />
      );
    }
    return element;
  };

  return (
    <Routes>
      {/* Chat list route */}
      <Route
        path={ROUTE_PATHS.CHAT}
        element={
          <ProtectedRoute
            element={
              <ChatListScreen />
            }
          />
        }
      />

      {/* Individual chat room route */}
      <Route
        path={`${ROUTE_PATHS.CHAT_ROOM}`}
        element={
          <ProtectedRoute
            element={
              <ChatRoomScreen
                onlineStatus={true}
                initialAgentPanelState={false}
              />
            }
          />
        }
      />

      {/* Fallback route */}
      <Route
        path="*"
        element={
          <Navigate
            to={ROUTE_PATHS.CHAT}
            replace
          />
        }
      />

      {/* Hidden live region for accessibility announcements */}
      <div
        id="route-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0'
        }}
      />
    </Routes>
  );
};

export default ChatNavigator;