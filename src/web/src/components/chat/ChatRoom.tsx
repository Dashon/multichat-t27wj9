/**
 * @fileoverview Enhanced chat room component implementing real-time messaging,
 * AI agent interactions, and group chat features following Material Design 3 principles.
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { styled, useTheme } from '@mui/material/styles';
import { Box, CircularProgress, Alert } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMetrics } from '@datadog/browser-rum';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import ChatHeader from './ChatHeader';
import MessageThread from './MessageThread';
import ChatInput from './ChatInput';
import { useChat } from '../../hooks/useChat';
import { Message, MessageStatus } from '../../types/message';

// Styled components with Material Design 3 principles
const ChatRoomContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.palette.background.default,
  position: 'relative',
  outline: 'none',
  role: 'region',
  'aria-label': 'Chat Room',
  transition: theme.transitions.create(['background-color']),
}));

const MessageContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  position: 'relative',
  scrollBehavior: theme.transitions.create('scroll-behavior'),
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.divider,
    borderRadius: theme.shape.borderRadius,
  },
}));

const LoadingOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  zIndex: theme.zIndex.modal,
  role: 'progressbar',
  'aria-label': 'Loading chat messages',
}));

// Props interface
interface ChatRoomProps {
  chatId: string;
  onBackClick: () => void;
  className?: string;
}

/**
 * Enhanced chat room component with real-time messaging and AI integration
 */
const ChatRoom: React.FC<ChatRoomProps> = ({
  chatId,
  onBackClick,
  className,
}) => {
  const theme = useTheme();
  const metrics = useMetrics();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Initialize chat hook with real-time features
  const {
    chat,
    loading,
    error,
    connectionStatus,
    deliveryStatus,
    typingUsers,
    sendMessage,
    setTypingStatus,
    retryFailedMessages,
  } = useChat(chatId, {
    autoConnect: true,
    enableOfflineSupport: true,
    enableTypingIndicators: true,
  });

  // Initialize virtualizer for message list
  const rowVirtualizer = useVirtualizer({
    count: chat?.messages.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  /**
   * Handles message sending with delivery tracking
   */
  const handleMessageSent = useCallback(async (message: Message) => {
    try {
      const startTime = performance.now();
      await sendMessage(message.content, message.metadata);
      
      // Track message delivery metrics
      const deliveryTime = performance.now() - startTime;
      metrics.track('message_delivery', {
        deliveryTime,
        status: deliveryStatus[message.id],
      });

    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [sendMessage, deliveryStatus, metrics]);

  /**
   * Handles scroll behavior and loading more messages
   */
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const bottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
    setIsAtBottom(bottom);
  }, []);

  /**
   * Scrolls to bottom of message list
   */
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current && isAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isAtBottom]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages.length, scrollToBottom]);

  // Handle errors with proper user feedback
  const handleError = useCallback((error: Error) => {
    console.error('Chat room error:', error);
    metrics.track('chat_error', {
      error: error.message,
      chatId,
    });
  }, [chatId, metrics]);

  if (!chat) {
    return (
      <LoadingOverlay>
        <CircularProgress size={40} />
      </LoadingOverlay>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <Alert severity="error" sx={{ m: 2 }}>
          {error.message}
        </Alert>
      )}
      onError={handleError}
    >
      <ChatRoomContainer className={className}>
        <ChatHeader
          chat={chat}
          onBackClick={onBackClick}
          onSettingsClick={() => {}}
        />

        <MessageContainer
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
        >
          <MessageThread
            threadId={chat.id}
            chatId={chatId}
            currentUserId="currentUser" // Should come from auth context
            onMessageRetry={retryFailedMessages}
          />
        </MessageContainer>

        <ChatInput
          chatId={chatId}
          placeholder="Type a message..."
          disabled={connectionStatus !== 'CONNECTED'}
          onMessageSent={handleMessageSent}
          maxLength={5000}
          mentionableAgents={[
            { id: 'foodie', name: 'foodie', type: 'AI' },
            { id: 'explorer', name: 'explorer', type: 'AI' },
            { id: 'planner', name: 'planner', type: 'AI' },
          ]}
        />

        {loading && (
          <LoadingOverlay>
            <CircularProgress size={24} />
          </LoadingOverlay>
        )}

        {error && (
          <Alert 
            severity="error" 
            sx={{ 
              position: 'absolute', 
              bottom: theme.spacing(2), 
              left: theme.spacing(2), 
              right: theme.spacing(2) 
            }}
          >
            {error}
          </Alert>
        )}
      </ChatRoomContainer>
    </ErrorBoundary>
  );
};

export default React.memo(ChatRoom);