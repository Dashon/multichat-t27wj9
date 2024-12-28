import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { 
  User, 
  LoginCredentials, 
  RegisterData,
  UserState 
} from '../types/user';

// Constants for token management
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = 'auth_state';

/**
 * Enhanced authentication hook providing comprehensive auth functionality
 * Implements secure token management, session handling, and cross-tab synchronization
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const idleTimerRef = useRef<NodeJS.Timeout>();
  const refreshTimerRef = useRef<NodeJS.Timeout>();

  // Select auth state from Redux store with type safety
  const { user, isAuthenticated, loading, error } = useSelector(
    (state: { auth: UserState }) => state.auth
  );

  /**
   * Handles secure user login with enhanced error handling and rate limiting
   * @param credentials - User login credentials with device identification
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<User> => {
    try {
      // Reset any existing error state
      dispatch({ type: 'auth/resetError' });
      dispatch({ type: 'auth/setLoading', payload: true });

      // Generate device fingerprint for enhanced security
      const deviceId = await generateDeviceFingerprint();
      
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const { user, tokens } = await response.json();

      // Securely store tokens
      localStorage.setItem('access_token', tokens.accessToken);
      sessionStorage.setItem('refresh_token', tokens.refreshToken);

      dispatch({ type: 'auth/loginSuccess', payload: user });
      initializeSessionMonitoring();

      return user;
    } catch (error) {
      dispatch({ 
        type: 'auth/loginFailure', 
        payload: { 
          code: 'AUTH_ERROR',
          message: error instanceof Error ? error.message : 'Login failed'
        }
      });
      throw error;
    } finally {
      dispatch({ type: 'auth/setLoading', payload: false });
    }
  }, [dispatch]);

  /**
   * Handles secure user registration with validation
   * @param data - Registration data with security measures
   */
  const register = useCallback(async (data: RegisterData): Promise<User> => {
    try {
      dispatch({ type: 'auth/resetError' });
      dispatch({ type: 'auth/setLoading', payload: true });

      const deviceId = await generateDeviceFingerprint();
      
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, deviceId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const { user, tokens } = await response.json();

      localStorage.setItem('access_token', tokens.accessToken);
      sessionStorage.setItem('refresh_token', tokens.refreshToken);

      dispatch({ type: 'auth/registerSuccess', payload: user });
      initializeSessionMonitoring();

      return user;
    } catch (error) {
      dispatch({ 
        type: 'auth/registerFailure',
        payload: { 
          code: 'REGISTRATION_ERROR',
          message: error instanceof Error ? error.message : 'Registration failed'
        }
      });
      throw error;
    } finally {
      dispatch({ type: 'auth/setLoading', payload: false });
    }
  }, [dispatch]);

  /**
   * Handles secure logout with complete session cleanup
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      dispatch({ type: 'auth/setLoading', payload: true });

      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('access_token')}` 
        },
      });

      if (!response.ok) {
        console.error('Logout request failed:', response.statusText);
      }

      // Clean up auth state regardless of server response
      localStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
      
      // Clear all timers
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }

      dispatch({ type: 'auth/logout' });
      
      // Broadcast logout to other tabs
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: 'LOGOUT' }));
    } finally {
      dispatch({ type: 'auth/setLoading', payload: false });
    }
  }, [dispatch]);

  /**
   * Refreshes the authentication session
   * @returns Promise resolving to success status
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const refreshToken = sessionStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const { accessToken, newRefreshToken } = await response.json();
      
      localStorage.setItem('access_token', accessToken);
      sessionStorage.setItem('refresh_token', newRefreshToken);

      return true;
    } catch (error) {
      console.error('Session refresh failed:', error);
      await logout();
      return false;
    }
  }, [logout]);

  /**
   * Resets the authentication error state
   */
  const resetError = useCallback(() => {
    dispatch({ type: 'auth/resetError' });
  }, [dispatch]);

  /**
   * Initializes session monitoring including token refresh and idle detection
   */
  const initializeSessionMonitoring = useCallback(() => {
    // Set up token refresh interval
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }
    refreshTimerRef.current = setInterval(refreshSession, TOKEN_REFRESH_INTERVAL);

    // Set up idle detection
    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(logout, IDLE_TIMEOUT);
    };

    // Monitor user activity
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetIdleTimer);
    });

    resetIdleTimer();

    // Cleanup function
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetIdleTimer);
      });
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [logout, refreshSession]);

  // Initialize cross-tab synchronization
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const data = JSON.parse(event.newValue || '{}');
        if (data.type === 'LOGOUT') {
          dispatch({ type: 'auth/logout' });
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [dispatch]);

  // Initialize session monitoring when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const cleanup = initializeSessionMonitoring();
      return cleanup;
    }
  }, [isAuthenticated, initializeSessionMonitoring]);

  return {
    user,
    isAuthenticated,
    isLoading: loading,
    error,
    login,
    logout,
    register,
    refreshSession,
    resetError,
  };
};

/**
 * Generates a unique device fingerprint for enhanced security
 * @returns Promise resolving to device fingerprint
 */
async function generateDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.width,
    screen.height,
    navigator.hardwareConcurrency,
    navigator.deviceMemory,
  ];

  const fingerprint = components.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default useAuth;