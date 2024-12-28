/**
 * @fileoverview Enhanced message service implementing real-time messaging with AI integration,
 * delivery guarantees, and comprehensive monitoring for the AI-Enhanced Group Chat Platform.
 * @version 1.0.0
 */

import { BehaviorSubject } from 'rxjs'; // v7.8.0
import { retry, catchError, timeout } from 'rxjs/operators'; // v7.8.0
import Logger from '@monitoring/logger'; // v2.1.0

import { Message, MessageType, MessageStatus, isAIResponse, hasMentions } from '../types/message';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import { endpoints } from '../config/api.config';
import { WEBSOCKET_CONSTANTS } from '../config/constants';

/**
 * Message cache configuration
 */
interface MessageCache {
  messages: Map<string, Message>;
  threads: Map<string, Message[]>;
  lastUpdated: number;
}

/**
 * Message retry configuration
 */
interface RetryConfig {
  maxAttempts: number;
  backoffInterval: number;
  timeout: number;
}

/**
 * Enhanced message service implementing real-time messaging with AI integration
 */
export class MessageService {
  private messages$ = new BehaviorSubject<Message[]>([]);
  private threadMessages$ = new BehaviorSubject<Message[]>([]);
  private messageCache: MessageCache;
  private retryConfigs: Map<string, RetryConfig>;
  private readonly logger: Logger;

  /**
   * Initializes message service with enhanced monitoring and caching
   */
  constructor(
    private readonly apiService: ApiService,
    private readonly wsService: WebSocketService,
    logger: Logger
  ) {
    this.logger = logger.child({ service: 'MessageService' });
    this.messageCache = this.initializeCache();
    this.retryConfigs = this.initializeRetryConfigs();
    this.initializeWebSocket();
    this.setupMessageHandlers();
  }

  /**
   * Initializes message cache with performance optimization
   */
  private initializeCache(): MessageCache {
    return {
      messages: new Map<string, Message>(),
      threads: new Map<string, Message[]>(),
      lastUpdated: Date.now()
    };
  }

  /**
   * Initializes retry configurations for different message types
   */
  private initializeRetryConfigs(): Map<string, RetryConfig> {
    return new Map([
      ['default', {
        maxAttempts: 3,
        backoffInterval: 1000,
        timeout: WEBSOCKET_CONSTANTS.MESSAGE_TIMEOUT
      }],
      ['ai_response', {
        maxAttempts: 5,
        backoffInterval: 2000,
        timeout: WEBSOCKET_CONSTANTS.MESSAGE_TIMEOUT * 2
      }]
    ]);
  }

  /**
   * Initializes WebSocket connection with monitoring
   */
  private initializeWebSocket(): void {
    this.wsService.onMessage((message: Message) => {
      this.handleIncomingMessage(message);
    });

    this.wsService.connect().catch(error => {
      this.logger.error('WebSocket connection failed', { error });
    });
  }

  /**
   * Sets up message handlers for different message types
   */
  private setupMessageHandlers(): void {
    this.wsService.onMessage((message: Message) => {
      if (isAIResponse(message)) {
        this.handleAIResponse(message);
      } else {
        this.updateMessageCache(message);
      }
    });
  }

  /**
   * Sends a message with delivery guarantees and AI processing
   * @param message Message to send
   * @returns Promise resolving when message is delivered
   */
  public async sendMessage(message: Message): Promise<void> {
    try {
      // Validate message content
      this.validateMessage(message);

      // Process AI mentions if present
      if (hasMentions(message)) {
        message.metadata.aiContext = await this.processAIContext(message);
      }

      // Update message status
      message.metadata.status = MessageStatus.SENDING;
      this.updateMessageCache(message);

      // Get retry configuration based on message type
      const retryConfig = this.getRetryConfig(message);

      // Send message with retry logic
      await this.wsService.sendMessage(message)
        .pipe(
          timeout(retryConfig.timeout),
          retry({
            count: retryConfig.maxAttempts,
            delay: (error, retryCount) => 
              this.calculateRetryDelay(retryCount, retryConfig.backoffInterval)
          }),
          catchError(error => this.handleSendError(message, error))
        ).toPromise();

      // Update message status on success
      message.metadata.status = MessageStatus.DELIVERED;
      this.updateMessageCache(message);
      
      this.logger.info('Message sent successfully', {
        messageId: message.id,
        chatId: message.chatId
      });

    } catch (error) {
      this.logger.error('Failed to send message', {
        messageId: message.id,
        error
      });
      throw error;
    }
  }

