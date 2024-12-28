/**
 * @fileoverview Chat header component implementing Material Design 3 principles
 * with enhanced accessibility and responsive design features
 * @version 1.0.0
 */

import React, { useMemo, useCallback } from 'react'; // v18.2+
import { styled, useTheme } from '@mui/material/styles'; // v5.14+
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  useMediaQuery,
  Tooltip,
  Fade,
} from '@mui/material'; // v5.14+

// Internal imports
import { IChat, ChatParticipant, ChatRole } from '../../types/chat';
import Icon from '../common/Icon';
import Avatar from '../common/Avatar';

/**
 * Props interface for ChatHeader component with enhanced accessibility
 */
interface ChatHeaderProps {
  /** Chat data including name, participants, and status */
  chat: IChat;
  /** Handler for back button click with keyboard support */
  onBackClick: () => void;
  /** Handler for settings button click with keyboard support */
  onSettingsClick: () => void;
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Optional elevation level for header shadow */
  elevation?: number;
}

/**
 * Styled components following Material Design 3 principles
 */
const StyledAppBar = styled(AppBar, {
  shouldForwardProp: (prop) => prop !== 'elevation',
})<{ elevation?: number }>(({ theme, elevation }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  boxShadow: elevation ? theme.shadows[elevation] : 'none',
  borderBottom: '1px solid',
  borderColor: theme.palette.divider,
  transition: theme.transitions.create(['box-shadow']),
}));

const StyledToolbar = styled(Toolbar)(({ theme }) => ({
  padding: theme.spacing(1, 2),
  minHeight: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1),
    minHeight: 56,
  },
}));

const ChatInfo = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  marginLeft: theme.spacing(2),
  flex: 1,
  minWidth: 0,
}));

const ParticipantAvatars = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  marginLeft: 'auto',
  gap: theme.spacing(1),
  transition: theme.transitions.create(['opacity']),
  [theme.breakpoints.down('sm')]: {
    display: 'none',
  },
}));

/**
 * Returns formatted participant count string with proper pluralization
 */
const getParticipantCount = (participants: ChatParticipant[]): string => {
  const count = participants.length;
  if (count === 0) return 'No participants';
  if (count === 1) return '1 participant';
  return `${count} participants`;
};

/**
 * ChatHeader component that renders the header section of a chat room
 * Implements Material Design 3 principles with enhanced accessibility
 */
const ChatHeader: React.FC<ChatHeaderProps> = ({
  chat,
  onBackClick,
  onSettingsClick,
  className,
  elevation = 1,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Memoized participant count
  const participantCount = useMemo(
    () => getParticipantCount(chat.participants),
    [chat.participants]
  );

  // Memoized active participants for avatar display
  const activeParticipants = useMemo(
    () => chat.participants.slice(0, isMobile ? 0 : 3),
    [chat.participants, isMobile]
  );

  // Keyboard handlers for accessibility
  const handleBackKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onBackClick();
      }
    },
    [onBackClick]
  );

  const handleSettingsKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSettingsClick();
      }
    },
    [onSettingsClick]
  );

  return (
    <StyledAppBar
      position="sticky"
      elevation={elevation}
      className={className}
      component="header"
      role="banner"
    >
      <StyledToolbar>
        <Tooltip title="Back to chat list" arrow TransitionComponent={Fade}>
          <IconButton
            onClick={onBackClick}
            onKeyPress={handleBackKeyPress}
            edge="start"
            aria-label="Back to chat list"
            size={isMobile ? 'small' : 'medium'}
          >
            <Icon name="arrow_back" ariaLabel="Back" />
          </IconButton>
        </Tooltip>

        <ChatInfo>
          <Typography
            variant="h6"
            component="h1"
            noWrap
            sx={{ fontWeight: 'medium' }}
          >
            {chat.name}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            aria-label={participantCount}
          >
            {participantCount}
          </Typography>
        </ChatInfo>

        <ParticipantAvatars aria-hidden="true">
          {activeParticipants.map((participant) => (
            <Avatar
              key={participant.userId}
              user={participant}
              size="small"
              alt={`${participant.userId}'s avatar`}
            />
          ))}
        </ParticipantAvatars>

        <Tooltip title="Chat settings" arrow TransitionComponent={Fade}>
          <IconButton
            onClick={onSettingsClick}
            onKeyPress={handleSettingsKeyPress}
            edge="end"
            aria-label="Chat settings"
            size={isMobile ? 'small' : 'medium'}
          >
            <Icon name="settings" ariaLabel="Settings" />
          </IconButton>
        </Tooltip>
      </StyledToolbar>
    </StyledAppBar>
  );
};

export default ChatHeader;