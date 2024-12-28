/**
 * @fileoverview Custom React hook for managing recommendations from AI agents
 * Implements real-time updates, filtering, and comprehensive error handling
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import {
  Recommendation,
  RecommendationType,
  RecommendationStatus,
  RecommendationFilter,
  isRecommendation
} from '../types/recommendation';

// Constants for configuration
const RECOMMENDATION_REFRESH_INTERVAL = 300000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 5000;

// Custom error types for detailed error handling
interface RecommendationError {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Custom hook for managing recommendations with real-time updates
 * @returns Object containing recommendations state and management functions
 */
export const useRecommendation = () => {
  // State management
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<RecommendationError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Refs for cleanup and abort control
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetches recommendations from the API with retry logic
   */
  const fetchRecommendations = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const response = await Promise.race([
        fetch('/api/v1/recommendations', {
          signal: abortControllerRef.current.signal,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), FETCH_TIMEOUT_MS)
        ),
      ]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Validate response data
      const validRecommendations = data.filter(isRecommendation);
      setRecommendations(validRecommendations);
      setRetryCount(0);
      
    } catch (err) {
      const isRetryable = err instanceof Error && 
        !err.message.includes('aborted') &&
        retryCount < MAX_RETRY_ATTEMPTS;

      setError({
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        retryable: isRetryable,
      });

      if (isRetryable) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchRecommendations();
        }, RETRY_DELAY_MS * Math.pow(2, retryCount));
      }
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  /**
   * Filters recommendations based on provided criteria
   */
  const filterRecommendations = useCallback((filter: RecommendationFilter) => {
    return recommendations.filter(rec => {
      const typeMatch = !filter.type || rec.type === filter.type;
      const statusMatch = !filter.status || rec.status === filter.status;
      const ratingMatch = !filter.minRating || rec.rating >= filter.minRating;
      const agentMatch = !filter.agentType || rec.agentType === filter.agentType;
      
      return typeMatch && statusMatch && ratingMatch && agentMatch;
    });
  }, [recommendations]);

  /**
   * Archives a recommendation with optimistic updates
   */
  const archiveRecommendation = useCallback(async (recommendationId: string) => {
    const originalRecommendations = [...recommendations];
    
    try {
      // Optimistic update
      setRecommendations(prev => 
        prev.map(rec => 
          rec.id === recommendationId
            ? { ...rec, status: RecommendationStatus.ARCHIVED }
            : rec
        )
      );

      const response = await fetch(`/api/v1/recommendations/${recommendationId}/archive`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to archive recommendation');
      }

    } catch (err) {
      // Rollback on failure
      setRecommendations(originalRecommendations);
      setError({
        code: 'ARCHIVE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to archive recommendation',
        retryable: true,
      });
    }
  }, [recommendations]);

  /**
   * Manually refresh recommendations
   */
  const refreshRecommendations = useCallback(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  /**
   * Retry failed operations
   */
  const retryFailedOperation = useCallback(() => {
    if (error?.retryable) {
      setError(null);
      fetchRecommendations();
    }
  }, [error, fetchRecommendations]);

  // Initial fetch and refresh interval setup
  useEffect(() => {
    fetchRecommendations();

    refreshIntervalRef.current = setInterval(
      fetchRecommendations,
      RECOMMENDATION_REFRESH_INTERVAL
    );

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchRecommendations]);

  return {
    recommendations,
    loading,
    error,
    filterRecommendations,
    archiveRecommendation,
    refreshRecommendations,
    retryFailedOperation,
  };
};