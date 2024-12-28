/**
 * @fileoverview API configuration for the AI-Enhanced Group Chat Platform web client.
 * Implements enterprise-grade security headers, performance optimizations, and comprehensive endpoint management.
 * @version 1.0.0
 */

// process v18.0.0+
import process from 'process';
import { API_CONSTANTS } from './constants';

/**
 * Type definitions for API configuration
 */
interface RetryConfig {
  maxRetries: number;
  backoffFactor: number;
  retryCondition: (error: any) => boolean;
  retryDelay: (retryCount: number) => number;
}

interface SecurityHeaders {
  'Content-Security-Policy': string;
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'Strict-Transport-Security': string;
  'X-XSS-Protection': string;
  'Referrer-Policy': string;
}

/**
 * Retrieves and validates the base URL for API requests
 */
const getBaseUrl = (): string => {
  const baseUrl = process.env.REACT_APP_API_URL || API_CONSTANTS.BASE_URL;
  
  // Validate URL format and ensure HTTPS in production
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
    throw new Error('Production API URL must use HTTPS protocol');
  }

  return `${baseUrl}/${API_CONSTANTS.API_VERSION}`;
};

/**
 * Configures retry strategy with exponential backoff
 */
const getRetryConfig = (): RetryConfig => ({
  maxRetries: API_CONSTANTS.MAX_RETRIES,
  backoffFactor: 2,
  retryCondition: (error: any) => {
    return error.status === 429 || // Rate limit exceeded
           (error.status >= 500 && error.status <= 599) || // Server errors
           error.code === 'ECONNABORTED'; // Timeout
  },
  retryDelay: (retryCount: number) => {
    return Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds
  }
});

/**
 * Enhanced security headers configuration
 */
const securityHeaders: SecurityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.example.com wss://api.example.com;",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/**
 * Main API configuration object
 */
export const apiConfig = {
  baseURL: getBaseUrl(),
  timeout: API_CONSTANTS.REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...securityHeaders
  },
  withCredentials: true, // Enable cookie/authorization header forwarding
  retryConfig: getRetryConfig(),
  validateStatus: (status: number) => status >= 200 && status < 500, // Custom status validation
  maxContentLength: 10 * 1024 * 1024, // 10MB max response size
  maxBodyLength: 5 * 1024 * 1024, // 5MB max request size
  decompress: true, // Automatic response decompression
} as const;

/**
 * API endpoint configurations
 * Implements comprehensive endpoint management including health and monitoring
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    verify: '/auth/verify'
  },
  messages: {
    list: '/messages',
    send: '/messages/send',
    thread: '/messages/thread',
    search: '/messages/search',
    delete: '/messages/delete'
  },
  agents: {
    list: '/agents',
    interact: '/agents/interact',
    status: '/agents/status',
    capabilities: '/agents/capabilities'
  },
  preferences: {
    get: '/preferences',
    update: '/preferences/update',
    sync: '/preferences/sync'
  },
  health: {
    status: '/health',
    readiness: '/health/ready',
    liveness: '/health/live'
  },
  monitoring: {
    metrics: '/monitoring/metrics',
    traces: '/monitoring/traces',
    errors: '/monitoring/errors'
  }
} as const;

/**
 * CORS configuration for API requests
 */
export const corsConfig = {
  origins: process.env.NODE_ENV === 'production' 
    ? ['https://*.app-domain.com']
    : ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Rate-Limit-Remaining'],
  credentials: true,
  maxAge: 86400 // 24 hours
} as const;

// Freeze all configuration objects to prevent runtime modifications
Object.freeze(apiConfig);
Object.freeze(endpoints);
Object.freeze(corsConfig);