import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import { Paper, Typography } from '@mui/material'; // v5.14+
import { Agent, AgentStatus } from '../../types/agent';
import Avatar from '../common/Avatar';
import Loading from '../common/Loading';
import { fadeIn, scaleIn, REDUCED_MOTION_QUERY } from '../../styles/animations';

/**
 * Props interface for AgentResponse component
 */
interface AgentResponseProps {
  /** AI agent data including id, name, type, status, and avatar */
  agent: Agent;
  /** Response message content to be displayed */
  content: string;
  /** Loading state indicator for response generation */
  isLoading?: boolean;
  /** Error message if response generation failed */
  error?: string | null;
  /** Response timestamp for display and sorting */
  timestamp: Date;
  /** Callback function to retry failed responses */
  retry?: () => void;
  /** Optional CSS class for custom styling */
  className?: string;
}

/**
 * Styled container for the agent response following Material Design 3
 */
const StyledResponseContainer = styled(Paper)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  padding: theme.spacing(2),
  marginBottom: theme.spacing(1),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  transition: theme.transitions.create(['box-shadow', 'background-color']),
  position: 'relative',
  overflow: 'hidden',
  animation: `${scaleIn.keyframes} ${scaleIn.options.duration}ms ${scaleIn.options.easing}`,
  
  [REDUCED_MOTION_QUERY]: {
    animation: 'none',
  },

  '&:hover': {
    boxShadow: theme.shadows[2],
  },
}));

/**
 * Styled content wrapper for proper layout and spacing
 */
const ContentWrapper = styled('div')(({ theme }) => ({
  flex: 1,
  marginLeft: theme.spacing(2),
  animation: `${fadeIn.keyframes} ${fadeIn.options.duration}ms ${fadeIn.options.easing}`,
  
  [REDUCED_MOTION_QUERY]: {
    animation: 'none',
  },
}));

/**
 * Styled error message container with proper error state styling
 */
const ErrorContainer = styled('div')(({ theme }) => ({
  color: theme.palette.error.main,
  marginTop: theme.spacing(1),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
}));

/**
 * Styled retry button with proper interaction states
 */
const RetryButton = styled('button')(({ theme }) => ({
  background: 'none',
  border: `1px solid ${theme.palette.error.main}`,
  color: theme.palette.error.main,
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius,
  cursor: 'pointer',
  fontSize: theme.typography.button.fontSize,
  transition: theme.transitions.create(['background-color', 'color']),
  
  '&:hover': {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },

  '&:focus-visible': {
    outline: `2px solid ${theme.palette.error.main}`,
    outlineOffset: 2,
  },
}));

/**
 * Styled timestamp with proper typography
 */
const Timestamp = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
  fontSize: theme.typography.caption.fontSize,
  marginTop: theme.spacing(1),
}));

/**
 * Get status color based on agent status
 */
const getStatusColor = (status: AgentStatus, theme: any) => {
  switch (status) {
    case AgentStatus.ACTIVE:
      return theme.palette.success.main;
    case AgentStatus.RESPONDING:
      return theme.palette.info.main;
    case AgentStatus.ERROR:
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
};

/**
 * AgentResponse component that renders AI agent responses with proper styling and states
 */
const AgentResponse: React.FC<AgentResponseProps> = React.memo(({
  agent,
  content,
  isLoading = false,
  error = null,
  timestamp,
  retry,
  className,
}) => {
  // Format timestamp for display
  const formattedTime = React.useMemo(() => {
    return new Intl.DateTimeFormat('default', {
      hour: 'numeric',
      minute: 'numeric',
    }).format(timestamp);
  }, [timestamp]);

  return (
    <StyledResponseContainer 
      className={className}
      elevation={1}
      role="article"
      aria-label={`Response from ${agent.name}`}
    >
      <Avatar
        user={{ 
          username: agent.name,
          avatarUrl: agent.avatar,
        }}
        size="medium"
        loading={isLoading}
        alt={`${agent.name} avatar`}
      />

      <ContentWrapper>
        <Typography
          variant="subtitle2"
          component="div"
          sx={{ color: (theme) => getStatusColor(agent.status, theme) }}
        >
          {agent.name}
        </Typography>

        {isLoading ? (
          <Loading 
            size="small"
            color="inherit"
            message="Generating response..."
          />
        ) : error ? (
          <ErrorContainer role="alert">
            <Typography variant="body2">{error}</Typography>
            {retry && (
              <RetryButton
                onClick={retry}
                aria-label="Retry generating response"
              >
                Retry
              </RetryButton>
            )}
          </ErrorContainer>
        ) : (
          <Typography
            variant="body1"
            component="p"
            sx={{ whiteSpace: 'pre-wrap' }}
          >
            {content}
          </Typography>
        )}

        <Timestamp variant="caption">
          {formattedTime}
        </Timestamp>
      </ContentWrapper>
    </StyledResponseContainer>
  );
});

AgentResponse.displayName = 'AgentResponse';

export default AgentResponse;