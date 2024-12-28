/**
 * @fileoverview WebSocket event handler implementation for real-time message handling
 * with enhanced delivery tracking, AI agent integration, and thread support.
 * @version 1.0.0
 */

// External imports
import { Socket } from 'socket.io'; // v4.7.2
import { injectable } from 'inversify'; // v6.0.1

// Internal imports
import { IMessage } from '../interfaces/message.interface';
import { MessageService } from '../services/message.service';

/**
 * Interface for delivery tracking
 */
interface DeliveryTracking {
  messageId: string;
  attempts: number;
  lastAttempt: Date;
  status: 'pending' | 'delivered' | 'failed';
  error?: string;
}

/**
 * Interface for retry queue item
 */
interface RetryQueueItem {
  message: IMessage;
  attempts: number;
  nextRetry: Date;
}

@injectable()
export class MessageEvents {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds
  private readonly retryQueue: Map<string, RetryQueueItem> = new Map();
  private readonly deliveryTracker: Map<string, DeliveryTracking> = new Map();
  private readonly SOCKET_ROOM_PREFIX = 'chat:';

  constructor(
    private readonly messageService: MessageService,
    private readonly io: Socket.Server
  ) {
    this.initializeRetryProcessor();
  }

  /**
   * Initializes WebSocket event handlers with enhanced delivery tracking
   */
  public initializeEvents(): void {
    this.io.on('connection', (socket: Socket) => {
      // Handle new message events
      socket.on('new-message', async (messageData: IMessage) => {
        try {
          await this.handleNewMessage(socket, messageData);
        } catch (error) {
          console.error('Error handling new message:', error);
          socket.emit('message-error', {
            messageId: messageData.id,
            error: 'Failed to process message'
          });
        }
      });

      // Handle message delivery acknowledgments
      socket.on('message-delivered', async (messageId: string) => {
        try {
          await this.handleMessageDelivery(socket, messageId);
        } catch (error) {
          console.error('Error handling message delivery:', error);
        }
      });

      // Handle chat room join events
      socket.on('join-chat', (chatId: string) => {
        socket.join(`${this.SOCKET_ROOM_PREFIX}${chatId}`);
      });

      // Handle chat room leave events
      socket.on('leave-chat', (chatId: string) => {
        socket.leave(`${this.SOCKET_ROOM_PREFIX}${chatId}`);
      });

      // Handle thread subscriptions
      socket.on('join-thread', (threadId: string) => {
        socket.join(`thread:${threadId}`);
      });

      // Handle disconnect events
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handles new message processing with delivery tracking and AI support
   */
  private async handleNewMessage(socket: Socket, messageData: IMessage): Promise<void> {
    try {
      // Initialize delivery tracking
      this.deliveryTracker.set(messageData.id, {
        messageId: messageData.id,
        attempts: 1,
        lastAttempt: new Date(),
        status: 'pending'
      });

      // Process message through service
      const processedMessage = await this.messageService.sendMessage(messageData);

      // Handle AI agent mentions if present
      if (processedMessage.metadata?.mentions?.length > 0) {
        await this.processAIAgentMentions(processedMessage);
      }

      // Broadcast to appropriate rooms
      const room = `${this.SOCKET_ROOM_PREFIX}${processedMessage.chatId}`;
      this.io.to(room).emit('message', processedMessage);

      // Handle thread-specific broadcasting
      if (processedMessage.threadId) {
        this.io.to(`thread:${processedMessage.threadId}`).emit('thread-message', processedMessage);
      }

      // Update delivery tracking
      this.deliveryTracker.set(messageData.id, {
        messageId: messageData.id,
        attempts: 1,
        lastAttempt: new Date(),
        status: 'delivered'
      });

      // Emit delivery confirmation
      socket.emit('message-sent', {
        messageId: processedMessage.id,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error processing message:', error);
      this.handleMessageFailure(messageData, error);
      throw error;
    }
  }

  /**
   * Handles message delivery acknowledgments and updates tracking
   */
  private async handleMessageDelivery(socket: Socket, messageId: string): Promise<void> {
    const tracking = this.deliveryTracker.get(messageId);
    if (!tracking) return;

    tracking.status = 'delivered';
    tracking.lastAttempt = new Date();
    this.deliveryTracker.set(messageId, tracking);

    // Remove from retry queue if present
    this.retryQueue.delete(messageId);

    // Broadcast delivery status
    const room = socket.rooms.values().next().value;
    if (room?.startsWith(this.SOCKET_ROOM_PREFIX)) {
      this.io.to(room).emit('message-status', {
        messageId,
        status: 'delivered',
        timestamp: new Date()
      });
    }
  }

  /**
   * Handles socket disconnection and cleanup
   */
  private handleDisconnect(socket: Socket): void {
    // Clean up room subscriptions
    socket.rooms.forEach(room => {
      if (room.startsWith(this.SOCKET_ROOM_PREFIX) || room.startsWith('thread:')) {
        socket.leave(room);
      }
    });

    // Update delivery tracking for pending messages
    this.deliveryTracker.forEach((tracking, messageId) => {
      if (tracking.status === 'pending') {
        this.handleMessageRetry(messageId);
      }
    });
  }

  /**
   * Processes AI agent mentions in messages
   */
  private async processAIAgentMentions(message: IMessage): Promise<void> {
    const aiMentions = message.metadata.mentions.filter(mention => mention.startsWith('@'));
    if (aiMentions.length === 0) return;

    try {
      await this.messageService.processAIAgentMention(message);
    } catch (error) {
      console.error('Error processing AI mentions:', error);
      // Continue processing - AI failure shouldn't block message delivery
    }
  }

  /**
   * Handles message delivery failures and retry logic
   */
  private handleMessageFailure(message: IMessage, error: Error): void {
    const tracking = this.deliveryTracker.get(message.id);
    if (!tracking) return;

    if (tracking.attempts < this.MAX_RETRY_ATTEMPTS) {
      this.retryQueue.set(message.id, {
        message,
        attempts: tracking.attempts,
        nextRetry: new Date(Date.now() + this.RETRY_DELAY)
      });
    } else {
      tracking.status = 'failed';
      tracking.error = error.message;
      this.deliveryTracker.set(message.id, tracking);

      // Notify room of permanent failure
      const room = `${this.SOCKET_ROOM_PREFIX}${message.chatId}`;
      this.io.to(room).emit('message-failed', {
        messageId: message.id,
        error: error.message
      });
    }
  }

  /**
   * Initializes the retry processor for failed messages
   */
  private initializeRetryProcessor(): void {
    setInterval(() => {
      const now = Date.now();
      this.retryQueue.forEach((item, messageId) => {
        if (item.nextRetry.getTime() <= now) {
          this.handleMessageRetry(messageId);
        }
      });
    }, this.RETRY_DELAY);
  }

  /**
   * Handles message retry attempts
   */
  private async handleMessageRetry(messageId: string): Promise<void> {
    const queueItem = this.retryQueue.get(messageId);
    if (!queueItem) return;

    try {
      await this.handleNewMessage(this.io, queueItem.message);
      this.retryQueue.delete(messageId);
    } catch (error) {
      queueItem.attempts++;
      queueItem.nextRetry = new Date(Date.now() + this.RETRY_DELAY);
      this.retryQueue.set(messageId, queueItem);
    }
  }
}