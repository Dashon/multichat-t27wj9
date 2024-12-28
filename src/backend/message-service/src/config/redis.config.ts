// Redis configuration for message service
// Dependencies:
// - ioredis: ^5.3.2
// - dotenv: ^16.x

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Environment variables with defaults
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);
const REDIS_CLUSTER_MODE = process.env.REDIS_CLUSTER_MODE === 'true';
const REDIS_TLS_ENABLED = process.env.REDIS_TLS_ENABLED === 'true';
const REDIS_SENTINEL_ENABLED = process.env.REDIS_SENTINEL_ENABLED === 'true';
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'msg-svc:';
const REDIS_MAX_RETRIES = parseInt(process.env.REDIS_MAX_RETRIES || '3', 10);
const REDIS_RETRY_INTERVAL = parseInt(process.env.REDIS_RETRY_INTERVAL || '1000', 10);

// Redis configuration interface
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  clusterMode: boolean;
  keyPrefix: string;
  tls?: {
    enabled: boolean;
    rejectUnauthorized?: boolean;
  };
  sentinels?: Array<{ host: string; port: number }>;
  retryStrategy?: (times: number) => number | null;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  connectTimeout?: number;
  disconnectTimeout?: number;
  commandTimeout?: number;
  autoResubscribe?: boolean;
  autoResendUnfulfilledCommands?: boolean;
  lazyConnect?: boolean;
  showFriendlyErrorStack?: boolean;
}

/**
 * Get Redis configuration based on environment settings
 * @returns {RedisConfig} Complete Redis configuration object
 */
export function getRedisConfig(): RedisConfig {
  const config: RedisConfig = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: REDIS_DB,
    clusterMode: REDIS_CLUSTER_MODE,
    keyPrefix: REDIS_KEY_PREFIX,
    enableReadyCheck: true,
    connectTimeout: 10000,
    disconnectTimeout: 5000,
    commandTimeout: 5000,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    lazyConnect: true,
    showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    maxRetriesPerRequest: REDIS_MAX_RETRIES,
  };

  // Add password if provided
  if (REDIS_PASSWORD) {
    config.password = REDIS_PASSWORD;
  }

  // Configure TLS if enabled
  if (REDIS_TLS_ENABLED) {
    config.tls = {
      enabled: true,
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    };
  }

  // Configure sentinel if enabled
  if (REDIS_SENTINEL_ENABLED) {
    const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS?.split(',') || [];
    const sentinelPorts = process.env.REDIS_SENTINEL_PORTS?.split(',').map(Number) || [];
    
    if (sentinelHosts.length === sentinelPorts.length && sentinelHosts.length > 0) {
      config.sentinels = sentinelHosts.map((host, index) => ({
        host,
        port: sentinelPorts[index],
      }));
    }
  }

  // Configure retry strategy
  config.retryStrategy = (times: number) => {
    if (times > REDIS_MAX_RETRIES) {
      return null; // Stop retrying
    }
    return Math.min(times * REDIS_RETRY_INTERVAL, 5000);
  };

  return config;
}

/**
 * Create Redis client instance with comprehensive error handling
 * @returns {Promise<Redis>} Configured Redis client instance
 */
export async function createRedisConnection(): Promise<Redis> {
  const config = getRedisConfig();
  const client = new Redis(config);

  // Error handling
  client.on('error', (error: Error) => {
    console.error('[Redis] Connection error:', error);
  });

  client.on('connect', () => {
    console.info('[Redis] Connected successfully');
  });

  client.on('ready', () => {
    console.info('[Redis] Client is ready to handle requests');
  });

  client.on('close', () => {
    console.warn('[Redis] Connection closed');
  });

  client.on('reconnecting', () => {
    console.info('[Redis] Attempting to reconnect...');
  });

  // Perform initial connection test
  try {
    await client.ping();
  } catch (error) {
    console.error('[Redis] Initial connection test failed:', error);
    throw error;
  }

  return client;
}

/**
 * Create health check function for Redis connection
 * @param {Redis} redisClient - Redis client instance
 * @returns {Promise<boolean>} Health check status
 */
export async function createRedisHealthCheck(redisClient: Redis): Promise<boolean> {
  try {
    const startTime = Date.now();
    await redisClient.ping();
    const latency = Date.now() - startTime;

    // Log latency for monitoring
    if (latency > 100) {
      console.warn(`[Redis] High latency detected: ${latency}ms`);
    }

    return true;
  } catch (error) {
    console.error('[Redis] Health check failed:', error);
    return false;
  }
}

// Export Redis client type for convenience
export type RedisClient = Redis;