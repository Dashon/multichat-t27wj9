/**
 * @fileoverview AgentList component for displaying and managing AI agents
 * Implements Material Design 3 principles and WCAG accessibility requirements
 * @version 1.0.0
 */

import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import { List, ListItem, Typography, Skeleton, Alert } from '@mui/material'; // v5.14+
import { useTheme } from '@mui/material/styles'; // v5.14+
import { Agent, AgentStatus } from '../../types/agent';
import AgentBubble from './AgentBubble';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for AgentList component with enhanced accessibility support
 */
interface AgentListProps {
  /** Array of available agents */
  agents: Agent[];
  /** Callback for agent selection */
  onAgentSelect: (agent: Agent) => void;
  /** Currently selected agent ID */
  selectedAgentId?: string | null;
  /** Optional CSS class name */
  className?: string;
  /** Loading state indicator */
  loading?: boolean;
  /** Error state message */
  error?: string | null;
}

/**
 * Styled List component with enhanced accessibility and Material Design 3 principles
 */
const StyledList = styled(List)(({ theme }) => ({
  padding: theme.spacing(1),
  maxHeight: '400px',
  overflow: 'auto',
  scrollBehavior: 'smooth',
  position: 'relative',
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    background: theme.palette.action.hover,
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb': {
    background: theme.palette.action.active,
    borderRadius: '4px',
    '&:hover': {
      background: theme.palette.action.selected,
    },
  },
}));

/**
 * Styled ListItem component with enhanced interaction states
 */
const StyledListItem = styled(ListItem, {
  shouldForwardProp: (prop) => !['selected', 'disabled'].includes(prop as string),
})<{ selected?: boolean; disabled?: boolean }>(({ theme, selected, disabled }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1, 2),
  cursor: disabled ? 'not-allowed' : 'pointer',
  borderRadius: theme.shape.borderRadius,
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: theme.transitions.duration.shorter,
  }),
  opacity: disabled ? 0.6 : 1,
  backgroundColor: selected ? theme.palette.action.selected : 'transparent',
  '&:hover': {
    backgroundColor: !disabled && theme.palette.action.hover,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px',
  },
}));

/**
 * AgentInfo styled component for agent details
 */
const AgentInfo = styled('div')(({ theme }) => ({
  marginLeft: theme.spacing(2),
  flex: 1,
}));

/**
 * Loading skeleton component for agent list items
 */
const AgentSkeleton: React.FC = () => (
  <StyledListItem>
    <Skeleton variant="circular" width={40} height={40} />
    <AgentInfo>
      <Skeleton variant="text" width="60%" height={24} />
      <Skeleton variant="text" width="40%" height={20} />
    </AgentInfo>
  </StyledListItem>
);

/**
 * AgentList component for displaying and managing AI agents
 */
export const AgentList: React.FC<AgentListProps> = React.memo(({
  agents,
  onAgentSelect,
  selectedAgentId,
  className,
  loading = false,
  error = null,
}) => {
  const theme = useTheme();

  /**
   * Filters and sorts agents based on availability and status
   */
  const sortedAgents = React.useMemo(() => {
    return [...agents].sort((a, b) => {
      // Prioritize active agents
      if (a.status === AgentStatus.ACTIVE && b.status !== AgentStatus.ACTIVE) return -1;
      if (b.status === AgentStatus.ACTIVE && a.status !== AgentStatus.ACTIVE) return 1;
      
      // Then available agents
      if (a.status === AgentStatus.AVAILABLE && b.status !== AgentStatus.AVAILABLE) return -1;
      if (b.status === AgentStatus.AVAILABLE && a.status !== AgentStatus.AVAILABLE) return 1;
      
      // Sort by name for equal status
      return a.name.localeCompare(b.name);
    });
  }, [agents]);

  /**
   * Handles agent selection with keyboard support
   */
  const handleAgentClick = React.useCallback((
    agent: Agent,
    event: React.MouseEvent | React.KeyboardEvent
  ) => {
    if (agent.status === AgentStatus.UNAVAILABLE || agent.status === AgentStatus.ERROR) {
      return;
    }

    if (event.type === 'keydown') {
      const keyEvent = event as React.KeyboardEvent;
      if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') {
        return;
      }
      event.preventDefault();
    }

    onAgentSelect(agent);
  }, [onAgentSelect]);

  if (error) {
    return (
      <Alert 
        severity="error" 
        sx={{ margin: theme.spacing(2) }}
        role="alert"
      >
        {error}
      </Alert>
    );
  }

  return (
    <StyledList
      className={className}
      aria-label="AI Agents List"
      role="listbox"
      aria-busy={loading}
    >
      {loading ? (
        Array.from({ length: 3 }).map((_, index) => (
          <AgentSkeleton key={`skeleton-${index}`} />
        ))
      ) : (
        sortedAgents.map((agent) => {
          const isSelected = agent.id === selectedAgentId;
          const isDisabled = agent.status === AgentStatus.UNAVAILABLE || 
                           agent.status === AgentStatus.ERROR;

          return (
            <StyledListItem
              key={agent.id}
              selected={isSelected}
              disabled={isDisabled}
              onClick={(e) => handleAgentClick(agent, e)}
              onKeyDown={(e) => handleAgentClick(agent, e)}
              role="option"
              aria-selected={isSelected}
              tabIndex={isDisabled ? -1 : 0}
              aria-disabled={isDisabled}
            >
              <AgentBubble
                agent={agent}
                size="medium"
                showStatus
              />
              <AgentInfo>
                <Typography variant="subtitle1" component="div">
                  {agent.name}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ marginTop: SPACING.xxs }}
                >
                  {agent.primaryExpertise}
                </Typography>
              </AgentInfo>
            </StyledListItem>
          );
        })
      )}
    </StyledList>
  );
});

AgentList.displayName = 'AgentList';

export default AgentList;