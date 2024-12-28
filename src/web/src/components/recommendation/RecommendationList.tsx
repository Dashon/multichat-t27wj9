import React, { useState, useCallback, useMemo } from 'react'; // v18.2.0
import { styled } from '@mui/material/styles'; // v5.14+
import { 
  Box, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Alert, 
  Skeleton,
  Typography,
  useTheme,
  useMediaQuery
} from '@mui/material'; // v5.14+
import debounce from 'lodash/debounce'; // v4.17.21

// Internal imports
import RecommendationCard from './RecommendationCard';
import { useRecommendation } from '../../hooks/useRecommendation';
import { RecommendationType, RecommendationStatus } from '../../types/recommendation';
import { SPACING } from '../../styles/dimensions';

// Styled components
const ListContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '800px',
  margin: '0 auto',
  padding: SPACING.md,
  position: 'relative',
}));

const FilterContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: SPACING.md,
  marginBottom: SPACING.xl,
  flexWrap: 'wrap',
  [theme.breakpoints.down('sm')]: {
    gap: SPACING.sm,
  },
}));

const StyledFormControl = styled(FormControl)(({ theme }) => ({
  minWidth: 120,
  [theme.breakpoints.down('sm')]: {
    width: '100%',
  },
}));

// Props interface
interface RecommendationListProps {
  onShare: (id: string) => Promise<void>;
  onViewDetails: (id: string) => void;
  virtualizeThreshold?: number;
  className?: string;
}

// Filter state interface
interface FilterState {
  type: RecommendationType | 'all';
  status: RecommendationStatus | 'all';
  sortBy: 'rating' | 'createdAt';
}

/**
 * RecommendationList component displays a filterable list of recommendations
 * with enhanced accessibility features and Material Design 3 styling
 */
export const RecommendationList: React.FC<RecommendationListProps> = ({
  onShare,
  onViewDetails,
  virtualizeThreshold = 20,
  className,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // State management
  const [filterState, setFilterState] = useState<FilterState>({
    type: 'all',
    status: 'all',
    sortBy: 'createdAt',
  });

  // Custom hook for recommendation management
  const {
    recommendations,
    loading,
    error,
    filterRecommendations,
    archiveRecommendation,
    retryFailedOperation
  } = useRecommendation();

  // Memoized filtered and sorted recommendations
  const filteredRecommendations = useMemo(() => {
    let filtered = filterRecommendations({
      type: filterState.type === 'all' ? null : filterState.type,
      status: filterState.status === 'all' ? null : filterState.status,
      minRating: null,
      agentType: null,
    });

    return filtered.sort((a, b) => {
      if (filterState.sortBy === 'rating') {
        return b.rating - a.rating;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [recommendations, filterState, filterRecommendations]);

  // Debounced filter handler
  const handleFilterChange = useCallback(
    debounce((newFilter: Partial<FilterState>) => {
      setFilterState(prev => ({ ...prev, ...newFilter }));
    }, 300),
    []
  );

  // Loading state
  if (loading) {
    return (
      <ListContainer className={className}>
        <FilterContainer>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width={120} height={56} />
          ))}
        </FilterContainer>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={200} sx={{ mb: 2 }} />
        ))}
      </ListContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <ListContainer className={className}>
        <Alert 
          severity="error" 
          action={
            error.retryable && (
              <Button
                color="inherit"
                size="small"
                onClick={retryFailedOperation}
              >
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      </ListContainer>
    );
  }

  return (
    <ListContainer className={className} role="region" aria-label="Recommendations">
      <FilterContainer>
        <StyledFormControl>
          <InputLabel id="type-filter-label">Type</InputLabel>
          <Select
            labelId="type-filter-label"
            value={filterState.type}
            label="Type"
            onChange={(e) => handleFilterChange({ type: e.target.value as RecommendationType | 'all' })}
            size={isMobile ? 'small' : 'medium'}
          >
            <MenuItem value="all">All Types</MenuItem>
            {Object.values(RecommendationType).map((type) => (
              <MenuItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </StyledFormControl>

        <StyledFormControl>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={filterState.status}
            label="Status"
            onChange={(e) => handleFilterChange({ status: e.target.value as RecommendationStatus | 'all' })}
            size={isMobile ? 'small' : 'medium'}
          >
            <MenuItem value="all">All Status</MenuItem>
            {Object.values(RecommendationStatus).map((status) => (
              <MenuItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </StyledFormControl>

        <StyledFormControl>
          <InputLabel id="sort-filter-label">Sort By</InputLabel>
          <Select
            labelId="sort-filter-label"
            value={filterState.sortBy}
            label="Sort By"
            onChange={(e) => handleFilterChange({ sortBy: e.target.value as 'rating' | 'createdAt' })}
            size={isMobile ? 'small' : 'medium'}
          >
            <MenuItem value="createdAt">Most Recent</MenuItem>
            <MenuItem value="rating">Highest Rated</MenuItem>
          </Select>
        </StyledFormControl>
      </FilterContainer>

      {filteredRecommendations.length === 0 ? (
        <Typography 
          variant="body1" 
          color="textSecondary" 
          align="center"
          sx={{ py: 4 }}
        >
          No recommendations found
        </Typography>
      ) : (
        <Box role="list">
          {filteredRecommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              onShare={onShare}
              onDelete={archiveRecommendation}
              onViewDetails={onViewDetails}
              sx={{ mb: 2 }}
            />
          ))}
        </Box>
      )}
    </ListContainer>
  );
};

export default RecommendationList;