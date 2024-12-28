/**
 * @fileoverview Main screen component that displays a list of active chat conversations
 * with real-time updates, supporting group chats and AI agent interactions.
 * Implements virtualized chat list view with offline support and delivery status tracking.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Container, Box, CircularProgress, Alert, Snackbar } from '@mui/material';
import { styled } from '@mui/material/styles';

// Internal imports
import ChatList from '../../components/chat/ChatList';
import { useChat } from '../../hooks/useChat';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getWebSocketConfig } from '../../config/websocket.config';
import { SPACING } from '../../styles/dimensions';
import { IChat } from '../../types/chat';
import { ConnectionState } from '../../hooks/useWebSocket';
import * as chatActions from '../../store/slices/chatSlice';

// Styled components
const StyledContainer = styled(Container)(({ theme }) => ({
  height: '100vh',
  padding: SPACING.md,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  [theme.breakpoints.down('sm')]: {
    padding: SPACING.sm,
  },
}));

const LoadingContainer = styled(Box)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
});

const OfflineIndicator = styled(Alert)(({ theme }) => ({
  position: 'fixed',
  top: SPACING.md,
  right: SPACING.md,
  zIndex: theme.zIndex.snackbar,
}));

/**
 * Main chat list screen component with real-time updates and offline support
 */
const ChatListScreen: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redux selectors
  const chats = useSelector((state: any) => Object.values(state.chat.chats)) as IChat[];
  const loading = useSelector((state: any) => state.chat.loading);

  // WebSocket connection management
  const wsConfig = useMemo(() => getWebSocketConfig(), []);
  const {
    connectionState,
    connectionStats,
    connect,
    disconnect
  } = useWebSocket(
    wsConfig,
    (message) => {
      dispatch(chatActions.addMessage(message));
    }
  );

  // Chat hook for managing real-time updates
  const {
    typingUsers,
    deliveryStatus,
    retryFailedMessages
  } = useChat(selectedChatId || '', {
    autoConnect: true,
    enableOfflineSupport: true,
    enableTypingIndicators: true,
  });

  // Memoized sorted chats
  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const aTime = a.messages[a.messages.length - 1]?.timestamp || a.metadata.lastActivityAt;
      const bTime = b.messages[b.messages.length - 1]?.timestamp || b.metadata.lastActivityAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [chats]);

  /**
   * Handles chat selection and navigation
   */
  const handleChatSelect = useCallback(async (chatId: string) => {
    try {
      setSelectedChatId(chatId);
      dispatch(chatActions.setActiveChat(chatId));
      
      // Navigate to chat room
      navigate(`/chat/${chatId}`);
      
      // Track analytics
      if (window.analytics) {
        window.analytics.track('Chat Selected', {
          chatId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      setError('Failed to open chat. Please try again.');
    }
  }, [navigate, dispatch]);

  /**
   * Initializes WebSocket connection on mount
   */
  useEffect(() => {
    connect().catch((err) => {
      setError('Failed to establish connection. Retrying...');
    });

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  /**
   * Retry failed messages when connection is restored
   */
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      retryFailedMessages();
    }
  }, [connectionState, retryFailedMessages]);

  // Loading state
  if (loading) {
    return (
      <LoadingContainer>
        <CircularProgress size={40} thickness={4} />
      </LoadingContainer>
    );
  }

  return (
    <StyledContainer maxWidth="lg">
      {/* Offline indicator */}
      {connectionState !== ConnectionState.CONNECTED && (
        <OfflineIndicator 
          severity="warning"
          variant="filled"
        >
          {connectionState === ConnectionState.RECONNECTING 
            ? 'Reconnecting...' 
            : 'You are offline. Some features may be limited.'}
        </OfflineIndicator>
      )}

      {/* Chat list */}
      <ChatList
        chats={sortedChats}
        onChatSelect={handleChatSelect}
        selectedChatId={selectedChatId}
        isOffline={connectionState !== ConnectionState.CONNECTED}
        typingUsers={typingUsers}
      />

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        message={error}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {connectionState !== ConnectionState.CONNECTED && (
              <button onClick={connect}>
                Retry Connection
              </button>
            )}
            <button onClick={() => setError(null)}>
              Dismiss
            </button>
          </Box>
        }
      />
    </StyledContainer>
  );
};

export default ChatListScreen;