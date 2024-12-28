import { io, Socket } from 'socket.io-client'; // ^4.7.2
import { jest } from '@jest/globals'; // ^29.0.0
import { WebSocketConfig } from '../../backend/message-service/src/config/websocket.config';
import TestConfig from '../config/test-config';

// Constants for WebSocket testing
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000;
const PERFORMANCE_THRESHOLD = 2000; // 2 seconds max response time

/**
 * Interface for WebSocket test client options
 */
interface WebSocketClientOptions {
  url: string;
  path?: string;
  timeout?: number;
  autoReconnect?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  validateMessages?: boolean;
  namespace?: string;
}

/**
 * Interface for WebSocket message structure
 */
interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: number;
  messageId: string;
  performanceMetrics?: {
    sendTime: number;
    receiveTime: number;
    roundTripTime: number;
  };
}

/**
 * Enhanced WebSocket test client for comprehensive testing of real-time messaging
 */
class WebSocketTestClient {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private eventHandlers: Map<string, Function[]> = new Map();
  private messageHistory: WebSocketMessage[] = [];
  private performanceMetrics: Map<string, number> = new Map();
  private readonly options: Required<WebSocketClientOptions>;
  private testConfig: TestConfig;

  /**
   * Initialize WebSocket test client with enhanced configuration
   * @param options WebSocket client configuration options
   */
  constructor(options: WebSocketClientOptions) {
    this.testConfig = TestConfig.getInstance();
    this.options = {
      url: options.url,
      path: options.path || '/socket.io',
      timeout: options.timeout || DEFAULT_TIMEOUT,
      autoReconnect: options.autoReconnect ?? true,
      retryAttempts: options.retryAttempts || DEFAULT_RETRY_ATTEMPTS,
      retryDelay: options.retryDelay || DEFAULT_RETRY_DELAY,
      validateMessages: options.validateMessages ?? true,
      namespace: options.namespace || '/chat'
    };
    this.validateConfiguration();
  }

  /**
   * Validate client configuration
   * @private
   */
  private validateConfiguration(): void {
    if (!this.options.url) {
      throw new Error('WebSocket URL is required');
    }
    if (this.options.timeout < 0) {
      throw new Error('Timeout must be a positive number');
    }
    if (this.options.retryAttempts < 0) {
      throw new Error('Retry attempts must be a positive number');
    }
  }

  /**
   * Connect to WebSocket server with retry mechanism
   */
  public async connect(): Promise<void> {
    let attempts = 0;

    while (attempts < this.options.retryAttempts) {
      try {
        this.socket = io(this.options.url, {
          path: this.options.path,
          reconnection: this.options.autoReconnect,
          reconnectionAttempts: this.options.retryAttempts,
          reconnectionDelay: this.options.retryDelay,
          timeout: this.options.timeout,
          transports: ['websocket'],
          forceNew: true
        });

        await this.setupSocketHandlers();
        return;
      } catch (error) {
        attempts++;
        if (attempts === this.options.retryAttempts) {
          throw new Error(`Failed to connect after ${attempts} attempts: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
      }
    }
  }

  /**
   * Set up socket event handlers
   * @private
   */
  private async setupSocketHandlers(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket instance not initialized'));
        return;
      }

      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.timeout);

      this.socket.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.performanceMetrics.set('connectionTime', Date.now());
        resolve();
      });

      this.socket.on('connect_error', (error: Error) => {
        clearTimeout(connectionTimeout);
        reject(error);
      });

      this.socket.on('disconnect', (reason: string) => {
        this.isConnected = false;
        this.performanceMetrics.set('disconnectionTime', Date.now());
      });

      // Set up performance monitoring
      this.socket.on('pong', (latency: number) => {
        this.performanceMetrics.set('latency', latency);
      });
    });
  }

  /**
   * Disconnect from WebSocket server with cleanup
   */
  public async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.eventHandlers.clear();
    }
  }

  /**
   * Send message through WebSocket with validation
   * @param event Event name
   * @param data Message data
   */
  public async sendMessage(event: string, data: any): Promise<void> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to WebSocket server');
    }

    const message: WebSocketMessage = {
      event,
      data,
      timestamp: Date.now(),
      messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      performanceMetrics: {
        sendTime: Date.now(),
        receiveTime: 0,
        roundTripTime: 0
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Send timeout for event: ${event}`));
      }, this.options.timeout);

      this.socket!.emit(event, data, (error: any, response: any) => {
        clearTimeout(timeout);
        
        if (error) {
          reject(error);
          return;
        }

        message.performanceMetrics!.receiveTime = Date.now();
        message.performanceMetrics!.roundTripTime = 
          message.performanceMetrics!.receiveTime - message.performanceMetrics!.sendTime;

        if (message.performanceMetrics!.roundTripTime > PERFORMANCE_THRESHOLD) {
          console.warn(`Performance threshold exceeded for event ${event}: ${message.performanceMetrics!.roundTripTime}ms`);
        }

        this.messageHistory.push(message);
        resolve();
      });
    });
  }

  /**
   * Register message event handler with validation
   * @param event Event name
   * @param handler Event handler function
   */
  public onMessage(event: string, handler: Function): void {
    if (!this.socket) {
      throw new Error('Not connected to WebSocket server');
    }

    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }

    this.eventHandlers.get(event)!.push(handler);
    
    this.socket.on(event, async (data: any) => {
      const receiveTime = Date.now();
      
      if (this.options.validateMessages) {
        try {
          this.validateMessage(data);
        } catch (error) {
          console.error(`Message validation failed for event ${event}:`, error);
          return;
        }
      }

      try {
        await handler(data);
      } catch (error) {
        console.error(`Handler error for event ${event}:`, error);
      }
    });
  }

  /**
   * Wait for specific message event with timeout
   * @param event Event name
   * @param timeout Optional timeout duration
   */
  public async waitForMessage(event: string, timeout: number = this.options.timeout): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      this.onMessage(event, (data: any) => {
        clearTimeout(timeoutId);
        resolve(data);
      });
    });
  }

  /**
   * Validate message format
   * @private
   * @param message Message to validate
   */
  private validateMessage(message: any): void {
    if (!message) {
      throw new Error('Message cannot be null or undefined');
    }

    if (typeof message === 'object') {
      if (!message.hasOwnProperty('data')) {
        throw new Error('Message must contain data property');
      }
    }
  }

  /**
   * Get performance metrics for testing
   */
  public getPerformanceMetrics(): Map<string, number> {
    return new Map(this.performanceMetrics);
  }

  /**
   * Get message history for testing
   */
  public getMessageHistory(): WebSocketMessage[] {
    return [...this.messageHistory];
  }
}

export default WebSocketTestClient;
export { WebSocketClientOptions, WebSocketMessage };