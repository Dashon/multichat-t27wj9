import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import { Paper, Typography, Tooltip } from '@mui/material'; // v5.14+
import { Message, MessageType, MessageStatus, MessageFormatting } from '../../types/message';
import Avatar from '../common/Avatar';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for the ChatBubble component
 */
interface ChatBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  className?: string;
  onThreadClick?: (threadId: string) => void;
  onAIContextClick?: (context: Record<string, any>) => void;
}

/**
 * Styled wrapper for message bubble with enhanced Material Design 3 elevation
 */
const StyledBubble = styled(Paper, {
  shouldForwardProp: (prop) => !['isOwnMessage', 'isAIMessage'].includes(prop as string),
})<{ isOwnMessage: boolean; isAIMessage: boolean }>(({ theme, isOwnMessage, isAIMessage }) => ({
  display: 'flex',
  flexDirection: isOwnMessage ? 'row-reverse' : 'row',
  alignItems: 'flex-start',
  gap: theme.spacing(1),
  maxWidth: '70%',
  marginLeft: isOwnMessage ? 'auto' : theme.spacing(1),
  marginRight: isOwnMessage ? theme.spacing(1) : 'auto',
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: isAIMessage 
    ? theme.palette.primary.light 
    : isOwnMessage 
      ? theme.palette.primary.main 
      : theme.palette.background.paper,
  color: isOwnMessage ? theme.palette.primary.contrastText : theme.palette.text.primary,
  transition: theme.transitions.create(['background-color', 'box-shadow']),
  boxShadow: theme.shadows[1],
  
  '&:hover': {
    boxShadow: theme.shadows[2],
  },

  ...(isAIMessage && {
    borderLeft: `4px solid ${theme.palette.primary.main}`,
  }),
}));

/**
 * Styled container for message content and metadata
 */
const MessageContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.5),
  width: '100%',
  overflow: 'hidden',
}));

/**
 * Styled container for message metadata
 */
const MetadataContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  fontSize: theme.typography.caption.fontSize,
  color: theme.palette.text.secondary,
}));

/**
 * Returns the appropriate status icon based on message status
 */
const getMessageStatusIcon = (status: MessageStatus): React.ReactNode => {
  switch (status) {
    case MessageStatus.SENDING:
      return (
        <Tooltip title="Sending">
          <span className="material-icons-outlined animate-pulse">schedule</span>
        </Tooltip>
      );
    case MessageStatus.DELIVERED:
      return (
        <Tooltip title="Delivered">
          <span className="material-icons-outlined">check</span>
        </Tooltip>
      );
    case MessageStatus.READ:
      return (
        <Tooltip title="Read">
          <span className="material-icons-outlined text-primary">done_all</span>
        </Tooltip>
      );
    case MessageStatus.FAILED:
      return (
        <Tooltip title="Failed to send">
          <span className="material-icons-outlined text-error">error_outline</span>
        </Tooltip>
      );
    default:
      return null;
  }
};

/**
 * Formats message content with support for AI context highlighting
 */
const formatMessageContent = (
  content: string,
  formatting: MessageFormatting,
  aiContext?: Record<string, any>
): React.ReactNode => {
  let formattedContent = content;

  // Apply text formatting
  if (formatting.bold) {
    formattedContent = `<strong>${formattedContent}</strong>`;
  }
  if (formatting.italic) {
    formattedContent = `<em>${formattedContent}</em>`;
  }

  // Process AI context markers
  if (aiContext) {
    Object.keys(aiContext).forEach(key => {
      const marker = `@${key}`;
      formattedContent = formattedContent.replace(
        marker,
        `<span class="ai-context" data-context="${key}">${marker}</span>`
      );
    });
  }

  return (
    <Typography
      variant="body1"
      component="div"
      dangerouslySetInnerHTML={{ __html: formattedContent }}
      sx={{ wordBreak: 'break-word' }}
    />
  );
};

/**
 * ChatBubble component for displaying messages with AI integration
 */
export const ChatBubble: React.FC<ChatBubbleProps> = React.memo(({
  message,
  isOwnMessage,
  className,
  onThreadClick,
  onAIContextClick,
}) => {
  const isAIMessage = message.metadata.type === MessageType.AI_RESPONSE;
  const hasThread = Boolean(message.threadId);
  
  const handleThreadClick = () => {
    if (hasThread && onThreadClick) {
      onThreadClick(message.threadId!);
    }
  };

  const handleAIContextClick = (event: React.MouseEvent) => {
    const contextElement = (event.target as HTMLElement).closest('.ai-context');
    if (contextElement && onAIContextClick) {
      const context = message.metadata.aiContext[
        contextElement.getAttribute('data-context') || ''
      ];
      if (context) {
        onAIContextClick(context);
      }
    }
  };

  return (
    <StyledBubble
      isOwnMessage={isOwnMessage}
      isAIMessage={isAIMessage}
      className={className}
      elevation={1}
      onClick={handleAIContextClick}
    >
      {!isOwnMessage && (
        <Avatar
          size="small"
          user={message.senderId}
          isAIAgent={isAIMessage}
        />
      )}
      
      <MessageContainer>
        {formatMessageContent(
          message.content,
          message.metadata.formatting,
          message.metadata.aiContext
        )}
        
        <MetadataContainer>
          <Typography variant="caption" component="span">
            {new Date(message.timestamp).toLocaleTimeString()}
          </Typography>
          
          {isOwnMessage && getMessageStatusIcon(message.metadata.status)}
          
          {hasThread && (
            <Tooltip title="View thread">
              <span
                className="material-icons-outlined cursor-pointer"
                onClick={handleThreadClick}
              >
                forum
              </span>
            </Tooltip>
          )}
        </MetadataContainer>
      </MessageContainer>
    </StyledBubble>
  );
});

ChatBubble.displayName = 'ChatBubble';

export default ChatBubble;