/**
 * @fileoverview Enhanced chat input component with AI agent integration, emoji support,
 * and real-time message delivery tracking. Implements Material Design 3 principles.
 * @version 1.0.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'; // v18.2.0
import { styled, useTheme } from '@mui/material/styles'; // v5.14.0
import { IconButton, Tooltip, CircularProgress } from '@mui/material'; // v5.14.0
import EmojiPicker from 'emoji-picker-react'; // v4.4.0
import SendIcon from '@mui/icons-material/Send';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import MentionIcon from '@mui/icons-material/AlternateEmail';

// Internal imports
import Input from '../common/Input';
import { useMessage } from '../../hooks/useMessage';
import { MessageType, MessageMetadata, AIContext } from '../../types/message';

// Styled components with Material Design 3 principles
const ChatInputContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1, 2),
  borderTop: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  transition: 'background-color 0.3s ease',
  position: 'relative',
  minHeight: '64px', // WCAG touch target size
}));

const InputWrapper = styled('div')(({ theme }) => ({
  flex: 1,
  marginRight: theme.spacing(1),
  position: 'relative',
}));

const ActionButtons = styled('div')(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(0.5),
  alignItems: 'center',
}));

const EmojiPickerContainer = styled('div')(({ theme }) => ({
  position: 'absolute',
  bottom: '100%',
  right: 0,
  zIndex: theme.zIndex.modal,
  boxShadow: theme.shadows[8],
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
}));

const MentionSuggestions = styled('div')(({ theme }) => ({
  position: 'absolute',
  bottom: '100%',
  left: 0,
  width: '100%',
  maxHeight: '200px',
  overflowY: 'auto',
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[4],
  borderRadius: theme.shape.borderRadius,
  zIndex: theme.zIndex.modal + 1,
}));

// Props interface
interface ChatInputProps {
  chatId: string;
  threadId?: string;
  placeholder?: string;
  disabled?: boolean;
  onMessageSent?: (message: Message) => void;
  maxLength?: number;
  mentionableAgents: AIAgent[];
  className?: string;
}

/**
 * Enhanced chat input component with AI integration and real-time delivery
 */
const ChatInput: React.FC<ChatInputProps> = ({
  chatId,
  threadId,
  placeholder = 'Type a message...',
  disabled = false,
  onMessageSent,
  maxLength = 5000,
  mentionableAgents,
  className,
}) => {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [filteredAgents, setFilteredAgents] = useState(mentionableAgents);
  const inputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, messageStatus } = useMessage();

  // Handle message submission with optimistic updates
  const handleMessageSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    if (!inputValue.trim() || disabled) return;

    // Extract AI mentions
    const mentions = inputValue.match(/@[\w-]+/g) || [];
    const aiContext: AIContext = {
      mentions: mentions.map(m => m.substring(1)),
      threadContext: threadId ? true : false,
    };

    // Create message metadata
    const metadata: MessageMetadata = {
      type: mentions.length > 0 ? MessageType.AI_RESPONSE : MessageType.TEXT,
      formatting: {
        bold: false,
        italic: false,
        color: theme.palette.text.primary,
        emoji: [],
      },
      mentions: mentions,
      aiContext,
    };

    try {
      // Send message with optimistic update
      await sendMessage({
        content: inputValue,
        chatId,
        threadId,
        metadata,
      });

      setInputValue('');
      onMessageSent?.({
        content: inputValue,
        chatId,
        threadId,
        metadata,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [inputValue, chatId, threadId, disabled, sendMessage, onMessageSent, theme]);

  // Handle AI agent mention suggestions
  const handleMentionTrigger = useCallback((value: string) => {
    const mentionMatch = value.match(/@([\w-]*)$/);
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);
      setFilteredAgents(
        mentionableAgents.filter(agent =>
          agent.name.toLowerCase().includes(query)
        )
      );
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }, [mentionableAgents]);

  // Handle input changes with mention detection
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    handleMentionTrigger(value);
  }, [handleMentionTrigger]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback(({ emoji }: { emoji: string }) => {
    setInputValue(prev => prev + emoji);
    setShowEmojiPicker(false);
  }, []);

  // Handle agent mention selection
  const handleAgentSelect = useCallback((agentName: string) => {
    const beforeMention = inputValue.substring(0, inputValue.lastIndexOf('@'));
    setInputValue(`${beforeMention}@${agentName} `);
    setShowMentions(false);
    inputRef.current?.focus();
  }, [inputValue]);

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!event.target) return;
      
      const target = event.target as HTMLElement;
      if (!target.closest('.emoji-picker') && !target.closest('.mention-trigger')) {
        setShowEmojiPicker(false);
        setShowMentions(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <ChatInputContainer className={className}>
      <InputWrapper>
        <Input
          name="message"
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          inputRef={inputRef}
          onKeyPress={(e) => e.key === 'Enter' && handleMessageSubmit(e)}
          startAdornment={
            <IconButton
              className="mention-trigger"
              onClick={() => setShowMentions(true)}
              size="small"
              disabled={disabled}
            >
              <MentionIcon />
            </IconButton>
          }
        />
        
        {showMentions && (
          <MentionSuggestions>
            {filteredAgents.map(agent => (
              <div
                key={agent.name}
                onClick={() => handleAgentSelect(agent.name)}
                style={{ padding: theme.spacing(1), cursor: 'pointer' }}
              >
                @{agent.name}
              </div>
            ))}
          </MentionSuggestions>
        )}
      </InputWrapper>

      <ActionButtons>
        <Tooltip title="Add emoji">
          <IconButton
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={disabled}
            size="medium"
          >
            <EmojiEmotionsIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Send message">
          <IconButton
            onClick={handleMessageSubmit}
            disabled={disabled || !inputValue.trim()}
            color="primary"
            size="medium"
          >
            {messageStatus === 'sending' ? (
              <CircularProgress size={24} />
            ) : (
              <SendIcon />
            )}
          </IconButton>
        </Tooltip>
      </ActionButtons>

      {showEmojiPicker && (
        <EmojiPickerContainer className="emoji-picker">
          <EmojiPicker onEmojiClick={handleEmojiSelect} />
        </EmojiPickerContainer>
      )}
    </ChatInputContainer>
  );
};

export default ChatInput;