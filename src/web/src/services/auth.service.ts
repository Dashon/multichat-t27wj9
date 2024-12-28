/**
 * @fileoverview Authentication service for the AI-Enhanced Group Chat Platform web client.
 * Implements secure user authentication, token management, and session handling.
 * @version 1.0.0
 */

import axios from 'axios'; // v1.6.0
import { LoginCredentials, RegisterData, User } from '../types/user';
import { endpoints } from '../config/api.config';
import { 
  setTokens, 
  clearTokens, 
  decodeToken, 
  getAccessToken, 
  getRefreshToken, 
  isTokenExpired 
} from '../utils/auth.utils';

/**
 * Error messages for authentication operations
 */
const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  REGISTRATION_FAILED: 'Registration failed. Please try again.',
  TOKEN_REFRESH_FAILED: 'Session expired. Please login again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SESSION_TIMEOUT: 'Session timed out due to inactivity',
  CONCURRENT_LOGIN: 'Another login detected. Please refresh the page.',
  VALIDATION_ERROR: 'Invalid input data. Please check your entries.',
  SERVER_ERROR: 'Server error. Please try again later.'
} as const;

/**
 * Authentication configuration constants
 */
const AUTH_CONFIG = {
  TOKEN_REFRESH_THRESHOLD: 300, // 5 minutes before token expiry
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  SESSION_TIMEOUT: 3600, // 1 hour
  IDLE_TIMEOUT: 1800 // 30 minutes
} as const;

/**
 * Authentication service class implementing secure user authentication and token management
 */
class AuthService {
  private refreshTokenTimeout?: NodeJS.Timeout;
  private idleTimeout?: NodeJS.Timeout;
  private lastActivity: number = Date.now();

  constructor() {
    // Initialize activity monitoring
    this.setupActivityMonitoring();
    // Setup storage event listener for cross-tab synchronization
    this.setupStorageListener();
  }

  /**
   * Authenticates user with credentials and manages token storage
   * @param credentials - User login credentials
   * @returns Authenticated user data
   */
  public async login(credentials: LoginCredentials): Promise<User> {
    try {
      const response = await axios.post(endpoints.auth.login, credentials);

      if (!response.data?.accessToken || !response.data?.refreshToken) {
        throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      await setTokens(response.data.accessToken, response.data.refreshToken);
      
      const user = decodeToken(response.data.accessToken);
      this.startRefreshTokenTimer();
      this.resetIdleTimeout();

      return user;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }
        if (error.response?.status === 503) {
          throw new Error(AUTH_ERROR_MESSAGES.SERVER_ERROR);
        }
        throw new Error(AUTH_ERROR_MESSAGES.NETWORK_ERROR);
      }
      throw error;
    }
  }

  /**
   * Registers new user and handles initial authentication
   * @param userData - User registration data
   * @returns Newly registered user data
   */
  public async register(userData: RegisterData): Promise<User> {
    try {
      const response = await axios.post(endpoints.auth.register, userData);

      if (!response.data?.accessToken || !response.data?.refreshToken) {
        throw new Error(AUTH_ERROR_MESSAGES.REGISTRATION_FAILED);
      }

      await setTokens(response.data.accessToken, response.data.refreshToken);
      
      const user = decodeToken(response.data.accessToken);
      this.startRefreshTokenTimer();
      this.resetIdleTimeout();

      return user;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400) {
          throw new Error(AUTH_ERROR_MESSAGES.VALIDATION_ERROR);
        }
        throw new Error(AUTH_ERROR_MESSAGES.REGISTRATION_FAILED);
      }
      throw error;
    }
  }

  /**
   * Logs out user and cleans up authentication state
   */
  public async logout(): Promise<void> {
    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        await axios.post(endpoints.auth.logout, null, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Refreshes access token with proactive refresh strategy
   * @returns New access token
   */
  public async refreshToken(): Promise<string> {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new Error(AUTH_ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
      }

      const response = await axios.post(endpoints.auth.refresh, {
        refreshToken
      });

      if (!response.data?.accessToken || !response.data?.refreshToken) {
        throw new Error(AUTH_ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
      }

      await setTokens(response.data.accessToken, response.data.refreshToken);
      this.startRefreshTokenTimer();

      return response.data.accessToken;
    } catch (error) {
      this.cleanup();
      throw new Error(AUTH_ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
    }
  }

  /**
   * Retrieves current authenticated user with session validation
   * @returns Current user data or null if not authenticated
   */
  public async getCurrentUser(): Promise<User | null> {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return null;
      }

      if (isTokenExpired(accessToken, AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD)) {
        const newToken = await this.refreshToken();
        return decodeToken(newToken);
      }

      return decodeToken(accessToken);
    } catch (error) {
      this.cleanup();
      return null;
    }
  }

  /**
   * Sets up activity monitoring for idle session detection
   */
  private setupActivityMonitoring(): void {
    const events = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      this.resetIdleTimeout();
    };

    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });
  }

  /**
   * Resets idle timeout timer
   */
  private resetIdleTimeout(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    this.idleTimeout = setTimeout(() => {
      this.handleIdle();
    }, AUTH_CONFIG.IDLE_TIMEOUT * 1000);
  }

  /**
   * Handles idle session timeout
   */
  private async handleIdle(): Promise<void> {
    const timeSinceLastActivity = Date.now() - this.lastActivity;
    if (timeSinceLastActivity >= AUTH_CONFIG.IDLE_TIMEOUT * 1000) {
      await this.logout();
      window.dispatchEvent(new CustomEvent('sessionTimeout', {
        detail: { reason: AUTH_ERROR_MESSAGES.SESSION_TIMEOUT }
      }));
    }
  }

  /**
   * Starts refresh token timer for proactive token refresh
   */
  private startRefreshTokenTimer(): void {
    if (this.refreshTokenTimeout) {
      clearTimeout(this.refreshTokenTimeout);
    }

    this.refreshTokenTimeout = setTimeout(async () => {
      try {
        await this.refreshToken();
      } catch (error) {
        this.cleanup();
      }
    }, (AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD - 60) * 1000); // Refresh 1 minute before threshold
  }

  /**
   * Sets up storage event listener for cross-tab synchronization
   */
  private setupStorageListener(): void {
    window.addEventListener('storage', async (event) => {
      if (event.key?.startsWith('ai_chat_')) {
        const currentUser = await this.getCurrentUser();
        if (!currentUser) {
          this.cleanup();
          window.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: { reason: AUTH_ERROR_MESSAGES.CONCURRENT_LOGIN }
          }));
        }
      }
    });
  }

  /**
   * Cleans up authentication state
   */
  private cleanup(): void {
    if (this.refreshTokenTimeout) {
      clearTimeout(this.refreshTokenTimeout);
    }
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    clearTokens();
  }
}

// Export singleton instance
export const authService = new AuthService();