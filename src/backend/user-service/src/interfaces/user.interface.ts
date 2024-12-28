/**
 * User Service Interfaces
 * Version: 1.0.0
 * 
 * Defines comprehensive TypeScript interfaces for user data structures,
 * settings, and data transfer objects with enhanced security classifications
 * and strict type validation.
 */

import { UserRole } from './auth.interface';

/**
 * Supported user interface themes
 * Aligned with UI/UX specifications from section 6.9
 */
export type UserTheme = 'LIGHT' | 'DARK' | 'SYSTEM';

/**
 * Comprehensive interface for user preferences and accessibility settings
 * Implements requirements from section 6.8 and 6.9 of technical specifications
 */
export interface UserSettings {
  theme: UserTheme;                // User interface theme preference
  notifications: boolean;          // Push notification preferences
  language: string;               // User interface language (default: 'en')
  timezone: string;               // User timezone (IANA format)
  fontScale: number;              // Accessibility font scaling (0.8-1.5)
  highContrast: boolean;          // High contrast mode for accessibility
}

/**
 * Core user interface with enhanced security classifications
 * Implements data model from section 3.2.1 and security requirements from 7.2.2
 */
export interface User {
  id: string;                     // Unique user identifier (UUID v4)
  email: string;                  // User email address (unique)
  username: string;               // Display username (unique)
  password: string;               // Hashed password (never exposed)
  role: UserRole;                 // User authorization role
  settings: UserSettings;         // User preferences and settings
  createdAt: Date;               // Account creation timestamp
  lastActive: Date;              // Last activity timestamp
  securityLevel: number;         // Security classification level (1-5)
  isVerified: boolean;           // Email verification status
}

/**
 * Data transfer object for secure user creation
 * Implements security requirements from section 7.2.2
 * Excludes sensitive fields and auto-generated data
 */
export interface CreateUserDto {
  email: string;                  // Required: valid email address
  username: string;               // Required: unique username
  password: string;               // Required: unhashed password
  settings?: Partial<UserSettings>; // Optional: initial user settings
}

/**
 * Data transfer object for user updates
 * Implements security requirements from section 7.2.2
 * Restricts updatable fields for security
 */
export interface UpdateUserDto {
  username?: string;              // Optional: new username
  settings?: Partial<UserSettings>; // Optional: updated settings
  securityLevel?: number;         // Optional: security classification
}

/**
 * Security classification levels
 * Aligned with section 7.2.2 Data Classification
 */
export const enum SecurityLevel {
  PUBLIC = 1,      // Public user data
  INTERNAL = 2,    // Internal user data
  CONFIDENTIAL = 3, // Confidential user data
  SENSITIVE = 4,   // Sensitive user data
  CRITICAL = 5     // Critical user data
}

/**
 * Type guard to validate user settings
 */
export function isValidUserSettings(settings: any): settings is UserSettings {
  return (
    settings &&
    typeof settings.theme === 'string' &&
    ['LIGHT', 'DARK', 'SYSTEM'].includes(settings.theme) &&
    typeof settings.notifications === 'boolean' &&
    typeof settings.language === 'string' &&
    typeof settings.timezone === 'string' &&
    typeof settings.fontScale === 'number' &&
    settings.fontScale >= 0.8 &&
    settings.fontScale <= 1.5 &&
    typeof settings.highContrast === 'boolean'
  );
}

/**
 * Type guard to validate security level
 */
export function isValidSecurityLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}