// @version React 18.2.0
import { ComponentType } from 'react';

/**
 * Enum defining all application route paths
 * Ensures type safety and centralized route management
 */
export enum ROUTE_PATHS {
  // Authentication routes
  AUTH = '/auth',
  LOGIN = '/auth/login',
  REGISTER = '/auth/register',
  
  // Main application routes
  CHAT = '/chat',
  CHAT_ROOM = '/chat/:roomId',
  
  // Settings and profile routes
  SETTINGS = '/settings',
  PROFILE = '/settings/profile',
  PREFERENCES = '/settings/preferences',
  THEME = '/settings/theme',
  
  // Feature-specific routes
  AI_AGENTS = '/ai-agents',
  RECOMMENDATIONS = '/recommendations',
  POLLS = '/polls'
}

/**
 * Global route configuration constants
 */
export const BASE_PATH = '/';
export const DEFAULT_REDIRECT = ROUTE_PATHS.CHAT;
export const AUTH_REDIRECT = ROUTE_PATHS.LOGIN;
export const ROUTE_TRANSITION_DURATION = 300;

/**
 * Interface for route metadata
 * Enhances route configuration with additional context
 */
export interface RouteMeta {
  title: string;
  breadcrumb?: string;
  icon?: string;
  roles?: string[];
  requiresAuth?: boolean;
  transition?: {
    enter: string;
    exit: string;
    duration: number;
  };
}

/**
 * Comprehensive route configuration interface
 * Defines structure for all route definitions
 */
export interface RouteConfig {
  path: string;
  component: ComponentType<any>;
  protected: boolean;
  exact?: boolean;
  roles?: string[];
  meta?: RouteMeta;
  children?: RouteConfig[];
}

/**
 * Type definition for route parameters validation
 */
export interface RouteParams {
  [key: string]: string | number;
}

/**
 * Type for validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

/**
 * Array of protected routes requiring authentication
 */
export const PROTECTED_ROUTES: string[] = [
  ROUTE_PATHS.CHAT,
  ROUTE_PATHS.CHAT_ROOM,
  ROUTE_PATHS.SETTINGS,
  ROUTE_PATHS.PROFILE,
  ROUTE_PATHS.PREFERENCES,
  ROUTE_PATHS.THEME,
  ROUTE_PATHS.AI_AGENTS,
  ROUTE_PATHS.RECOMMENDATIONS,
  ROUTE_PATHS.POLLS
];

/**
 * Array of public routes accessible without authentication
 */
export const PUBLIC_ROUTES: string[] = [
  ROUTE_PATHS.AUTH,
  ROUTE_PATHS.LOGIN,
  ROUTE_PATHS.REGISTER
];

/**
 * Validates if a route requires protection and user has necessary roles
 * @param path - Route path to check
 * @param userRoles - Array of user roles
 * @returns boolean indicating if route is protected and accessible
 */
export const isProtectedRoute = (path: string, userRoles: string[] = []): boolean => {
  // Check if path exists in protected routes
  const isProtected = PROTECTED_ROUTES.some(route => 
    path.startsWith(route.split(':')[0])
  );

  if (!isProtected) return false;

  // If no specific roles required, just check protection status
  if (!userRoles.length) return true;

  // Additional role-based validation could be implemented here
  return true;
};

/**
 * Determines appropriate redirect path based on auth status and context
 * @param isAuthenticated - User authentication status
 * @param currentPath - Current route path
 * @param userRoles - Array of user roles
 * @param context - Additional routing context
 * @returns Appropriate redirect path
 */
export const getRedirectPath = (
  isAuthenticated: boolean,
  currentPath: string,
  userRoles: string[] = [],
  context?: Record<string, unknown>
): string => {
  // If not authenticated and trying to access protected route
  if (!isAuthenticated && isProtectedRoute(currentPath, userRoles)) {
    return AUTH_REDIRECT;
  }

  // If authenticated and on auth routes
  if (isAuthenticated && PUBLIC_ROUTES.includes(currentPath)) {
    return DEFAULT_REDIRECT;
  }

  // Return current path if no redirect needed
  return currentPath;
};

/**
 * Validates dynamic route parameters for security and consistency
 * @param path - Route path with parameter definitions
 * @param params - Actual parameter values
 * @returns Validation result
 */
export const validateRouteParams = (
  path: string,
  params: RouteParams
): ValidationResult => {
  const errors: string[] = [];
  
  // Extract parameter definitions from path
  const paramDefs = path.match(/:[a-zA-Z]+/g) || [];
  
  // Validate required parameters
  paramDefs.forEach(param => {
    const paramName = param.slice(1); // Remove : prefix
    if (!params[paramName]) {
      errors.push(`Missing required parameter: ${paramName}`);
    }
  });

  // Validate parameter formats
  Object.entries(params).forEach(([key, value]) => {
    // Add specific validation rules based on parameter type
    if (typeof value === 'string' && !value.trim()) {
      errors.push(`Invalid value for parameter: ${key}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors: errors.length ? errors : undefined
  };
};