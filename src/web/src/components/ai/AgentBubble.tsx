/**
 * @fileoverview AgentBubble component for displaying AI agent avatars with status indicators
 * Implements Material Design 3 principles and WCAG accessibility requirements
 * @version 1.0.0
 */

import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import { Badge } from '@mui/material'; // v5.14+
import { Agent, AgentStatus } from '../../types/agent';
import Avatar from '../common/Avatar';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for AgentBubble component
 */
interface AgentBubbleProps {
  /** Agent object containing profile and status information */
  agent: Agent;
  /** Size variant following Material Design 3 scale */
  size?: 'small' | 'medium' | 'large';
  /** Optional click handler for interactive bubbles */
  onClick?: (agent: Agent) => void;
  /** Optional CSS class name for styling overrides */
  className?: string;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
}

/**
 * Maps agent status to Material Design 3 color tokens with proper contrast ratios
 */
const getStatusColor = (status: AgentStatus): string => {
  switch (status) {
    case AgentStatus.ACTIVE:
      return '#2e7d32'; // success.main - WCAG AA compliant
    case AgentStatus.RESPONDING:
      return '#1976d2'; // primary.main - WCAG AA compliant
    case AgentStatus.AVAILABLE:
      return '#0288d1'; // info.main - WCAG AA compliant
    case AgentStatus.UNAVAILABLE:
      return '#757575'; // grey.600 - WCAG AA compliant
    case AgentStatus.ERROR:
      return '#d32f2f'; // error.main - WCAG AA compliant
    default:
      return '#757575'; // Fallback to grey
  }
};

/**
 * Styled Badge component with enhanced accessibility
 */
const StyledBadge = styled(Badge, {
  shouldForwardProp: (prop) => prop !== 'status',
})<{ status: AgentStatus }>(({ theme, status }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: getStatusColor(status),
    color: getStatusColor(status),
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    '&::after': {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      animation: status === AgentStatus.RESPONDING ? 'ripple 1.2s infinite ease-in-out' : 'none',
      border: '1px solid currentColor',
      content: '""',
    },
  },
  '@keyframes ripple': {
    '0%': {
      transform: 'scale(1)',
      opacity: 1,
    },
    '100%': {
      transform: 'scale(2)',
      opacity: 0,
    },
  },
}));

/**
 * Styled container with proper interaction states
 */
const StyledContainer = styled('div')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  borderRadius: '50%',
  transition: theme.transitions.create(['transform', 'box-shadow'], {
    duration: theme.transitions.duration.shorter,
  }),
  '&:hover': {
    transform: 'scale(1.05)',
  },
  '&:active': {
    transform: 'scale(0.95)',
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

/**
 * Maps size prop to avatar dimensions
 */
const getAvatarSize = (size: AgentBubbleProps['size']): number => {
  switch (size) {
    case 'small':
      return SPACING.sm; // 16px
    case 'large':
      return SPACING.lg; // 32px
    default:
      return SPACING.md; // 24px
  }
};

/**
 * AgentBubble component displaying an AI agent's avatar with status indicator
 */
export const AgentBubble: React.FC<AgentBubbleProps> = React.memo(({
  agent,
  size = 'medium',
  onClick,
  className,
  tabIndex = 0,
}) => {
  // Generate status description for accessibility
  const getStatusDescription = (status: AgentStatus): string => {
    switch (status) {
      case AgentStatus.ACTIVE:
        return 'Active and engaged in conversation';
      case AgentStatus.RESPONDING:
        return 'Currently generating a response';
      case AgentStatus.AVAILABLE:
        return 'Available for interaction';
      case AgentStatus.UNAVAILABLE:
        return 'Currently unavailable';
      case AgentStatus.ERROR:
        return 'Experiencing an error';
      default:
        return 'Status unknown';
    }
  };

  // Handle keyboard interaction
  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick(agent);
    }
  };

  return (
    <StyledContainer
      className={className}
      onClick={() => onClick?.(agent)}
      onKeyPress={handleKeyPress}
      tabIndex={onClick ? tabIndex : -1}
      role={onClick ? 'button' : 'presentation'}
      aria-label={`${agent.name} - ${getStatusDescription(agent.status)}`}
    >
      <StyledBadge
        overlap="circular"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        variant="dot"
        status={agent.status}
      >
        <Avatar
          size={size}
          user={{
            username: agent.name,
            avatarUrl: agent.avatar,
          }}
          alt={`${agent.name} AI agent`}
        />
      </StyledBadge>
    </StyledContainer>
  );
});

AgentBubble.displayName = 'AgentBubble';

export default AgentBubble;