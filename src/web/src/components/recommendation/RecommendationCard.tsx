import React, { memo, useCallback } from 'react';
import { styled, useTheme } from '@mui/material/styles'; // v5.14+
import { Rating, Typography, Tooltip, useMediaQuery, Skeleton } from '@mui/material'; // v5.14+
import { ShareIcon, DeleteIcon, InfoIcon } from '@mui/icons-material'; // v5.14+

// Internal imports
import Card from '../common/Card';
import Button from '../common/Button';
import { SPACING } from '../../styles/dimensions';

/**
 * Interface for the recommendation data structure
 */
interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  rating: number;
  agentName: string;
  timestamp: string;
}

/**
 * Props interface for the RecommendationCard component
 */
interface RecommendationCardProps {
  recommendation: Recommendation;
  onShare: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onViewDetails: (id: string) => void;
  isLoading?: boolean;
  error?: Error | null;
  className?: string;
}

// Styled components with theme-aware styling
const StyledCard = styled(Card)(({ theme }) => ({
  width: '100%',
  maxWidth: '600px',
  margin: `${SPACING.xs}px 0`,
  transition: theme.transitions.create(['transform', 'box-shadow'], {
    duration: theme.transitions.duration.short,
  }),
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
}));

const CardContent = styled('div')(({ theme }) => ({
  padding: SPACING.md,
  position: 'relative',
}));

const Title = styled(Typography)(({ theme }) => ({
  marginBottom: SPACING.xs,
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

const Description = styled(Typography)(({ theme }) => ({
  marginBottom: SPACING.md,
  color: theme.palette.text.secondary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  '-webkit-line-clamp': 2,
  '-webkit-box-orient': 'vertical',
}));

const MetadataContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  marginBottom: SPACING.md,
  gap: SPACING.md,
  flexWrap: 'wrap',
}));

const ActionContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: SPACING.xs,
  marginTop: SPACING.md,
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
  },
}));

/**
 * RecommendationCard component displays a recommendation with detailed information
 * and interactive actions following Material Design 3 principles.
 */
export const RecommendationCard = memo<RecommendationCardProps>(({
  recommendation,
  onShare,
  onDelete,
  onViewDetails,
  isLoading = false,
  error = null,
  className,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Memoized callback handlers
  const handleShare = useCallback(async () => {
    try {
      await onShare(recommendation.id);
    } catch (error) {
      console.error('Error sharing recommendation:', error);
    }
  }, [recommendation.id, onShare]);

  const handleDelete = useCallback(async () => {
    try {
      await onDelete(recommendation.id);
    } catch (error) {
      console.error('Error deleting recommendation:', error);
    }
  }, [recommendation.id, onDelete]);

  const handleViewDetails = useCallback(() => {
    onViewDetails(recommendation.id);
  }, [recommendation.id, onViewDetails]);

  // Loading state
  if (isLoading) {
    return (
      <StyledCard className={className}>
        <CardContent>
          <Skeleton variant="text" width="60%" height={28} />
          <Skeleton variant="text" width="100%" height={20} />
          <Skeleton variant="text" width="100%" height={20} />
          <MetadataContainer>
            <Skeleton variant="text" width={120} />
            <Skeleton variant="rectangular" width={120} height={24} />
          </MetadataContainer>
          <ActionContainer>
            <Skeleton variant="rectangular" width={90} height={36} />
            <Skeleton variant="rectangular" width={90} height={36} />
            <Skeleton variant="rectangular" width={90} height={36} />
          </ActionContainer>
        </CardContent>
      </StyledCard>
    );
  }

  // Error state
  if (error) {
    return (
      <StyledCard className={className}>
        <CardContent>
          <Typography color="error" variant="body2">
            Error loading recommendation: {error.message}
          </Typography>
        </CardContent>
      </StyledCard>
    );
  }

  return (
    <StyledCard
      className={className}
      elevation={1}
      interactive
      role="article"
      aria-labelledby={`recommendation-${recommendation.id}-title`}
    >
      <CardContent>
        <Title
          variant="h6"
          id={`recommendation-${recommendation.id}-title`}
          component="h3"
        >
          {recommendation.title}
        </Title>
        <Description variant="body2">
          {recommendation.description}
        </Description>
        <MetadataContainer>
          <Typography
            variant="caption"
            color="textSecondary"
            component="span"
            aria-label="Recommended by"
          >
            Recommended by @{recommendation.agentName}
          </Typography>
          <Typography
            variant="caption"
            color="textSecondary"
            component="span"
            aria-label="Category"
          >
            {recommendation.category}
          </Typography>
          <Rating
            value={recommendation.rating}
            readOnly
            size={isMobile ? 'small' : 'medium'}
            aria-label={`Rating: ${recommendation.rating} out of 5`}
          />
        </MetadataContainer>
        <ActionContainer>
          <Tooltip title="Share recommendation">
            <Button
              variant="outlined"
              size="small"
              onClick={handleShare}
              startIcon={<ShareIcon />}
              aria-label="Share recommendation"
            >
              Share
            </Button>
          </Tooltip>
          <Tooltip title="View details">
            <Button
              variant="outlined"
              size="small"
              onClick={handleViewDetails}
              startIcon={<InfoIcon />}
              aria-label="View recommendation details"
            >
              Details
            </Button>
          </Tooltip>
          <Tooltip title="Delete recommendation">
            <Button
              variant="outlined"
              size="small"
              color="error"
              onClick={handleDelete}
              startIcon={<DeleteIcon />}
              aria-label="Delete recommendation"
            >
              Delete
            </Button>
          </Tooltip>
        </ActionContainer>
      </CardContent>
    </StyledCard>
  );
});

RecommendationCard.displayName = 'RecommendationCard';

export default RecommendationCard;