/**
 * @fileoverview WebSocket configuration for real-time messaging in the AI-Enhanced Group Chat Platform.
 * Implements production-grade connection management with security, monitoring, and performance optimizations.
 * @version 1.0.0
 */

// process v18.0.0+
import process from 'process';
import { WEBSOCKET_CONSTANTS } from './constants';

/**
 * WebSocket configuration interface with comprehensive connection and monitoring settings
 */
export interface WebSocketConfig {
  /** WebSocket server URL with protocol */
  url: string;
  /** WebSocket endpoint path */
  path: string;
  /** Interval between reconnection attempts in milliseconds */
  reconnectInterval: number;
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts: number;
  /** Interval for ping messages to keep connection alive */
  pingInterval: number;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Maximum size of message queue for offline buffering */
  messageQueueSize: number;
  /** Whether to use secure WebSocket connection */
  secure: boolean;
  /** Supported WebSocket protocols */
  protocols: string[];
  /** Whether heartbeat monitoring is enabled */
  heartbeatEnabled: boolean;
  /** Interval for heartbeat messages in milliseconds */
  heartbeatInterval: number;
}

/**
 * Environment-specific WebSocket URL validation
 * @throws {Error} If WebSocket URL is invalid
 */
const validateWebSocketUrl = (url: string): void => {
  try {
    const wsUrl = new URL(url);
    if (!['ws:', 'wss:'].includes(wsUrl.protocol)) {
      throw new Error('Invalid WebSocket protocol');
    }
  } catch (error) {
    throw new Error(`Invalid WebSocket URL: ${error.message}`);
  }
};

/**
 * Creates a validated WebSocket configuration with environment-specific settings
 * @returns {WebSocketConfig} Validated WebSocket configuration
 */
export const getWebSocketConfig = (): WebSocketConfig => {
  const wsBaseUrl = process.env.REACT_APP_WS_URL || 'wss://api.example.com';
  const wsPath = process.env.REACT_APP_WS_PATH || '/ws';
  const secure = process.env.REACT_APP_WS_SECURE === 'true';

  // Validate WebSocket URL
  validateWebSocketUrl(wsBaseUrl);

  return {
    url: wsBaseUrl,
    path: wsPath,
    reconnectInterval: WEBSOCKET_CONSTANTS.RECONNECT_INTERVAL,
    maxReconnectAttempts: WEBSOCKET_CONSTANTS.MAX_RECONNECT_ATTEMPTS,
    pingInterval: WEBSOCKET_CONSTANTS.PING_INTERVAL,
    connectionTimeout: WEBSOCKET_CONSTANTS.MESSAGE_TIMEOUT,
    messageQueueSize: 1000, // Buffer up to 1000 messages during disconnection
    secure,
    protocols: ['v1.chat.protocol'], // Versioned protocol support
    heartbeatEnabled: true,
    heartbeatInterval: 30000, // 30 seconds heartbeat
  };
};

/**
 * Default WebSocket configuration with production-ready settings
 * Implements <2s message delivery requirement with robust connection management
 */
export const defaultWebSocketConfig: WebSocketConfig = {
  url: 'wss://api.example.com',
  path: '/ws',
  reconnectInterval: WEBSOCKET_CONSTANTS.RECONNECT_INTERVAL,
  maxReconnectAttempts: WEBSOCKET_CONSTANTS.MAX_RECONNECT_ATTEMPTS,
  pingInterval: WEBSOCKET_CONSTANTS.PING_INTERVAL,
  connectionTimeout: WEBSOCKET_CONSTANTS.MESSAGE_TIMEOUT,
  messageQueueSize: 1000,
  secure: true,
  protocols: ['v1.chat.protocol'],
  heartbeatEnabled: true,
  heartbeatInterval: 30000,
};

// Freeze default configuration to prevent runtime modifications
Object.freeze(defaultWebSocketConfig);

/**
 * Type guard for WebSocket configuration validation
 * @param config Potential WebSocket configuration object
 * @returns {boolean} Whether the configuration is valid
 */
export const isValidWebSocketConfig = (config: unknown): config is WebSocketConfig => {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const requiredKeys: Array<keyof WebSocketConfig> = [
    'url',
    'path',
    'reconnectInterval',
    'maxReconnectAttempts',
    'pingInterval',
    'connectionTimeout',
    'messageQueueSize',
    'secure',
    'protocols',
    'heartbeatEnabled',
    'heartbeatInterval',
  ];

  return requiredKeys.every((key) => key in config);
};

/**
 * Runtime configuration validation for development environment
 */
if (process.env.NODE_ENV === 'development') {
  const config = getWebSocketConfig();
  if (!isValidWebSocketConfig(config)) {
    throw new Error('Invalid WebSocket configuration');
  }
}