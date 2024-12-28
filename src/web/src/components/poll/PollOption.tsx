/**
 * @fileoverview Poll option component implementing Material Design 3 principles
 * with comprehensive accessibility support and real-time voting functionality.
 * @version 1.0.0
 */

import React, { memo, useCallback, useState } from 'react';
import { styled } from '@mui/material/styles';
import { Typography, useTheme, useMediaQuery } from '@mui/material';
import { PollOption as IPollOption } from '../../types/poll';
import CustomButton from '../common/Button';
import { usePoll } from '../../hooks/usePoll';

// Interface for component props
interface PollOptionProps {
  option: IPollOption;
  pollId: string;
  isSelected: boolean;
  isDisabled: boolean;
  totalVotes: number;
  onVoteStart?: () => void;
  onVoteComplete?: (success: boolean) => void;
  className?: string;
  ariaLabel?: string;
}

// Styled container component with enhanced accessibility
const OptionContainer = styled('div')<{ selected: boolean; disabled: boolean }>(
  ({ theme, selected, disabled }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 1.5,
    marginBottom: theme.spacing(1.5),
    backgroundColor: selected 
      ? theme.palette.primary.light 
      : theme.palette.background.paper,
    border: `2px solid ${selected 
      ? theme.palette.primary.main 
      : theme.palette.divider}`,
    transition: theme.transitions.create(
      ['background-color', 'border-color', 'transform', 'box-shadow'],
      { duration: theme.transitions.duration.short }
    ),
    position: 'relative',
    minHeight: '64px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    opacity: disabled ? 0.6 : 1,
    
    '&:hover': !disabled && {
      backgroundColor: selected 
        ? theme.palette.primary.light 
        : theme.palette.action.hover,
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows[2],
    },

    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: '2px',
    },

    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
      transform: 'none',
      '&:hover': {
        transform: 'none',
      },
    },
  })
);

// Progress bar component
const ProgressBar = styled('div')<{ value: number }>(({ theme, value }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  height: '4px',
  width: `${value}%`,
  backgroundColor: theme.palette.primary.main,
  borderRadius: '0 0 4px 4px',
  transition: theme.transitions.create('width', {
    duration: theme.transitions.duration.standard,
  }),
}));

/**
 * Poll option component with real-time voting functionality and accessibility support
 */
export const PollOption: React.FC<PollOptionProps> = memo(({
  option,
  pollId,
  isSelected,
  isDisabled,
  totalVotes,
  onVoteStart,
  onVoteComplete,
  className,
  ariaLabel,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isVoting, setIsVoting] = useState(false);
  const { votePoll } = usePoll();

  // Calculate vote percentage
  const votePercentage = totalVotes > 0 
    ? Math.round((option.votes / totalVotes) * 100) 
    : 0;

  // Format vote count with localization
  const formattedVotes = new Intl.NumberFormat().format(option.votes);

  // Handle vote action with debouncing and error handling
  const handleVote = useCallback(async (event: React.MouseEvent) => {
    event.preventDefault();
    
    if (isDisabled || isVoting) return;

    try {
      setIsVoting(true);
      onVoteStart?.();

      await votePoll(pollId, [option.id], 'current-user-id');
      
      onVoteComplete?.(true);
    } catch (error) {
      console.error('Vote failed:', error);
      onVoteComplete?.(false);
    } finally {
      setIsVoting(false);
    }
  }, [pollId, option.id, isDisabled, isVoting, onVoteStart, onVoteComplete, votePoll]);

  return (
    <OptionContainer
      selected={isSelected}
      disabled={isDisabled}
      onClick={handleVote}
      className={className}
      role="radio"
      aria-checked={isSelected}
      aria-disabled={isDisabled}
      aria-label={ariaLabel || `Vote for ${option.text}`}
      tabIndex={isDisabled ? -1 : 0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleVote(e as any);
        }
      }}
    >
      <div style={{ flex: 1, marginRight: theme.spacing(2) }}>
        <Typography
          variant="body1"
          component="span"
          color={isSelected ? 'primary' : 'textPrimary'}
          sx={{ fontWeight: isSelected ? 500 : 400 }}
        >
          {option.text}
        </Typography>
        
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {formattedVotes} {formattedVotes === '1' ? 'vote' : 'votes'} 
          {!isMobile && ` · ${votePercentage}%`}
        </Typography>
      </div>

      {!isMobile && (
        <CustomButton
          variant="text"
          color={isSelected ? 'primary' : 'inherit'}
          disabled={isDisabled}
          loading={isVoting}
          onClick={handleVote}
          aria-label={`Click to vote for ${option.text}`}
        >
          {isSelected ? 'Voted' : 'Vote'}
        </CustomButton>
      )}

      <ProgressBar 
        value={votePercentage}
        role="progressbar"
        aria-valuenow={votePercentage}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </OptionContainer>
  );
});

PollOption.displayName = 'PollOption';

export default PollOption;