import React, { useEffect, useCallback, useState } from 'react'; // v18.2.0
import { LinearProgress, Typography, styled, useTheme } from '@mui/material'; // v5.14.0
import { useTranslation } from 'react-i18next'; // v13.0.0

import Card from '../common/Card';
import { IPoll, PollStatus, PollOption } from '../../types/poll';
import { usePoll } from '../../hooks/usePoll';

// Styled components following Material Design 3 principles
const ResultContainer = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
  minHeight: '200px',
  position: 'relative',
}));

const OptionContainer = styled('div')(({ theme }) => ({
  marginBottom: theme.spacing(1.5),
  padding: theme.spacing(1),
  minHeight: '48px',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px',
  },
  '&:hover': {
    backgroundColor: theme.palette.mode === 'light' 
      ? 'rgba(0, 0, 0, 0.04)' 
      : 'rgba(255, 255, 255, 0.08)',
  },
}));

const StyledProgress = styled(LinearProgress)(({ theme }) => ({
  height: 8,
  borderRadius: 4,
  transition: 'all 0.3s ease',
  backgroundColor: theme.palette.mode === 'light'
    ? theme.palette.grey[200]
    : theme.palette.grey[700],
}));

const VotersList = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(0.5),
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
  maxHeight: '100px',
  overflowY: 'auto',
  scrollBehavior: 'smooth',
}));

// Props interface
interface PollResultsProps {
  pollId: string;
  className?: string;
  showVoters?: boolean;
  onUpdate?: (totalVotes: number) => void;
  autoRefresh?: boolean;
}

// Helper functions
const calculatePercentage = (votes: number, totalVotes: number): number => {
  if (totalVotes === 0) return 0;
  return Math.round((votes / totalVotes) * 1000) / 10; // Round to 1 decimal place
};

const getTotalVotes = (options: PollOption[]): number => {
  return options.reduce((sum, option) => sum + option.votes, 0);
};

/**
 * PollResults component displays real-time poll results with accessibility features
 * and Material Design 3 styling
 */
export const PollResults: React.FC<PollResultsProps> = ({
  pollId,
  className,
  showVoters = false,
  onUpdate,
  autoRefresh = true,
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { getPollById, subscribeToUpdates } = usePoll();

  const [poll, setPoll] = useState<IPoll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial poll data
  useEffect(() => {
    const loadPoll = async () => {
      try {
        const pollData = getPollById(pollId);
        if (pollData) {
          setPoll(pollData);
          onUpdate?.(getTotalVotes(pollData.options));
        }
      } catch (err) {
        setError(t('errors.pollLoadFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    loadPoll();
  }, [pollId, getPollById, t, onUpdate]);

  // Set up real-time updates
  useEffect(() => {
    if (!autoRefresh) return;

    const unsubscribe = subscribeToUpdates(pollId, (updatedPoll) => {
      setPoll(updatedPoll);
      onUpdate?.(getTotalVotes(updatedPoll.options));
    });

    return () => {
      unsubscribe?.();
    };
  }, [pollId, autoRefresh, subscribeToUpdates, onUpdate]);

  // Render poll option with results
  const renderOption = useCallback((option: PollOption) => {
    const totalVotes = getTotalVotes(poll?.options || []);
    const percentage = calculatePercentage(option.votes, totalVotes);

    return (
      <OptionContainer
        key={option.id}
        role="listitem"
        tabIndex={0}
        aria-label={t('poll.optionWithResults', {
          option: option.text,
          votes: option.votes,
          percentage,
        })}
      >
        <Typography variant="body1" gutterBottom>
          {option.text}
        </Typography>
        <StyledProgress
          variant="determinate"
          value={percentage}
          aria-label={t('poll.progressLabel', { percentage })}
        />
        <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
          {t('poll.voteCount', { count: option.votes, percentage })}
        </Typography>
        {showVoters && option.voters.length > 0 && (
          <VotersList aria-label={t('poll.votersList')}>
            {option.voters.join(', ')}
          </VotersList>
        )}
      </OptionContainer>
    );
  }, [poll, t, showVoters]);

  // Render poll status
  const renderStatus = useCallback(() => {
    if (!poll) return null;

    const statusColor = poll.status === PollStatus.ACTIVE
      ? theme.palette.success.main
      : theme.palette.error.main;

    return (
      <Typography
        variant="caption"
        sx={{ color: statusColor }}
        aria-live="polite"
      >
        {t(`poll.status.${poll.status.toLowerCase()}`)}
      </Typography>
    );
  }, [poll, theme, t]);

  if (error) {
    return (
      <Card className={className}>
        <Typography color="error" role="alert">
          {error}
        </Typography>
      </Card>
    );
  }

  if (isLoading || !poll) {
    return (
      <Card className={className}>
        <LinearProgress aria-label={t('common.loading')} />
      </Card>
    );
  }

  const totalVotes = getTotalVotes(poll.options);

  return (
    <Card className={className}>
      <Typography variant="h6" gutterBottom>
        {poll.question}
      </Typography>
      {renderStatus()}
      <ResultContainer>
        <div role="list" aria-label={t('poll.resultsList')}>
          {poll.options.map(renderOption)}
        </div>
        <Typography variant="subtitle2" sx={{ mt: 2 }} aria-live="polite">
          {t('poll.totalVotes', { count: totalVotes })}
        </Typography>
      </ResultContainer>
    </Card>
  );
};

export default PollResults;