/**
 * @fileoverview Redux slice for authentication state management
 * Implements secure user session handling with token management and cross-tab synchronization
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.0
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0
import { UserState, LoginCredentials, User } from '../../types/user';
import { authService } from '../../services/auth.service';
import { AUTH_CONSTANTS } from '../../config/constants';

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Maximum retry attempts for auth operations
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Initial authentication state
 */
const initialState: UserState = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
  lastActivity: 0,
  retryCount: 0
};

/**
 * Async thunk for user login with retry mechanism
 */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue, getState, dispatch }) => {
    try {
      const response = await authService.login(credentials);
      // Start session monitoring after successful login
      dispatch(startSessionMonitoring());
      return response;
    } catch (error) {
      const state = getState() as { auth: UserState };
      if (state.auth.retryCount < MAX_RETRY_ATTEMPTS) {
        dispatch(incrementRetryCount());
        // Retry login after delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return dispatch(login(credentials));
      }
      return rejectWithValue(error instanceof Error ? error.message : 'Login failed');
    }
  }
);

/**
 * Async thunk for user logout with cleanup
 */
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { dispatch }) => {
    await authService.logout();
    dispatch(stopSessionMonitoring());
  }
);

/**
 * Async thunk for session validation and maintenance
 */
export const checkAuth = createAsyncThunk(
  'auth/check',
  async (_, { dispatch }) => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        dispatch(updateLastActivity());
        return user;
      }
      return null;
    } catch (error) {
      await authService.logout();
      throw error;
    }
  }
);

/**
 * Auth slice with enhanced error handling and session management
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    updateLastActivity: (state) => {
      state.lastActivity = Date.now();
    },
    incrementRetryCount: (state) => {
      state.retryCount = state.retryCount + 1;
    },
    resetRetryCount: (state) => {
      state.retryCount = 0;
    },
    clearError: (state) => {
      state.error = null;
    },
    setSessionTimeout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.error = {
        code: 'SESSION_TIMEOUT',
        message: 'Session expired due to inactivity'
      };
    }
  },
  extraReducers: (builder) => {
    builder
      // Login action handlers
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<User>) => {
        state.isAuthenticated = true;
        state.user = action.payload;
        state.loading = false;
        state.error = null;
        state.lastActivity = Date.now();
        state.retryCount = 0;
      })
      .addCase(login.rejected, (state, action) => {
        state.isAuthenticated = false;
        state.user = null;
        state.loading = false;
        state.error = {
          code: 'AUTH_ERROR',
          message: action.payload as string || 'Authentication failed'
        };
      })
      // Logout action handlers
      .addCase(logout.fulfilled, (state) => {
        return { ...initialState };
      })
      // Check auth action handlers
      .addCase(checkAuth.fulfilled, (state, action: PayloadAction<User | null>) => {
        if (action.payload) {
          state.isAuthenticated = true;
          state.user = action.payload;
          state.lastActivity = Date.now();
        } else {
          state.isAuthenticated = false;
          state.user = null;
        }
        state.loading = false;
        state.error = null;
      })
      .addCase(checkAuth.rejected, (state) => {
        return { ...initialState };
      });
  }
});

/**
 * Session monitoring middleware
 */
let sessionTimer: NodeJS.Timeout;

export const startSessionMonitoring = () => (dispatch: any) => {
  if (sessionTimer) {
    clearInterval(sessionTimer);
  }

  sessionTimer = setInterval(() => {
    const state = store.getState().auth;
    const timeSinceLastActivity = Date.now() - state.lastActivity;

    if (timeSinceLastActivity >= SESSION_TIMEOUT) {
      dispatch(setSessionTimeout());
      dispatch(logout());
    }
  }, 60000); // Check every minute
};

export const stopSessionMonitoring = () => {
  if (sessionTimer) {
    clearInterval(sessionTimer);
  }
};

/**
 * Memoized selectors for optimized state access
 */
export const selectAuth = (state: { auth: UserState }) => state.auth;

export const selectUser = createSelector(
  selectAuth,
  (auth) => auth.user
);

export const selectIsAuthenticated = createSelector(
  selectAuth,
  (auth) => auth.isAuthenticated
);

export const selectAuthLoading = createSelector(
  selectAuth,
  (auth) => auth.loading
);

export const selectAuthError = createSelector(
  selectAuth,
  (auth) => auth.error
);

// Export actions and reducer
export const {
  updateLastActivity,
  incrementRetryCount,
  resetRetryCount,
  clearError,
  setSessionTimeout
} = authSlice.actions;

export default authSlice.reducer;

// Setup cross-tab synchronization
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('ai_chat_')) {
      store.dispatch(checkAuth());
    }
  });
}