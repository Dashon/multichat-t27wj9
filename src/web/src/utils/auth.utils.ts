import jwtDecode from 'jwt-decode'; // v3.1.2
import { User, UserRole } from '../types/user';
import { setStorageItem, getStorageItem, removeStorageItem } from './storage.utils';

// Constants for token management
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutes in seconds
const MAX_TOKEN_RETRY_ATTEMPTS = 3;
const TOKEN_OPERATION_TIMEOUT = 5000; // 5 seconds

// Custom error types for token operations
class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

// Token storage options
const tokenStorageOptions = {
  encrypt: true,
  version: '1.0',
  expiresIn: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Stores access and refresh tokens securely with encryption
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 */
export const setTokens = async (
  accessToken: string,
  refreshToken: string
): Promise<void> => {
  try {
    // Validate token formats
    if (!accessToken || !refreshToken) {
      throw new TokenError('Invalid token format');
    }

    // Store tokens with encryption
    const accessResult = await setStorageItem(
      ACCESS_TOKEN_KEY,
      accessToken,
      tokenStorageOptions
    );
    const refreshResult = await setStorageItem(
      REFRESH_TOKEN_KEY,
      refreshToken,
      tokenStorageOptions
    );

    if (!accessResult.success || !refreshResult.success) {
      throw new TokenError('Failed to store tokens');
    }

    // Dispatch storage event for cross-tab synchronization
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    throw new TokenError(
      `Token storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Retrieves and decrypts stored access token
 * @returns Decrypted access token or null
 */
export const getAccessToken = async (): Promise<string | null> => {
  try {
    const result = await getStorageItem<string>(
      ACCESS_TOKEN_KEY,
      tokenStorageOptions
    );
    return result.success ? result.data : null;
  } catch (error) {
    console.error('Access token retrieval failed:', error);
    return null;
  }
};

/**
 * Retrieves and decrypts stored refresh token
 * @returns Decrypted refresh token or null
 */
export const getRefreshToken = async (): Promise<string | null> => {
  try {
    const result = await getStorageItem<string>(
      REFRESH_TOKEN_KEY,
      tokenStorageOptions
    );
    return result.success ? result.data : null;
  } catch (error) {
    console.error('Refresh token retrieval failed:', error);
    return null;
  }
};

/**
 * Securely removes all stored authentication tokens
 */
export const clearTokens = async (): Promise<void> => {
  try {
    const accessResult = await removeStorageItem(ACCESS_TOKEN_KEY);
    const refreshResult = await removeStorageItem(REFRESH_TOKEN_KEY);

    if (!accessResult.success || !refreshResult.success) {
      throw new TokenError('Failed to clear tokens');
    }

    // Dispatch storage event for cross-tab synchronization
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    throw new TokenError(
      `Token removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Decodes JWT token and extracts payload with type validation
 * @param token - JWT token to decode
 * @returns Type-safe decoded user data
 */
export const decodeToken = (token: string): User => {
  try {
    const decoded = jwtDecode<User>(token);

    // Validate required user fields
    if (
      !decoded ||
      !decoded.id ||
      !decoded.email ||
      !decoded.role ||
      !(decoded.role in UserRole)
    ) {
      throw new TokenError('Invalid token payload structure');
    }

    return decoded;
  } catch (error) {
    throw new TokenError(
      `Token decode failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Checks if access token is expired or will expire soon
 * @param token - JWT token to check
 * @param bufferSeconds - Seconds before expiration to consider token expired
 * @returns Token expiration status
 */
export const isTokenExpired = (
  token: string,
  bufferSeconds: number = TOKEN_EXPIRY_BUFFER
): boolean => {
  try {
    const decoded = jwtDecode<{ exp: number }>(token);
    if (!decoded.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp <= currentTime + bufferSeconds;
  } catch {
    return true;
  }
};

/**
 * Checks if user has valid authentication token with retry logic
 * @returns Token validity status
 */
export const hasValidToken = async (): Promise<boolean> => {
  let attempts = 0;
  const maxAttempts = MAX_TOKEN_RETRY_ATTEMPTS;

  const validateToken = async (): Promise<boolean> => {
    try {
      const token = await getAccessToken();
      if (!token) {
        return false;
      }

      // Validate token format and expiration
      const decoded = decodeToken(token);
      if (!decoded || isTokenExpired(token)) {
        return false;
      }

      return true;
    } catch (error) {
      if (attempts < maxAttempts - 1) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        return validateToken();
      }
      return false;
    }
  };

  // Set timeout for token validation
  const timeoutPromise = new Promise<boolean>(resolve => {
    setTimeout(() => resolve(false), TOKEN_OPERATION_TIMEOUT);
  });

  return Promise.race([validateToken(), timeoutPromise]);
};

// Event listener for storage changes across tabs
window.addEventListener('storage', async (event) => {
  if (event.key?.startsWith('ai_chat_')) {
    // Notify authentication state changes
    window.dispatchEvent(new CustomEvent('authStateChanged'));
  }
});