  /**
   * Processes AI-related context and mentions in messages
   * @param message Message containing AI mentions
   * @returns Processed AI context
   */
  private async processAIContext(message: Message): Promise<any> {
    try {
      const response = await this.apiService.post(
        endpoints.agents.interact,
        {
          message: message.content,
          mentions: message.metadata.mentions,
          chatId: message.chatId
        }
      );

      return response.context;

    } catch (error) {
      this.logger.error('AI context processing failed', {
        messageId: message.id,
        error
      });
      throw error;
    }
  }

  /**
   * Handles incoming messages and updates local state
   * @param message Received message
   */
  private handleIncomingMessage(message: Message): void {
    this.updateMessageCache(message);
    
    if (message.threadId) {
      const threadMessages = this.threadMessages$.value;
      this.threadMessages$.next([...threadMessages, message]);
    } else {
      const messages = this.messages$.value;
      this.messages$.next([...messages, message]);
    }
  }

  /**
   * Handles AI response messages with special processing
   * @param message AI response message
   */
  private handleAIResponse(message: Message): void {
    message.metadata.type = MessageType.AI_RESPONSE;
    this.updateMessageCache(message);
    this.notifyAIResponse(message);
  }

  /**
   * Updates message cache with new message
   * @param message Message to cache
   */
  private updateMessageCache(message: Message): void {
    this.messageCache.messages.set(message.id, message);
    this.messageCache.lastUpdated = Date.now();

    if (message.threadId) {
      const threadMessages = this.messageCache.threads.get(message.threadId) || [];
      this.messageCache.threads.set(message.threadId, [...threadMessages, message]);
    }
  }

  /**
   * Validates message format and content
   * @param message Message to validate
   */
  private validateMessage(message: Message): void {
    if (!message.id || !message.chatId || !message.content) {
      throw new Error('Invalid message format');
    }

    if (message.content.length > 5000) {
      throw new Error('Message content exceeds maximum length');
    }
  }

  /**
   * Gets retry configuration for message type
   * @param message Message to get configuration for
   */
  private getRetryConfig(message: Message): RetryConfig {
    return this.retryConfigs.get(
      isAIResponse(message) ? 'ai_response' : 'default'
    ) || this.retryConfigs.get('default')!;
  }

  /**
   * Calculates retry delay with exponential backoff
   * @param retryCount Current retry attempt
   * @param baseInterval Base interval for backoff
   */
  private calculateRetryDelay(retryCount: number, baseInterval: number): number {
    return Math.min(
      baseInterval * Math.pow(2, retryCount),
      10000 // Max 10 seconds
    );
  }

  /**
   * Handles message send errors with logging
   * @param message Failed message
   * @param error Error details
   */
  private handleSendError(message: Message, error: any): never {
    message.metadata.status = MessageStatus.FAILED;
    this.updateMessageCache(message);

    this.logger.error('Message send failed', {
      messageId: message.id,
      error
    });

    throw error;
  }

  /**
   * Notifies subscribers of AI response
   * @param message AI response message
   */
  private notifyAIResponse(message: Message): void {
    this.logger.info('AI response received', {
      messageId: message.id,
      agentId: message.metadata.aiContext?.agentId
    });
  }

  /**
   * Gets message metrics for monitoring
   * @returns Message statistics
   */
  public getMessageMetrics(): Record<string, number> {
    return {
      cachedMessages: this.messageCache.messages.size,
      cachedThreads: this.messageCache.threads.size,
      lastUpdated: this.messageCache.lastUpdated
    };
  }
}