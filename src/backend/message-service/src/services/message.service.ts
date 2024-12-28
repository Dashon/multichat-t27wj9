/**
 * @fileoverview Core message service implementing real-time message handling,
 * persistence, and delivery with support for threading, AI agent integration,
 * WebSocket-based updates, and Redis caching.
 * @version 1.0.0
 */

// External imports - versions specified as per requirements
import { injectable } from 'inversify'; // v6.0.1
import { Server as SocketServer, Socket } from 'socket.io'; // v4.7.2
import Redis from 'ioredis'; // v5.3.2
import { retry } from 'retry'; // v0.13.1
import { Timestamp } from 'google-protobuf';

// Internal imports
import { IMessage, MessageType, MessageMetadata } from '../interfaces/message.interface';
import { MessageRepository } from '../repositories/message.repository';

/**
 * Interface for message delivery tracking
 */
interface DeliveryStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'failed';
  timestamp: Date;
  error?: string;
}

/**
 * Interface for message caching options
 */
interface CacheOptions {
  ttl?: number;
  skipCache?: boolean;
}

@injectable()
export class MessageService {
  private readonly CACHE_TTL = 3600; // 1 hour cache TTL
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly SOCKET_ROOM_PREFIX = 'chat:';
  private readonly AI_MENTION_PATTERN = /@([a-zA-Z0-9_-]+)/g;

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly redisClient: Redis,
    private readonly io: SocketServer
  ) {
    this.initializeSocketHandlers();
    this.initializeRedisSubscriptions();
  }

  /**
   * Sends a new message with support for AI agent integration
   */
  async sendMessage(messageData: IMessage): Promise<IMessage> {
    const operation = retry.operation({
      retries: this.MAX_RETRIES,
      factor: 2,
      minTimeout: this.RETRY_DELAY
    });

    return new Promise((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          // Process AI mentions if present
          const aiMentions = this.extractAIMentions(messageData.content);
          if (aiMentions.length > 0) {
            messageData.metadata = await this.enrichWithAIContext(messageData.metadata, aiMentions);
          }

          // Set message timestamp
          messageData.timestamp = Timestamp.fromDate(new Date());

          // Persist message
          const savedMessage = await this.messageRepository.createMessage(messageData);

          // Cache the message
          await this.cacheMessage(savedMessage);

          // Emit real-time update
          await this.broadcastMessage(savedMessage);

          // Track delivery status
          await this.trackDeliveryStatus({
            messageId: savedMessage.id,
            status: 'sent',
            timestamp: new Date()
          });

          resolve(savedMessage);
        } catch (error) {
          if (operation.retry(error)) {
            return;
          }
          reject(operation.mainError());
        }
      });
    });
  }

  /**
   * Retrieves messages for a chat with caching support
   */
  async getMessagesByChatId(
    chatId: string,
    options: { limit: number; offset: number },
    cacheOptions: CacheOptions = {}
  ): Promise<IMessage[]> {
    const cacheKey = `messages:chat:${chatId}:${options.offset}:${options.limit}`;

    if (!cacheOptions.skipCache) {
      const cachedMessages = await this.redisClient.get(cacheKey);
      if (cachedMessages) {
        return JSON.parse(cachedMessages);
      }
    }

    const messages = await this.messageRepository.findMessagesByChatId(
      chatId,
      options
    );

    if (messages.length > 0) {
      await this.redisClient.setex(
        cacheKey,
        cacheOptions.ttl || this.CACHE_TTL,
        JSON.stringify(messages)
      );
    }

    return messages;
  }

  /**
   * Retrieves messages in a thread
   */
  async getMessagesByThreadId(
    threadId: string,
    options: { limit: number; offset: number }
  ): Promise<IMessage[]> {
    const cacheKey = `messages:thread:${threadId}:${options.offset}:${options.limit}`;
    const cachedMessages = await this.redisClient.get(cacheKey);

    if (cachedMessages) {
      return JSON.parse(cachedMessages);
    }

    const messages = await this.messageRepository.findMessagesByThreadId(
      threadId,
      options
    );

    if (messages.length > 0) {
      await this.redisClient.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(messages)
      );
    }

    return messages;
  }

  /**
   * Archives old messages with configurable options
   */
  async archiveMessages(cutoffDate: Date, options: {
    batchSize: number;
    deleteAfterArchive: boolean;
  }): Promise<void> {
    await this.messageRepository.archiveMessages(cutoffDate, options);
    await this.invalidateMessageCaches();
  }

  /**
   * Initializes WebSocket event handlers
   */
  private initializeSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      socket.on('join-chat', (chatId: string) => {
        socket.join(`${this.SOCKET_ROOM_PREFIX}${chatId}`);
      });

      socket.on('leave-chat', (chatId: string) => {
        socket.leave(`${this.SOCKET_ROOM_PREFIX}${chatId}`);
      });

      socket.on('message-delivered', async (deliveryStatus: DeliveryStatus) => {
        await this.trackDeliveryStatus(deliveryStatus);
      });
    });
  }

  /**
   * Initializes Redis pub/sub for cross-instance communication
   */
  private initializeRedisSubscriptions(): void {
    const subscriber = this.redisClient.duplicate();
    
    subscriber.subscribe('message-updates', (err) => {
      if (err) {
        console.error('Redis subscription error:', err);
        return;
      }
    });

    subscriber.on('message', (channel, message) => {
      if (channel === 'message-updates') {
        const updateData = JSON.parse(message);
        this.broadcastMessage(updateData.message);
      }
    });
  }

  /**
   * Extracts AI agent mentions from message content
   */
  private extractAIMentions(content: string): string[] {
    const matches = content.match(this.AI_MENTION_PATTERN) || [];
    return matches.map(mention => mention.substring(1));
  }

  /**
   * Enriches message metadata with AI context
   */
  private async enrichWithAIContext(
    metadata: MessageMetadata,
    aiMentions: string[]
  ): Promise<MessageMetadata> {
    return {
      ...metadata,
      type: MessageType.AI_RESPONSE,
      mentions: [...(metadata.mentions || []), ...aiMentions],
      aiContext: {
        ...metadata.aiContext,
        requestedAgents: aiMentions
      }
    };
  }

  /**
   * Caches a message in Redis
   */
  private async cacheMessage(message: IMessage): Promise<void> {
    const cacheKey = `message:${message.id}`;
    await this.redisClient.setex(
      cacheKey,
      this.CACHE_TTL,
      JSON.stringify(message)
    );
  }

  /**
   * Broadcasts a message via WebSocket
   */
  private async broadcastMessage(message: IMessage): Promise<void> {
    const room = `${this.SOCKET_ROOM_PREFIX}${message.chatId}`;
    this.io.to(room).emit('new-message', message);
    
    // Notify other instances via Redis pub/sub
    await this.redisClient.publish(
      'message-updates',
      JSON.stringify({ type: 'new-message', message })
    );
  }

  /**
   * Tracks message delivery status
   */
  private async trackDeliveryStatus(status: DeliveryStatus): Promise<void> {
    const key = `delivery:${status.messageId}`;
    await this.redisClient.hset(key, {
      status: status.status,
      timestamp: status.timestamp.toISOString(),
      error: status.error || ''
    });
    await this.redisClient.expire(key, this.CACHE_TTL);
  }

  /**
   * Invalidates all message caches
   */
  private async invalidateMessageCaches(): Promise<void> {
    const pattern = 'messages:*';
    const keys = await this.redisClient.keys(pattern);
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
  }
}