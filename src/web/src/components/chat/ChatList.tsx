import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { styled } from '@mui/material/styles';
import { List, ListItem, Typography, CircularProgress, Skeleton } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';

// Internal imports
import { IChat, ChatStatus } from '../../types/chat';
import { MessageStatus } from '../../types/message';
import { useChat } from '../../hooks/useChat';
import Card from '../common/Card';
import { SPACING } from '../../styles/dimensions';
import { useWebSocket } from '../../hooks/useWebSocket';

// Styled components
const StyledList = styled(List)(({ theme }) => ({
  width: '100%',
  maxHeight: 'calc(100vh - 200px)',
  overflowY: 'auto',
  scrollBehavior: 'smooth',
  padding: SPACING.sm,
  '@media (max-width: 768px)': {
    maxHeight: 'calc(100vh - 120px)',
    padding: SPACING.xs,
  },
}));

const StyledListItem = styled(ListItem)(({ theme }) => ({
  marginBottom: SPACING.xs,
  padding: 0,
  transition: 'all 0.2s ease-in-out',
}));

const StatusIndicator = styled('div')<{ status: MessageStatus }>(({ theme, status }) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginLeft: SPACING.xs,
  backgroundColor: status === MessageStatus.DELIVERED 
    ? theme.palette.success.main
    : status === MessageStatus.SENDING
    ? theme.palette.warning.main
    : theme.palette.error.main,
}));

const TypingIndicator = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  fontStyle: 'italic',
}));

// Props interface
interface ChatListProps {
  chats: IChat[];
  onChatSelect: (chatId: string) => void;
  selectedChatId: string | null;
  isOffline: boolean;
  typingUsers: Record<string, string[]>;
}

// Memoized chat list item component
const ChatListItem = memo<{
  chat: IChat;
  selected: boolean;
  onClick: () => void;
  typingUsers: string[];
}>(({ chat, selected, onClick, typingUsers }) => {
  const lastMessage = chat.messages[chat.messages.length - 1];
  const hasTypingUsers = typingUsers?.length > 0;

  return (
    <Card
      interactive
      elevation={selected ? 2 : 1}
      onClick={onClick}
      className={selected ? 'selected' : ''}
      role="button"
      aria-selected={selected}
    >
      <div style={{ padding: SPACING.sm }}>
        <Typography variant="subtitle1" component="h3" noWrap>
          {chat.name}
          {lastMessage?.metadata?.status && (
            <StatusIndicator status={lastMessage.metadata.status} />
          )}
        </Typography>
        
        {hasTypingUsers ? (
          <TypingIndicator>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </TypingIndicator>
        ) : (
          <Typography variant="body2" color="textSecondary" noWrap>
            {lastMessage?.content || 'No messages yet'}
          </Typography>
        )}
      </div>
    </Card>
  );
});

// Main ChatList component
export const ChatList: React.FC<ChatListProps> = memo(({
  chats,
  onChatSelect,
  selectedChatId,
  isOffline,
  typingUsers,
}) => {
  // Sort chats by last activity
  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const aTime = a.messages[a.messages.length - 1]?.timestamp || a.metadata.lastActivityAt;
      const bTime = b.messages[b.messages.length - 1]?.timestamp || b.metadata.lastActivityAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [chats]);

  // Virtual list setup for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sortedChats.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Estimated height of each chat item
    overscan: 5, // Number of items to render outside visible area
  });

  // WebSocket connection for real-time updates
  const { connectionState } = useWebSocket(
    {
      url: process.env.REACT_APP_WS_URL || 'wss://api.example.com',
      path: '/ws',
      reconnectInterval: 5000,
      maxReconnectAttempts: 5,
      pingInterval: 30000,
      connectionTimeout: 10000,
      messageQueueSize: 100,
      secure: true,
      protocols: ['v1.chat.protocol'],
      heartbeatEnabled: true,
      heartbeatInterval: 30000,
    },
    (message) => {
      // Handle real-time message updates
      console.log('Received message:', message);
    }
  );

  // Handle chat selection
  const handleChatSelect = useCallback((chatId: string) => {
    if (!isOffline) {
      onChatSelect(chatId);
    }
  }, [isOffline, onChatSelect]);

  if (!chats.length) {
    return (
      <Typography variant="body1" align="center" sx={{ p: 2 }}>
        No active chats
      </Typography>
    );
  }

  return (
    <StyledList ref={parentRef}>
      {isOffline && (
        <Typography 
          variant="caption" 
          color="error" 
          sx={{ p: 1, display: 'block', textAlign: 'center' }}
        >
          Offline Mode - Limited Functionality
        </Typography>
      )}
      
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const chat = sortedChats[virtualRow.index];
          return (
            <StyledListItem
              key={chat.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ChatListItem
                chat={chat}
                selected={chat.id === selectedChatId}
                onClick={() => handleChatSelect(chat.id)}
                typingUsers={typingUsers[chat.id] || []}
              />
            </StyledListItem>
          );
        })}
      </div>
    </StyledList>
  );
});

ChatList.displayName = 'ChatList';
ChatListItem.displayName = 'ChatListItem';

export default ChatList;