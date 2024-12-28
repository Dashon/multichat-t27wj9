/**
 * @fileoverview Poll list component implementing Material Design 3 principles
 * with virtualization, real-time updates, and comprehensive accessibility support.
 * @version 1.0.0
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { List, CircularProgress, Alert, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';

// Internal imports
import PollOption from './PollOption';
import { IPoll } from '../../types/poll';
import { usePoll } from '../../hooks/usePoll';

// Component props interface
interface PollListProps {
  chatId: string;
  className?: string;
  maxPolls?: number;
  showExpired?: boolean;
}

// Styled components
const ListContainer = styled(List)(({ theme }) => ({
  width: '100%',
  maxWidth: '600px',
  margin: '16px 0',
  padding: 0,
  position: 'relative',
  minHeight: '100px',
  '&:focus': {
    outline: 'none',
  }
}));

const PollContainer = styled('div')(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius * 1.5,
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  boxShadow: theme.shadows[1],
  transition: theme.transitions.create(['box-shadow', 'transform'], {
    duration: theme.transitions.duration.short
  }),
  '&:hover': {
    boxShadow: theme.shadows[2],
    transform: 'translateY(-1px)'
  },
  '&:focus-within': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px'
  }
}));

const Question = styled(Typography)(({ theme }) => ({
  fontSize: theme.typography.h6.fontSize,
  fontWeight: theme.typography.fontWeightMedium,
  marginBottom: theme.spacing(2),
  color: theme.palette.text.primary,
  userSelect: 'text'
}));

const EmptyState = styled(Typography)(({ theme }) => ({
  textAlign: 'center',
  padding: theme.spacing(3),
  color: theme.palette.text.secondary,
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  margin: theme.spacing(2, 0)
}));

/**
 * Poll list component with virtualization and real-time updates
 */
export const PollList: React.FC<PollListProps> = memo(({
  chatId,
  className,
  maxPolls = 50,
  showExpired = false
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const { getPollsByChatId, votePoll } = usePoll();

  // Fetch and sort polls
  const polls = useMemo(() => {
    const allPolls = getPollsByChatId(chatId);
    return allPolls
      .filter(poll => showExpired || !poll.expiresAt || new Date(poll.expiresAt) > new Date())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, maxPolls);
  }, [chatId, getPollsByChatId, maxPolls, showExpired]);

  // Calculate total votes for a poll
  const calculateTotalVotes = useCallback((options: IPoll['options']) => {
    return options.reduce((total, option) => total + option.votes, 0);
  }, []);

  // Handle poll vote with error handling
  const handlePollVote = useCallback(async (pollId: string, optionId: string) => {
    try {
      await votePoll(pollId, [optionId], 'current-user-id');
    } catch (error) {
      setError('Failed to submit vote. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  }, [votePoll]);

  // Initialize virtualizer for performance
  const rowVirtualizer = useVirtualizer({
    count: polls.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 200, []), // Estimated poll height
    overscan: 5
  });

  // Set up real-time updates
  useEffect(() => {
    setLoading(true);
    const cleanup = usePoll().subscribeToPollUpdates(chatId, {
      onData: () => setLoading(false),
      onError: (err) => setError(err.message)
    });

    return () => {
      cleanup();
    };
  }, [chatId]);

  if (loading) {
    return (
      <ListContainer
        ref={parentRef}
        className={className}
        role="list"
        aria-busy="true"
        aria-label="Loading polls"
      >
        <CircularProgress />
      </ListContainer>
    );
  }

  if (error) {
    return (
      <Alert 
        severity="error" 
        onClose={() => setError(null)}
        sx={{ margin: '16px 0' }}
      >
        {error}
      </Alert>
    );
  }

  if (!polls.length) {
    return (
      <EmptyState variant="body1">
        No polls available
      </EmptyState>
    );
  }

  return (
    <ListContainer
      ref={parentRef}
      className={className}
      role="list"
      aria-label="Poll list"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const poll = polls[virtualRow.index];
          const totalVotes = calculateTotalVotes(poll.options);

          return (
            <div
              key={poll.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <PollContainer role="listitem">
                <Question variant="h6" component="h3">
                  {poll.question}
                </Question>
                {poll.options.map((option) => (
                  <PollOption
                    key={option.id}
                    option={option}
                    pollId={poll.id}
                    isSelected={false} // TODO: Implement selection state
                    isDisabled={false} // TODO: Implement disabled state
                    totalVotes={totalVotes}
                    onVoteComplete={(success) => {
                      if (!success) {
                        setError('Failed to submit vote. Please try again.');
                      }
                    }}
                  />
                ))}
              </PollContainer>
            </div>
          );
        })}
      </div>
    </ListContainer>
  );
});

PollList.displayName = 'PollList';

export default PollList;