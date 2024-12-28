/**
 * Authentication Configuration
 * Version: 1.0.0
 * 
 * Comprehensive configuration for authentication, authorization, and security
 * settings in the user service. Implements secure token management, role-based
 * access control, and advanced security measures.
 */

import { config } from 'dotenv'; // v16.0.0
import { UserRole } from '../interfaces/auth.interface';

// Load environment variables
config();

/**
 * JWT and Token Configuration
 * Implements secure token management with comprehensive settings
 * for token lifecycle, validation, and rotation.
 */
export const authConfig = {
  // JWT configuration
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  accessTokenExpiry: 3600, // 1 hour in seconds
  refreshTokenExpiry: 604800, // 7 days in seconds
  saltRounds: 12, // Number of salt rounds for password hashing
  tokenAlgorithm: 'HS512', // HMAC with SHA-512
  issuer: process.env.TOKEN_ISSUER || 'ai-chat-platform',
  audience: process.env.TOKEN_AUDIENCE || 'ai-chat-users',
  
  // Token rotation settings
  tokenRotationEnabled: true,
  tokenRotationInterval: 86400, // 24 hours in seconds
};

/**
 * Role-Based Access Control Configuration
 * Defines granular permissions for each user role following
 * the principle of least privilege.
 */
export const rolePermissions = {
  [UserRole.USER]: {
    chat: ['read', 'write', 'create'],
    ai: ['basic_agents'],
    profile: ['read', 'update'],
    maxChats: 10,
    maxParticipants: 50
  },
  [UserRole.PREMIUM_USER]: {
    chat: ['read', 'write', 'create', 'delete'],
    ai: ['all_agents'],
    profile: ['read', 'update'],
    analytics: ['basic'],
    maxChats: 50,
    maxParticipants: 200
  },
  [UserRole.MODERATOR]: {
    chat: ['read', 'write', 'create', 'delete', 'moderate'],
    ai: ['all_agents'],
    profile: ['read', 'update'],
    analytics: ['advanced'],
    moderation: ['review', 'delete', 'warn'],
    maxChats: 100,
    maxParticipants: 500
  },
  [UserRole.ADMIN]: {
    chat: ['read', 'write', 'create', 'delete', 'moderate', 'manage'],
    ai: ['all_agents', 'configure'],
    profile: ['read', 'update', 'manage'],
    analytics: ['full'],
    moderation: ['review', 'delete', 'warn', 'ban'],
    system: ['configure', 'manage'],
    maxChats: -1, // Unlimited
    maxParticipants: -1 // Unlimited
  }
};

/**
 * Security Configuration
 * Implements comprehensive security controls including
 * rate limiting, input validation, and account protection.
 */
export const securityConfig = {
  // Account protection
  maxLoginAttempts: 5,
  lockoutDuration: 900, // 15 minutes in seconds
  
  // Password policy
  passwordMinLength: 12,
  passwordRequirements: {
    minUppercase: 1,
    minLowercase: 1,
    minNumbers: 1,
    minSpecialChars: 1,
    preventCommonPasswords: true,
    preventPasswordReuse: 5 // Remember last 5 passwords
  },

  // Rate limiting
  rateLimiting: {
    login: {
      windowMs: 900000, // 15 minutes
      maxAttempts: 5
    },
    api: {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    },
    refreshToken: {
      windowMs: 3600000, // 1 hour
      maxAttempts: 10
    }
  },

  // Input validation
  inputValidation: {
    maxUsernameLength: 50,
    maxEmailLength: 100,
    maxPasswordLength: 128,
    allowedCharacters: /^[a-zA-Z0-9\-_.@]+$/,
    sanitizationEnabled: true
  },

  // Session configuration
  sessionConfig: {
    maxConcurrentSessions: 5,
    sessionTimeout: 3600, // 1 hour in seconds
    extendSessionOnActivity: true,
    enforceUniqueDevices: true
  },

  // Multi-factor authentication
  mfaSettings: {
    enabled: true,
    preferredMethod: 'totp',
    backupCodesCount: 10,
    totpWindowSize: 1, // Time steps for TOTP validation
    recoveryEmailRequired: true
  }
};