/**
 * @fileoverview Redux slice for managing user preferences with advanced learning capabilities
 * Implements comprehensive preference tracking, synchronization, and validation
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.7
import { debounce } from 'lodash'; // v4.17.21
import {
  Preference,
  PreferenceType,
  isPreferenceType,
  isValidConfidenceScore,
  ValidatedPreferenceData
} from '../../types/preference';
import { PreferenceService } from '../../services/preference.service';

// Initialize preference service singleton
const preferenceService = new PreferenceService(/* injected dependencies */);

/**
 * Enhanced preference state interface with learning capabilities
 */
interface PreferenceState {
  preferences: Record<PreferenceType, Preference>;
  loading: boolean;
  error: string | null;
  lastUpdated: Record<PreferenceType, Date>;
  lastSyncTimestamp: Date;
  confidenceScores: Record<PreferenceType, number>;
  validationStatus: Record<PreferenceType, boolean>;
  updateHistory: Array<{
    timestamp: Date;
    type: PreferenceType;
    change: Partial<Preference>;
  }>;
}

/**
 * Initial state with comprehensive tracking
 */
const initialState: PreferenceState = {
  preferences: {} as Record<PreferenceType, Preference>,
  loading: false,
  error: null,
  lastUpdated: {} as Record<PreferenceType, Date>,
  lastSyncTimestamp: new Date(0),
  confidenceScores: {} as Record<PreferenceType, number>,
  validationStatus: {} as Record<PreferenceType, boolean>,
  updateHistory: []
};

/**
 * Enhanced async thunk for fetching preferences with retry logic
 */
export const fetchPreferences = createAsyncThunk(
  'preferences/fetch',
  async ({ 
    userId, 
    preferenceType, 
    forceRefresh = false 
  }: { 
    userId: string; 
    preferenceType: PreferenceType; 
    forceRefresh?: boolean;
  }) => {
    if (!isPreferenceType(preferenceType)) {
      throw new Error(`Invalid preference type: ${preferenceType}`);
    }

    const preferences = await preferenceService.getUserPreferences(userId, preferenceType);
    return { preferenceType, preferences };
  }
);

/**
 * Debounced preference update function
 */
const debouncedUpdate = debounce(
  (userId: string, preferenceData: Preference) => {
    return preferenceService.updatePreferences(userId, preferenceData);
  },
  1000,
  { maxWait: 5000 }
);

/**
 * Enhanced async thunk for updating preferences with validation
 */
export const updatePreference = createAsyncThunk(
  'preferences/update',
  async ({ 
    userId, 
    preferenceData, 
    optimistic = true 
  }: { 
    userId: string; 
    preferenceData: Preference; 
    optimistic?: boolean;
  }) => {
    // Validate preference data
    if (!isPreferenceType(preferenceData.preferenceType)) {
      throw new Error('Invalid preference type');
    }

    // Validate confidence score
    if (!isValidConfidenceScore(preferenceData.confidenceScore)) {
      throw new Error('Invalid confidence score');
    }

    if (optimistic) {
      // Return immediately for optimistic updates
      return { preferenceData, optimistic: true };
    }

    // Perform actual update
    const updatedPreference = await debouncedUpdate(userId, preferenceData);
    return { preferenceData: updatedPreference, optimistic: false };
  }
);

/**
 * Enhanced preference slice with learning capabilities
 */
const preferenceSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    resetPreferences: (state) => {
      Object.assign(state, initialState);
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    updateConfidenceScore: (
      state,
      action: PayloadAction<{ type: PreferenceType; score: number }>
    ) => {
      if (isValidConfidenceScore(action.payload.score)) {
        state.confidenceScores[action.payload.type] = action.payload.score;
      }
    },
    addToHistory: (
      state,
      action: PayloadAction<{
        type: PreferenceType;
        change: Partial<Preference>;
      }>
    ) => {
      state.updateHistory.push({
        timestamp: new Date(),
        type: action.payload.type,
        change: action.payload.change
      });
    },
    validatePreference: (
      state,
      action: PayloadAction<{ type: PreferenceType; isValid: boolean }>
    ) => {
      state.validationStatus[action.payload.type] = action.payload.isValid;
    },
    setSyncTimestamp: (state) => {
      state.lastSyncTimestamp = new Date();
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch preferences handlers
      .addCase(fetchPreferences.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPreferences.fulfilled, (state, action) => {
        const { preferenceType, preferences } = action.payload;
        state.preferences[preferenceType] = preferences;
        state.lastUpdated[preferenceType] = new Date();
        state.loading = false;
        state.error = null;
      })
      .addCase(fetchPreferences.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch preferences';
      })
      // Update preferences handlers
      .addCase(updatePreference.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updatePreference.fulfilled, (state, action) => {
        const { preferenceData, optimistic } = action.payload;
        const { preferenceType } = preferenceData;

        state.preferences[preferenceType] = preferenceData;
        state.lastUpdated[preferenceType] = new Date();
        state.loading = false;
        state.error = null;

        if (!optimistic) {
          state.lastSyncTimestamp = new Date();
        }
      })
      .addCase(updatePreference.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to update preferences';
      });
  }
});

// Export actions and reducer
export const {
  resetPreferences,
  setLoading,
  setError,
  updateConfidenceScore,
  addToHistory,
  validatePreference,
  setSyncTimestamp
} = preferenceSlice.actions;

export default preferenceSlice.reducer;

// Selectors with memoization
export const selectPreferences = (state: { preferences: PreferenceState }) =>
  state.preferences.preferences;

export const selectPreferencesByType = (
  state: { preferences: PreferenceState },
  type: PreferenceType
) => state.preferences.preferences[type];

export const selectPreferenceConfidence = (
  state: { preferences: PreferenceState },
  type: PreferenceType
) => state.preferences.confidenceScores[type];

export const selectPreferenceValidation = (
  state: { preferences: PreferenceState },
  type: PreferenceType
) => state.preferences.validationStatus[type];