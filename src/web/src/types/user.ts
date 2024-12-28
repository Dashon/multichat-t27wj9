import { ThemeMode } from './theme';

/**
 * Type-safe user role enumeration with const assertions
 * Based on authorization matrix from technical specifications
 */
export const enum UserRole {
  USER = 'USER',
  PREMIUM_USER = 'PREMIUM_USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN'
}

/**
 * Branded type for user ID to ensure type safety
 */
declare const brand: unique symbol;
export type UserId = string & { readonly brand: typeof brand };

/**
 * Comprehensive user settings interface with accessibility options
 * Integrates with theme system and provides extensive customization
 */
export interface UserSettings {
  theme: ThemeMode;
  notifications: boolean;
  language: string; // ISO 639-1 language code
  timezone: string; // IANA timezone
  fontScale: number; // Range: 0.8-1.5
  highContrast: boolean;
}

/**
 * Deep partial type helper for nested partial updates
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Main user interface matching backend schema
 * Implements core user data structure with strict typing
 */
export interface User {
  id: UserId;
  email: string;
  username: string;
  role: UserRole;
  settings: UserSettings;
  createdAt: string; // ISO 8601 date string
  lastActive: string; // ISO 8601 date string
}

/**
 * Enhanced user authentication state with detailed error handling
 */
export interface UserState {
  isAuthenticated: boolean;
  user: Readonly<User> | null;
  loading: boolean;
  error: {
    code: string;
    message: string;
  } | null;
}

/**
 * Type-safe login credentials with additional authentication options
 */
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

/**
 * Registration data interface with partial settings support
 */
export interface RegisterData {
  email: string;
  username: string;
  password: string;
  settings?: Partial<UserSettings>;
}

/**
 * User profile update interface with deep partial settings updates
 */
export interface UpdateUserData {
  username?: string;
  settings?: DeepPartial<UserSettings>;
}

/**
 * Type guard to check if a value is a valid UserRole
 */
export const isUserRole = (value: any): value is UserRole => {
  return Object.values(UserRole).includes(value as UserRole);
};

/**
 * Type guard to check if an object is a valid User
 */
export const isUser = (value: any): value is User => {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.username === 'string' &&
    isUserRole(value.role) &&
    typeof value.settings === 'object' &&
    typeof value.createdAt === 'string' &&
    typeof value.lastActive === 'string'
  );
};

/**
 * Permission checking utility type
 * Maps roles to their allowed actions based on authorization matrix
 */
export type RolePermissions = {
  [UserRole.USER]: {
    canAccessChat: (chatId: string, userId: UserId) => boolean;
    canUseBasicAgents: true;
    canManageProfile: true;
  };
  [UserRole.PREMIUM_USER]: {
    canAccessChat: (chatId: string) => boolean;
    canUseAllAgents: true;
    canManageProfile: true;
  };
  [UserRole.MODERATOR]: {
    canAccessChat: (chatId: string) => boolean;
    canUseAllAgents: true;
    canModerateContent: true;
  };
  [UserRole.ADMIN]: {
    canAccessChat: (chatId: string) => boolean;
    canUseAllAgents: true;
    canModerateContent: true;
    canManageUsers: true;
    canAccessAdminPanel: true;
  };
};

/**
 * Helper type to extract permissions for a specific role
 */
export type PermissionsForRole<R extends UserRole> = RolePermissions[R];