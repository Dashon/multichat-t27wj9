import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request } from 'express';

// External package versions:
// express-rate-limit: ^6.7.0
// rate-limit-redis: ^3.0.0
// ioredis: ^5.3.0

// Environment variables
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiting constants
const WINDOW_MS = 60000; // 1 minute in milliseconds
const DEFAULT_MAX_REQUESTS = 1000; // General endpoint limit
const AUTH_MAX_REQUESTS = 5; // Authentication endpoint limit
const AI_MAX_REQUESTS = 100; // AI service endpoint limit

/**
 * Creates and configures a Redis store instance for distributed rate limiting
 * with error handling and reconnection logic
 */
const createRedisStore = (): RedisStore => {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    enableReadyCheck: true,
  });

  client.on('error', (err: Error) => {
    console.error('Redis client error:', err);
    if (NODE_ENV === 'production') {
      // Alert monitoring system in production
      // This would be replaced with actual monitoring integration
      console.error('ALERT: Redis rate limiting store error');
    }
  });

  client.on('connect', () => {
    console.info('Redis rate limiting store connected');
  });

  return new RedisStore({
    // @ts-expect-error - Type mismatch in redis client versions
    client: client,
    prefix: 'rl:', // Rate limit key prefix
    sendCommand: (...args: string[]) => client.call(...args),
  });
};

/**
 * Custom key generator function for rate limiting
 * Generates unique keys based on IP and optional user ID
 */
const keyGenerator = (req: Request): string => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userId = req.user?.id || 'anonymous';
  return `${ip}-${userId}`;
};

/**
 * Default rate limit configuration for general API endpoints
 * Implements the platform's standard rate limiting policy
 */
export const defaultRateLimitConfig = {
  windowMs: WINDOW_MS,
  max: DEFAULT_MAX_REQUESTS,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: createRedisStore(),
  skipFailedRequests: false,
  keyGenerator,
  handler: (req: Request, res: any) => {
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    });
  },
};

/**
 * Strict rate limit configuration for authentication endpoints
 * Implements enhanced security measures for auth-related requests
 */
export const authRateLimitConfig = {
  windowMs: WINDOW_MS,
  max: AUTH_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  skipFailedRequests: false,
  keyGenerator,
  handler: (req: Request, res: any) => {
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    });
  },
};

/**
 * Specialized rate limit configuration for AI service endpoints
 * Implements balanced rate limiting for AI-related requests
 */
export const aiRateLimitConfig = {
  windowMs: WINDOW_MS,
  max: AI_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  skipFailedRequests: false,
  keyGenerator,
  handler: (req: Request, res: any) => {
    res.status(429).json({
      error: 'AI service request limit exceeded, please try again later.',
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    });
  },
};

// Export type for TypeScript support
export type RateLimitConfig = typeof defaultRateLimitConfig;