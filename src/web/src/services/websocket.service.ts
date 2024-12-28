/**
 * @fileoverview WebSocket service implementation for real-time messaging in the AI-Enhanced Group Chat Platform.
 * Implements robust connection management, automatic reconnection, message queueing, and monitoring.
 * @version 1.0.0
 */

// External imports - v18.0.0+
import { EventEmitter } from 'events';

// Internal imports
import { WebSocketConfig } from '../config/websocket.config';
import { Message, MessageStatus } from '../types/message';

/**
 * Connection statistics interface for monitoring
 */
interface ConnectionStats {
  connectAttempts: number;
  successfulConnections: number;
  disconnections: number;
  messagesSent: number;
  messagesReceived: number;
  lastConnectedAt?: Date;
  averageLatency: number;
}

/**
 * Message acknowledgment tracking interface
 */
interface MessageAckTracker {
  timestamp: number;
  timeoutId: NodeJS.Timeout;
  retryCount: number;
}

/**
 * WebSocket connection states
 */
const WEBSOCKET_STATES = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/**
 * WebSocket event types
 */
const WEBSOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  ERROR: 'error',
  RECONNECT: 'reconnect',
  MESSAGE_ACK: 'message_ack',
  PING: 'ping',
  PONG: 'pong',
} as const;

/**
 * Enhanced WebSocket service with robust connection management and monitoring
 */
export class WebSocketService {
  private socket: WebSocket | null = null;
  private readonly eventEmitter: EventEmitter;
  private readonly config: WebSocketConfig;
  private reconnectAttempts: number = 0;
  private pingTimer?: NodeJS.Timeout;
  private isConnecting: boolean = false;
  private readonly messageQueue: Map<string, Message> = new Map();
  private readonly messageAcks: Map<string, MessageAckTracker> = new Map();
  private readonly stats: ConnectionStats = {
    connectAttempts: 0,
    successfulConnections: 0,
    disconnections: 0,
    messagesSent: 0,
    messagesReceived: 0,
    averageLatency: 0,
  };

  /**
   * Initializes the WebSocket service with configuration
   * @param config WebSocket configuration
   */
  constructor(config: WebSocketConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    // Increase max listeners for high-traffic scenarios
    this.eventEmitter.setMaxListeners(50);
  }

