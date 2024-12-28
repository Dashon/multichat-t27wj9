/**
 * @fileoverview AgentPanel component for displaying and managing AI agents in the chat interface.
 * Implements Material Design 3 principles with full accessibility support and mobile responsiveness.
 * @version 1.0.0
 */

import React, { useCallback, useEffect } from 'react';
import { styled } from '@mui/material/styles'; // v5.14+
import { 
  Drawer,
  IconButton,
  Typography,
  Badge,
  CircularProgress,
  useMediaQuery,
  useTheme
} from '@mui/material'; // v5.14+
import { ChevronRight, ChevronLeft } from '@mui/icons-material'; // v5.14+

// Internal imports
import { Agent, AgentStatus } from '../../types/agent';
import AgentList from './AgentList';
import { useChat } from '../../hooks/useChat';
import { LAYOUT } from '../../styles/dimensions';

/**
 * Props interface for AgentPanel component with accessibility support
 */
interface AgentPanelProps {
  /** Array of available agents */
  agents: Agent[];
  /** Panel open state */
  isOpen: boolean;
  /** Panel close handler */
  onClose: () => void;
  /** Agent selection handler */
  onAgentSelect: (agent: Agent) => void;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Optional CSS class name */
  className?: string;
  /** Accessibility label */
  ariaLabel?: string;
}

/**
 * Styled drawer component with enhanced visuals and animations
 */
const StyledDrawer = styled(Drawer)(({ theme }) => ({
  width: LAYOUT.agentPanelWidth,
  flexShrink: 0,
  position: 'relative',
  '& .MuiDrawer-paper': {
    width: LAYOUT.agentPanelWidth,
    boxSizing: 'border-box',
    backgroundColor: theme.palette.background.paper,
    borderLeft: `1px solid ${theme.palette.divider}`,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },
}));

/**
 * Styled header component for the panel
 */
const PanelHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

/**
 * Styled content container with proper spacing
 */
const PanelContent = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
  height: '100%',
  overflow: 'auto',
}));

/**
 * AgentPanel component for displaying and managing AI agents
 */
export const AgentPanel: React.FC<AgentPanelProps> = ({
  agents,
  isOpen,
  onClose,
  onAgentSelect,
  loading = false,
  error = null,
  className,
  ariaLabel = 'AI Agents Panel'
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { mentionAgent } = useChat();

  /**
   * Handles agent selection with error handling and mobile optimization
   */
  const handleAgentSelect = useCallback((agent: Agent) => {
    if (agent.status === AgentStatus.UNAVAILABLE || agent.status === AgentStatus.ERROR) {
      return;
    }

    try {
      // Format @mention string
      const mention = `@${agent.name.toLowerCase()}`;
      mentionAgent(agent.id, mention);
      onAgentSelect(agent);

      // Close panel on mobile after selection
      if (isMobile) {
        onClose();
      }
    } catch (err) {
      console.error('Agent selection error:', err);
    }
  }, [mentionAgent, onAgentSelect, isMobile, onClose]);

  /**
   * Handles keyboard navigation for accessibility
   */
  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'Enter':
      case ' ':
        // Handle selection if focused on an agent
        break;
      default:
        break;
    }
  }, [onClose]);

  /**
   * Effect to handle mobile view adjustments
   */
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobile, isOpen]);

  return (
    <StyledDrawer
      variant={isMobile ? 'temporary' : 'persistent'}
      anchor="right"
      open={isOpen}
      onClose={onClose}
      className={className}
      aria-label={ariaLabel}
      onKeyDown={handleKeyboardNavigation}
      ModalProps={{
        keepMounted: true, // Better mobile performance
      }}
    >
      <PanelHeader>
        <Typography variant="h6" component="h2">
          AI Agents
        </Typography>
        <IconButton
          onClick={onClose}
          aria-label="Close agents panel"
          edge="end"
        >
          {theme.direction === 'rtl' ? <ChevronRight /> : <ChevronLeft />}
        </IconButton>
      </PanelHeader>

      <PanelContent>
        {loading ? (
          <CircularProgress
            size={24}
            aria-label="Loading agents"
            sx={{ display: 'block', margin: '20px auto' }}
          />
        ) : error ? (
          <Typography
            color="error"
            role="alert"
            sx={{ padding: theme.spacing(2) }}
          >
            {error.message}
          </Typography>
        ) : (
          <AgentList
            agents={agents}
            onAgentSelect={handleAgentSelect}
            loading={loading}
          />
        )}
      </PanelContent>
    </StyledDrawer>
  );
};

AgentPanel.displayName = 'AgentPanel';

export default React.memo(AgentPanel);