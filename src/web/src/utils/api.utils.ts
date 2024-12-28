/**
 * @fileoverview API utility functions for the AI-Enhanced Group Chat Platform web client.
 * Implements comprehensive request handling, error formatting, and data transformations
 * with enhanced security controls and performance optimizations.
 * @version 1.0.0
 */

import { AxiosError, AxiosResponse } from 'axios'; // v1.6.0
import { apiConfig } from '../config/api.config';
import { isAuthenticated } from './auth.utils';

/**
 * Error message constants for standardized error handling
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'A network error occurred. Please check your connection.',
  TIMEOUT_ERROR: 'The request timed out. Please try again.',
  UNAUTHORIZED: 'Unauthorized access. Please log in again.',
  FORBIDDEN: "Access forbidden. You don't have permission.",
  NOT_FOUND: 'The requested resource was not found.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  SERVER_ERROR: 'An internal server error occurred.',
  VALIDATION_ERROR: 'Invalid request data.',
  PARSE_ERROR: 'Error parsing response data.'
} as const;

/**
 * Default request configuration
 */
export const REQUEST_DEFAULTS = {
  timeout: 30000, // 30 seconds
  retries: 3,
  backoff: 1000, // 1 second
  maxPayloadSize: 5 * 1024 * 1024, // 5MB
  allowedContentTypes: ['application/json', 'multipart/form-data'],
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  }
} as const;

/**
 * Interface for error context information
 */
interface ErrorContext {
  url?: string;
  method?: string;
  timestamp: number;
  requestId?: string;
  correlationId?: string;
}

/**
 * Formats API errors with enhanced context and debugging information
 * @param error - Axios error object
 * @param context - Additional error context
 * @returns Formatted error object
 */
export const formatApiError = (
  error: AxiosError,
  context: Partial<ErrorContext> = {}
): Record<string, any> => {
  const timestamp = context.timestamp || Date.now();
  const errorResponse = error.response?.data;
  
  // Determine error category and message
  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = ERROR_MESSAGES.SERVER_ERROR;

  if (error.code === 'ECONNABORTED') {
    errorCode = 'TIMEOUT_ERROR';
    errorMessage = ERROR_MESSAGES.TIMEOUT_ERROR;
  } else if (!error.response) {
    errorCode = 'NETWORK_ERROR';
    errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
  } else {
    switch (error.response.status) {
      case 401:
        errorCode = 'UNAUTHORIZED';
        errorMessage = ERROR_MESSAGES.UNAUTHORIZED;
        break;
      case 403:
        errorCode = 'FORBIDDEN';
        errorMessage = ERROR_MESSAGES.FORBIDDEN;
        break;
      case 404:
        errorCode = 'NOT_FOUND';
        errorMessage = ERROR_MESSAGES.NOT_FOUND;
        break;
      case 429:
        errorCode = 'RATE_LIMITED';
        errorMessage = ERROR_MESSAGES.RATE_LIMITED;
        break;
    }
  }

  return {
    code: errorCode,
    message: errorMessage,
    details: errorResponse,
    context: {
      url: context.url || error.config?.url,
      method: context.method || error.config?.method?.toUpperCase(),
      timestamp,
      requestId: context.requestId || error.config?.headers?.['X-Request-ID'],
      correlationId: context.correlationId,
      status: error.response?.status
    },
    debug: process.env.NODE_ENV === 'development' ? {
      stack: error.stack,
      config: error.config,
      data: error.response?.data
    } : undefined
  };
};

/**
 * Transforms and sanitizes request data with security controls
 * @param data - Request data to transform
 * @param options - Transform options
 * @returns Transformed request data
 */
export const transformRequest = (
  data: any,
  options: Record<string, any> = {}
): any => {
  if (!data) return data;

  // Remove undefined and null values
  const cleanData = Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);

  // Format dates to ISO strings
  const formattedData = Object.entries(cleanData).reduce((acc, [key, value]) => {
    acc[key] = value instanceof Date ? value.toISOString() : value;
    return acc;
  }, {} as Record<string, any>);

  // Validate payload size
  const payloadSize = new Blob([JSON.stringify(formattedData)]).size;
  if (payloadSize > REQUEST_DEFAULTS.maxPayloadSize) {
    throw new Error('Request payload size exceeds maximum limit');
  }

  // Add request metadata
  return {
    ...formattedData,
    _metadata: {
      timestamp: Date.now(),
      version: apiConfig.version,
      clientId: options.clientId
    }
  };
};

/**
 * Transforms response data with validation and type safety
 * @param response - Axios response object
 * @returns Transformed response data
 */
export const transformResponse = (response: AxiosResponse): any => {
  const { data } = response;

  if (!data) return null;

  // Validate response structure
  if (typeof data !== 'object') {
    throw new Error(ERROR_MESSAGES.PARSE_ERROR);
  }

  // Convert ISO dates to Date objects
  const convertDates = (obj: any): any => {
    if (!obj) return obj;
    
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        acc[key] = new Date(value);
      } else if (typeof value === 'object') {
        acc[key] = convertDates(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, Array.isArray(obj) ? [] : {});
  };

  return convertDates(data);
};

/**
 * Builds secure query strings with parameter validation
 * @param params - Query parameters
 * @param options - Build options
 * @returns Encoded query string
 */
export const buildQueryString = (
  params: Record<string, any>,
  options: Record<string, any> = {}
): string => {
  if (!params || Object.keys(params).length === 0) return '';

  const validParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .reduce((acc, [key, value]) => {
      // Handle arrays
      if (Array.isArray(value)) {
        acc[key] = value.join(',');
      } 
      // Handle objects
      else if (typeof value === 'object') {
        acc[key] = JSON.stringify(value);
      }
      // Handle primitive values
      else {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>);

  const queryParts = Object.entries(validParams)
    .map(([key, value]) => {
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(value);
      return `${encodedKey}=${encodedValue}`;
    })
    .sort(); // Sort for cache optimization

  return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
};

/**
 * Validates request data against endpoint-specific rules
 * @param data - Request data to validate
 * @param endpoint - API endpoint
 * @param validationRules - Validation rules
 * @returns Validation result
 */
export const validateRequestData = (
  data: Record<string, any>,
  endpoint: string,
  validationRules: Record<string, any>
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const rules = validationRules[endpoint];

  if (!rules) {
    return { valid: true, errors: [] };
  }

  // Required fields validation
  rules.required?.forEach((field: string) => {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Type validation
  Object.entries(rules.types || {}).forEach(([field, type]) => {
    if (field in data && typeof data[field] !== type) {
      errors.push(`Invalid type for field ${field}: expected ${type}`);
    }
  });

  // Pattern validation
  Object.entries(rules.patterns || {}).forEach(([field, pattern]) => {
    if (field in data && !new RegExp(pattern as string).test(data[field])) {
      errors.push(`Invalid format for field ${field}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

// Freeze constants to prevent runtime modifications
Object.freeze(ERROR_MESSAGES);
Object.freeze(REQUEST_DEFAULTS);