  /**
   * Establishes WebSocket connection with automatic reconnection
   * @returns Promise that resolves when connection is established
   */
  public async connect(): Promise<void> {
    if (this.isConnecting || (this.socket?.readyState === WEBSOCKET_STATES.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.stats.connectAttempts++;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.url}${this.config.path}`;
        this.socket = new WebSocket(wsUrl, this.config.protocols);

        // Connection timeout handler
        const connectionTimeout = setTimeout(() => {
          if (this.socket?.readyState !== WEBSOCKET_STATES.OPEN) {
            this.handleError(new Error('Connection timeout'));
            reject(new Error('Connection timeout'));
          }
        }, this.config.connectionTimeout);

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);
          this.handleConnect();
          resolve();
        };

        this.socket.onclose = this.handleDisconnect.bind(this);
        this.socket.onerror = (error: Event) => this.handleError(error);
        this.socket.onmessage = (event: MessageEvent) => this.handleMessage(event);

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Sends a message with delivery guarantees
   * @param message Message to send
   * @returns Promise that resolves when message is acknowledged
   */
  public async sendMessage(message: Message): Promise<void> {
    if (!message.id || !message.chatId) {
      throw new Error('Invalid message format');
    }

    // Add to queue if disconnected
    if (this.socket?.readyState !== WEBSOCKET_STATES.OPEN) {
      this.messageQueue.set(message.id, message);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Set up acknowledgment tracking
        const ackTimeout = setTimeout(() => {
          this.handleMessageTimeout(message.id);
        }, this.config.messageTimeout);

        this.messageAcks.set(message.id, {
          timestamp: Date.now(),
          timeoutId: ackTimeout,
          retryCount: 0,
        });

        // Send message with metadata
        const messageData = {
          ...message,
          metadata: {
            ...message.metadata,
            status: MessageStatus.SENDING,
          },
        };

        this.socket!.send(JSON.stringify(messageData));
        this.stats.messagesSent++;

        // Set up acknowledgment listener
        this.eventEmitter.once(`ack_${message.id}`, () => {
          this.clearMessageAck(message.id);
          resolve();
        });

      } catch (error) {
        this.handleMessageError(message.id, error);
        reject(error);
      }
    });
  }

  /**
   * Subscribes to message events
   * @param callback Function to handle received messages
   */
  public onMessage(callback: (message: Message) => void): void {
    this.eventEmitter.on(WEBSOCKET_EVENTS.MESSAGE, callback);
  }

  /**
   * Retrieves current connection statistics
   * @returns Connection statistics
   */
  public getConnectionStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Gracefully closes the WebSocket connection
   */
  public disconnect(): void {
    this.clearPingTimer();
    if (this.socket) {
      this.socket.close();
    }
  }

  /**
   * Handles successful connection
   */
  private handleConnect(): void {
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.stats.successfulConnections++;
    this.stats.lastConnectedAt = new Date();

    this.setupPingInterval();
    this.processMessageQueue();
    this.eventEmitter.emit(WEBSOCKET_EVENTS.CONNECT);
  }

  /**
   * Handles connection close
   */
  private handleDisconnect(): void {
    this.isConnecting = false;
    this.stats.disconnections++;
    this.clearPingTimer();
    this.eventEmitter.emit(WEBSOCKET_EVENTS.DISCONNECT);

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.handleReconnect();
    }
  }

  /**
   * Implements reconnection with exponential backoff
   */
  private handleReconnect(): void {
    const backoffTime = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectInterval
    );

    this.reconnectAttempts++;
    this.eventEmitter.emit(WEBSOCKET_EVENTS.RECONNECT, this.reconnectAttempts);

    setTimeout(() => {
      this.connect().catch(() => {
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.handleReconnect();
        }
      });
    }, backoffTime);
  }

  /**
   * Processes received messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      this.stats.messagesReceived++;

      if (message.type === 'ack') {
        this.handleMessageAck(message.messageId);
      } else {
        this.eventEmitter.emit(WEBSOCKET_EVENTS.MESSAGE, message);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Handles message acknowledgments
   */
  private handleMessageAck(messageId: string): void {
    const ackData = this.messageAcks.get(messageId);
    if (ackData) {
      const latency = Date.now() - ackData.timestamp;
      this.updateAverageLatency(latency);
      this.eventEmitter.emit(`ack_${messageId}`);
      this.clearMessageAck(messageId);
    }
  }

  /**
   * Processes queued messages after reconnection
   */
  private processMessageQueue(): void {
    for (const [id, message] of this.messageQueue) {
      this.sendMessage(message).catch(() => {
        this.handleMessageError(id, new Error('Failed to send queued message'));
      });
      this.messageQueue.delete(id);
    }
  }

  /**
   * Sets up ping interval for connection monitoring
   */
  private setupPingInterval(): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WEBSOCKET_STATES.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, this.config.pingInterval);
  }

  /**
   * Cleans up ping timer
   */
  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Updates average latency statistics
   */
  private updateAverageLatency(latency: number): void {
    this.stats.averageLatency = (this.stats.averageLatency + latency) / 2;
  }

  /**
   * Cleans up message acknowledgment tracking
   */
  private clearMessageAck(messageId: string): void {
    const ackData = this.messageAcks.get(messageId);
    if (ackData) {
      clearTimeout(ackData.timeoutId);
      this.messageAcks.delete(messageId);
    }
  }

  /**
   * Handles message timeouts
   */
  private handleMessageTimeout(messageId: string): void {
    const ackData = this.messageAcks.get(messageId);
    if (ackData && ackData.retryCount < 3) {
      // Retry sending message
      const message = this.messageQueue.get(messageId);
      if (message) {
        ackData.retryCount++;
        this.sendMessage(message).catch(() => {
          this.handleMessageError(messageId, new Error('Message retry failed'));
        });
      }
    } else {
      this.handleMessageError(messageId, new Error('Message timeout'));
    }
  }

  /**
   * Handles message errors
   */
  private handleMessageError(messageId: string, error: Error): void {
    this.clearMessageAck(messageId);
    this.eventEmitter.emit(WEBSOCKET_EVENTS.ERROR, {
      type: 'message_error',
      messageId,
      error: error.message,
    });
  }

  /**
   * Handles WebSocket errors
   */
  private handleError(error: Error | Event): void {
    this.eventEmitter.emit(WEBSOCKET_EVENTS.ERROR, {
      type: 'connection_error',
      error: error instanceof Error ? error.message : 'WebSocket error',
    });
  }
}