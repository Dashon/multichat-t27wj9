import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { styled } from '@mui/material/styles';
import { Box, CircularProgress, Alert } from '@mui/material';
import { AutoSizer, List, CellMeasurer, CellMeasurerCache } from 'react-virtualized';

// Internal imports
import { Message, MessageType, MessageStatus } from '../../types/message';
import ChatBubble from './ChatBubble';
import { useMessage } from '../../hooks/useMessage';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getWebSocketConfig } from '../../config/websocket.config';

// Styled components with Material Design 3
const ThreadContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  transition: theme.transitions.create(['box-shadow']),
  '&:hover': {
    boxShadow: theme.shadows[2],
  },
}));

const MessageListContainer = styled(Box)({
  flexGrow: 1,
  overflow: 'hidden',
});

const DateSeparator = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  padding: theme.spacing(1),
  color: theme.palette.text.secondary,
  fontSize: '0.875rem',
  fontWeight: 'medium',
  position: 'sticky',
  top: 0,
  backgroundColor: theme.palette.background.paper,
  zIndex: 1,
}));

// Props interface
interface MessageThreadProps {
  threadId: string;
  chatId: string;
  currentUserId: string;
  className?: string;
  onMessageRetry?: (messageId: string) => void;
  onAIResponse?: (response: Message) => void;
}

// Cache for virtualized list measurements
const cache = new CellMeasurerCache({
  fixedWidth: true,
  defaultHeight: 100,
});

export const MessageThread: React.FC<MessageThreadProps> = ({
  threadId,
  chatId,
  currentUserId,
  className,
  onMessageRetry,
  onAIResponse,
}) => {
  // Hooks
  const { messages, sendMessage, retryMessage, loading, error } = useMessage(chatId);
  const listRef = useRef<List | null>(null);
  const scrollPositionRef = useRef(0);

  // WebSocket connection
  const wsConfig = getWebSocketConfig();
  const { connectionState, sendMessage: wsSendMessage } = useWebSocket(
    wsConfig,
    (message) => {
      if (message.metadata.type === MessageType.AI_RESPONSE) {
        onAIResponse?.(message);
      }
    }
  );

  // Group messages by date for separators
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, Message[]>();
    
    messages.forEach(message => {
      const date = new Date(message.timestamp).toLocaleDateString();
      const group = groups.get(date) || [];
      group.push(message);
      groups.set(date, group);
    });

    return groups;
  }, [messages]);

  // Handle message retry
  const handleRetry = useCallback((messageId: string) => {
    retryMessage(messageId);
    onMessageRetry?.(messageId);
  }, [retryMessage, onMessageRetry]);

  // Render individual message with virtualization
  const renderMessage = ({
    index,
    key,
    style,
    parent,
  }: {
    index: number;
    key: string;
    style: React.CSSProperties;
    parent: any;
  }) => {
    const message = messages[index];
    const isOwnMessage = message.senderId === currentUserId;
    const showDateSeparator = index === 0 || 
      new Date(messages[index - 1].timestamp).toLocaleDateString() !==
      new Date(message.timestamp).toLocaleDateString();

    return (
      <CellMeasurer
        cache={cache}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <div style={style}>
          {showDateSeparator && (
            <DateSeparator>
              {new Date(message.timestamp).toLocaleDateString()}
            </DateSeparator>
          )}
          <ChatBubble
            message={message}
            isOwnMessage={isOwnMessage}
            onThreadClick={threadId ? undefined : () => {}}
            onAIContextClick={onAIResponse}
          />
        </div>
      </CellMeasurer>
    );
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      const lastMessageIndex = messages.length - 1;
      listRef.current.scrollToRow(lastMessageIndex);
    }
  }, [messages.length]);

  // Clear cache on unmount
  useEffect(() => {
    return () => {
      cache.clearAll();
    };
  }, []);

  return (
    <ThreadContainer className={className}>
      {loading && (
        <Box display="flex" justifyContent="center" p={2}>
          <CircularProgress size={24} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error.message}
        </Alert>
      )}

      <MessageListContainer>
        <AutoSizer>
          {({ width, height }) => (
            <List
              ref={listRef}
              width={width}
              height={height}
              rowCount={messages.length}
              rowHeight={cache.rowHeight}
              deferredMeasurementCache={cache}
              rowRenderer={renderMessage}
              overscanRowCount={5}
              onScroll={({ scrollTop }) => {
                scrollPositionRef.current = scrollTop;
              }}
            />
          )}
        </AutoSizer>
      </MessageListContainer>
    </ThreadContainer>
  );
};

export default React.memo(MessageThread);