/**
 * @fileoverview Central configuration constants for the AI-Enhanced Group Chat Platform web application.
 * Contains type-safe configuration with environment variable support for API, WebSocket, theming, and authentication.
 * @version 1.0.0
 */

// process v18.0.0+
import process from 'process';

/**
 * Type definitions for configuration constants
 */
type Theme = 'light' | 'dark' | 'system';

interface ApiConstants {
  readonly BASE_URL: string;
  readonly API_VERSION: string;
  readonly REQUEST_TIMEOUT: number;
  readonly MAX_RETRIES: number;
  readonly RATE_LIMIT: number;
}

interface WebSocketConstants {
  readonly RECONNECT_INTERVAL: number;
  readonly MAX_RECONNECT_ATTEMPTS: number;
  readonly PING_INTERVAL: number;
  readonly MESSAGE_TIMEOUT: number;
}

interface ThemeConstants {
  readonly TRANSITION_DURATION: number;
  readonly BASE_SPACING_UNIT: number;
  readonly SUPPORTED_THEMES: ReadonlyArray<Theme>;
}

interface AuthConstants {
  readonly TOKEN_EXPIRY: number;
  readonly REFRESH_TOKEN_EXPIRY: number;
  readonly TOKEN_REFRESH_THRESHOLD: number;
}

/**
 * API configuration constants for REST endpoints and request handling.
 * Implements rate limiting of 100 requests/minute per user as per specifications.
 */
export const API_CONSTANTS: ApiConstants = {
  BASE_URL: process.env.REACT_APP_API_URL || 'https://api.example.com',
  API_VERSION: 'v1',
  REQUEST_TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RATE_LIMIT: 100 // requests per minute
} as const;

/**
 * WebSocket configuration for real-time messaging.
 * Implements <2s message delivery requirement with automatic reconnection.
 */
export const WEBSOCKET_CONSTANTS: WebSocketConstants = {
  RECONNECT_INTERVAL: 5000, // 5 seconds
  MAX_RECONNECT_ATTEMPTS: 5,
  PING_INTERVAL: 30000, // 30 seconds
  MESSAGE_TIMEOUT: 2000 // 2 seconds (as per requirements)
} as const;

/**
 * Theme-related constants implementing Material Design 3 principles.
 * Supports system-default, light, and dark modes with smooth transitions.
 */
export const THEME_CONSTANTS: ThemeConstants = {
  TRANSITION_DURATION: 300, // 300ms for smooth theme transitions
  BASE_SPACING_UNIT: 8, // Material Design base spacing unit
  SUPPORTED_THEMES: ['light', 'dark', 'system'] as const
} as const;

/**
 * Authentication constants for JWT token management.
 * Implements 1-hour access token and 7-day refresh token lifetimes.
 */
export const AUTH_CONSTANTS: AuthConstants = {
  TOKEN_EXPIRY: 3600, // 1 hour in seconds
  REFRESH_TOKEN_EXPIRY: 604800, // 7 days in seconds
  TOKEN_REFRESH_THRESHOLD: 300 // Refresh token 5 minutes before expiry
} as const;

/**
 * Environment-specific configuration validation
 */
const validateConfig = (): void => {
  if (!process.env.REACT_APP_API_URL) {
    console.warn('API_URL not set in environment, using default value');
  }

  // Validate essential configuration values
  if (API_CONSTANTS.REQUEST_TIMEOUT < WEBSOCKET_CONSTANTS.MESSAGE_TIMEOUT) {
    console.warn('API timeout should be greater than WebSocket message timeout');
  }

  if (AUTH_CONSTANTS.TOKEN_REFRESH_THRESHOLD >= AUTH_CONSTANTS.TOKEN_EXPIRY) {
    throw new Error('Token refresh threshold must be less than token expiry time');
  }
};

// Run configuration validation in development environment
if (process.env.NODE_ENV === 'development') {
  validateConfig();
}

/**
 * Type guard for theme validation
 */
export const isValidTheme = (theme: string): theme is Theme => {
  return THEME_CONSTANTS.SUPPORTED_THEMES.includes(theme as Theme);
};

// Freeze all configuration objects to prevent runtime modifications
Object.freeze(API_CONSTANTS);
Object.freeze(WEBSOCKET_CONSTANTS);
Object.freeze(THEME_CONSTANTS);
Object.freeze(AUTH_CONSTANTS);