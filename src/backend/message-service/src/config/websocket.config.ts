// WebSocket configuration for message service
// Dependencies:
// - socket.io: ^4.7.2
// - @socket.io/redis-adapter: ^8.2.1
// - dotenv: ^16.x

import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HttpServer } from 'http';
import dotenv from 'dotenv';
import { RedisConfig, createRedisConnection } from './redis.config';

dotenv.config();

// Environment variables with defaults
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
const WS_PATH = process.env.WS_PATH || '/chat';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const PING_TIMEOUT = parseInt(process.env.PING_TIMEOUT || '5000', 10);
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL || '10000', 10);
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '10000', 10);
const RECONNECTION_ATTEMPTS = parseInt(process.env.RECONNECTION_ATTEMPTS || '5', 10);
const RECONNECTION_DELAY = parseInt(process.env.RECONNECTION_DELAY || '1000', 10);
const NAMESPACE = process.env.WS_NAMESPACE || '/chat';

// WebSocket configuration interface
export interface WebSocketConfig {
  port: number;
  path: string;
  corsOrigin: string;
  pingTimeout: number;
  pingInterval: number;
  maxConnections: number;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  namespace: string;
  monitoring?: {
    metrics: boolean;
    healthCheck: boolean;
    latencyThreshold: number;
  };
  scaling?: {
    sticky: boolean;
    adaptivePolling: boolean;
  };
}

/**
 * Get WebSocket configuration with enhanced monitoring and performance settings
 * @returns {WebSocketConfig} Complete WebSocket configuration object
 */
export function getWebSocketConfig(): WebSocketConfig {
  return {
    port: WS_PORT,
    path: WS_PATH,
    corsOrigin: CORS_ORIGIN,
    pingTimeout: PING_TIMEOUT,
    pingInterval: PING_INTERVAL,
    maxConnections: MAX_CONNECTIONS,
    reconnectionAttempts: RECONNECTION_ATTEMPTS,
    reconnectionDelay: RECONNECTION_DELAY,
    namespace: NAMESPACE,
    monitoring: {
      metrics: true,
      healthCheck: true,
      latencyThreshold: 100, // ms
    },
    scaling: {
      sticky: true,
      adaptivePolling: true,
    },
  };
}

/**
 * Create and configure WebSocket server with Redis adapter and monitoring
 * @param {HttpServer} httpServer - HTTP server instance
 * @returns {Promise<Server>} Configured Socket.IO server instance
 */
export async function createWebSocketServer(httpServer: HttpServer): Promise<Server> {
  const config = getWebSocketConfig();

  // Socket.IO server options with performance optimizations
  const options: Partial<ServerOptions> = {
    path: config.path,
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    connectTimeout: config.pingTimeout,
    pingTimeout: config.pingTimeout,
    pingInterval: config.pingInterval,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    perMessageDeflate: true,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true, // Enable Engine.IO v3 compatibility
  };

  // Create Socket.IO server instance
  const io = new Server(httpServer, options);

  // Set up Redis adapter for scaling
  try {
    const pubClient = await createRedisConnection();
    const subClient = pubClient.duplicate();
    
    io.adapter(createAdapter(pubClient, subClient, {
      key: 'socket.io',
      publishOnSpecificResponseOnly: true,
    }));

    console.info('[WebSocket] Redis adapter configured successfully');
  } catch (error) {
    console.error('[WebSocket] Redis adapter configuration failed:', error);
    throw error;
  }

  // Configure connection limits and throttling
  io.sockets.setMaxListeners(config.maxConnections);

  // Set up monitoring and metrics collection
  if (config.monitoring?.metrics) {
    io.engine.on('connection-error', (error: Error) => {
      console.error('[WebSocket] Connection error:', error);
    });

    io.engine.on('headers', (headers: any, request: any) => {
      headers['X-Socket-Version'] = '4.7.2';
    });
  }

  // Configure namespace with error handling
  const namespace = io.of(config.namespace);

  namespace.use(async (socket, next) => {
    try {
      // Add connection monitoring
      const startTime = Date.now();
      socket.on('disconnect', () => {
        const sessionDuration = Date.now() - startTime;
        console.info(`[WebSocket] Client disconnected after ${sessionDuration}ms`);
      });

      // Add latency monitoring
      if (config.monitoring?.metrics) {
        socket.on('ping', () => {
          const latency = Date.now() - startTime;
          if (latency > (config.monitoring?.latencyThreshold || 100)) {
            console.warn(`[WebSocket] High latency detected: ${latency}ms`);
          }
        });
      }

      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  // Set up health check endpoint
  if (config.monitoring?.healthCheck) {
    io.of('/health').on('connection', (socket) => {
      socket.emit('status', { status: 'healthy', timestamp: Date.now() });
      socket.disconnect(true);
    });
  }

  // Configure adaptive polling if enabled
  if (config.scaling?.adaptivePolling) {
    io.engine.on('initial_headers', (headers: any, req: any) => {
      headers['X-Socket-Transport'] = 'websocket';
    });
  }

  console.info('[WebSocket] Server configured successfully');
  return io;
}