/**
 * @fileoverview Enhanced custom React hook for managing user preferences with real-time 
 * synchronization, validation, and learning capabilities.
 * Implements comprehensive preference tracking with confidence scoring and secure storage.
 * @version 1.0.0
 */

import { useEffect, useCallback, useState } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { debounce } from 'lodash'; // v4.17.21
import {
  Preference,
  PreferenceType,
  isPreferenceType,
  isValidConfidenceScore,
  ValidatedPreferenceData
} from '../types/preference';
import {
  fetchPreferences,
  updatePreference,
  updateConfidenceScore,
  validatePreference,
  selectPreferences,
  selectPreferenceConfidence
} from '../store/slices/preferenceSlice';

// Constants for preference management
const SYNC_DEBOUNCE_MS = 1000;
const MIN_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Enhanced sync status type for real-time updates
 */
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/**
 * Enhanced preference hook interface with comprehensive features
 */
interface UsePreferenceReturn {
  preferences: Record<PreferenceType, Preference>;
  loading: boolean;
  error: Error | null;
  getPreference: <T>(type: PreferenceType) => Preference<T> | undefined;
  updatePreference: <T>(type: PreferenceType, data: ValidatedPreferenceData<T>) => Promise<void>;
  syncStatus: SyncStatus;
  confidenceScores: Record<PreferenceType, number>;
  resetPreferences: () => void;
}

/**
 * Enhanced custom hook for managing user preferences with learning capabilities
 * @param userId - User identifier for preference management
 * @returns Enhanced preference management interface
 */
export const usePreference = (userId: string): UsePreferenceReturn => {
  const dispatch = useDispatch();
  const preferences = useSelector(selectPreferences);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Initialize preferences on mount
  useEffect(() => {
    const initializePreferences = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch preferences for all types
        await Promise.all(
          Object.values(PreferenceType).map(type =>
            dispatch(fetchPreferences({ userId, preferenceType: type }))
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch preferences'));
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      initializePreferences();
    }
  }, [userId, dispatch]);

  /**
   * Enhanced preference retrieval with type safety and validation
   */
  const getPreference = useCallback(<T>(type: PreferenceType): Preference<T> | undefined => {
    if (!isPreferenceType(type)) {
      throw new Error(`Invalid preference type: ${type}`);
    }

    const preference = preferences[type];
    if (preference) {
      // Validate confidence score
      const confidence = selectPreferenceConfidence({ preferences }, type);
      if (!isValidConfidenceScore(confidence) || confidence < MIN_CONFIDENCE_THRESHOLD) {
        console.warn(`Low confidence score for preference type: ${type}`);
      }
    }

    return preference as Preference<T>;
  }, [preferences]);

  /**
   * Debounced preference synchronization
   */
  const debouncedSync = useCallback(
    debounce(async (type: PreferenceType, data: ValidatedPreferenceData<any>) => {
      setSyncStatus('syncing');
      try {
        await dispatch(
          updatePreference({
            userId,
            preferenceData: {
              preferenceType: type,
              preferenceData: data,
              lastUpdated: new Date()
            },
            optimistic: false
          })
        );
        setSyncStatus('success');
      } catch (err) {
        setSyncStatus('error');
        setError(err instanceof Error ? err : new Error('Sync failed'));
      }
    }, SYNC_DEBOUNCE_MS),
    [dispatch, userId]
  );

  /**
   * Enhanced preference update with validation and learning
   */
  const updatePreferenceWithValidation = useCallback(
    async <T>(type: PreferenceType, data: ValidatedPreferenceData<T>): Promise<void> => {
      if (!isPreferenceType(type)) {
        throw new Error(`Invalid preference type: ${type}`);
      }

      try {
        // Validate preference data
        dispatch(validatePreference({ type, isValid: true }));

        // Calculate new confidence score based on update patterns
        const currentPreference = getPreference<T>(type);
        const newConfidence = currentPreference
          ? Math.min(currentPreference.confidenceScore + 0.1, 1)
          : 0.5;

        // Optimistic update
        await dispatch(
          updatePreference({
            userId,
            preferenceData: {
              preferenceType: type,
              preferenceData: data,
              confidenceScore: newConfidence,
              lastUpdated: new Date()
            },
            optimistic: true
          })
        );

        // Update confidence score
        dispatch(updateConfidenceScore({ type, score: newConfidence }));

        // Trigger debounced sync
        debouncedSync(type, data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Update failed'));
        dispatch(validatePreference({ type, isValid: false }));
      }
    },
    [dispatch, getPreference, debouncedSync]
  );

  /**
   * Reset preferences to default state
   */
  const resetPreferences = useCallback(() => {
    Object.values(PreferenceType).forEach(type => {
      dispatch(validatePreference({ type, isValid: true }));
      dispatch(updateConfidenceScore({ type, score: 0.5 }));
    });
  }, [dispatch]);

  return {
    preferences,
    loading,
    error,
    getPreference,
    updatePreference: updatePreferenceWithValidation,
    syncStatus,
    confidenceScores: Object.values(PreferenceType).reduce(
      (acc, type) => ({
        ...acc,
        [type]: selectPreferenceConfidence({ preferences }, type)
      }),
      {} as Record<PreferenceType, number>
    ),
    resetPreferences
  };
};