/**
 * Authentication and Authorization Interfaces
 * Version: 1.0.0
 * 
 * Defines comprehensive TypeScript interfaces and types for secure authentication,
 * authorization, and token management in the user service.
 */

/**
 * Enumeration of available user roles for strict role-based access control.
 * Follows the principle of least privilege with progressive access levels.
 */
export enum UserRole {
  USER = 'USER',                 // Basic authenticated user
  PREMIUM_USER = 'PREMIUM_USER', // User with premium features access
  MODERATOR = 'MODERATOR',       // User with content moderation capabilities
  ADMIN = 'ADMIN'               // User with full system access
}

/**
 * Interface for device tracking and security validation during authentication.
 * Enables device fingerprinting and suspicious activity detection.
 */
export interface DeviceInfo {
  deviceId: string;    // Unique device identifier
  deviceType: string;  // Device type (mobile, desktop, tablet)
  userAgent: string;   // Browser/client user agent string
}

/**
 * Interface for secure user login request data.
 * Includes optional device tracking for enhanced security.
 */
export interface LoginCredentials {
  email: string;                    // User email address
  password: string;                 // User password (to be hashed)
  clientId?: string;               // Optional OAuth2 client identifier
  deviceInfo?: DeviceInfo;         // Optional device tracking information
}

/**
 * Interface for comprehensive authentication token response.
 * Includes security metadata for token validation and tracking.
 */
export interface AuthTokens {
  accessToken: string;   // JWT access token
  refreshToken: string;  // Secure refresh token
  expiresIn: number;    // Token expiration time in seconds
  tokenType: string;    // Token type (e.g., 'Bearer')
  issuedAt: number;     // Token issuance timestamp
}

/**
 * Interface for secure JWT token payload structure.
 * Contains essential user identification and security tracking data.
 */
export interface TokenPayload {
  userId: string;           // Unique user identifier
  email: string;           // User email address
  role: UserRole;          // User role for authorization
  iat: number;             // Issued at timestamp
  exp: number;             // Expiration timestamp
  deviceId?: string;       // Optional device identifier
  sessionId: string;       // Unique session identifier
}

/**
 * Interface for secure refresh token request data.
 * Includes device validation for enhanced security.
 */
export interface RefreshTokenRequest {
  refreshToken: string;         // Valid refresh token
  clientId?: string;           // Optional OAuth2 client identifier
  deviceInfo?: DeviceInfo;     // Optional device validation info
}

/**
 * Type guard to check if a value is a valid UserRole
 */
export function isValidUserRole(role: any): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}

/**
 * Type for token validation result with error handling
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

/**
 * Interface for session tracking and management
 */
export interface SessionInfo {
  sessionId: string;           // Unique session identifier
  userId: string;             // Associated user identifier
  deviceInfo?: DeviceInfo;    // Device information
  createdAt: number;          // Session creation timestamp
  lastActiveAt: number;       // Last activity timestamp
  expiresAt: number;          // Session expiration timestamp
}