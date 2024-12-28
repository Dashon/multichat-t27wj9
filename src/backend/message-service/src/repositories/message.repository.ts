/**
 * @fileoverview Repository implementation for message persistence and retrieval operations.
 * Provides caching, transaction support, and specialized query patterns for real-time messaging.
 * @version 1.0.0
 */

import mongoose from 'mongoose'; // v7.x
import Redis from 'ioredis'; // v5.x
import { Injectable } from '@nestjs/common';
import { IMessage, MessageType } from '../interfaces/message.interface';
import { MessageModel } from '../models/message.model';

/**
 * Options for message pagination
 */
interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Options for AI context filtering
 */
interface AIContextFilter {
  agentId?: string;
  contextType?: string;
}

/**
 * Options for message archival
 */
interface ArchiveOptions {
  batchSize: number;
  deleteAfterArchive: boolean;
}

/**
 * Result of archive operation
 */
interface ArchiveResult {
  archivedCount: number;
  deletedCount: number;
  errors: Error[];
}

@Injectable()
export class MessageRepository {
  private readonly redis: Redis;
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'msg:';

  constructor(
    private readonly messageModel: typeof MessageModel,
    private readonly mongooseConnection: mongoose.Connection
  ) {
    // Initialize Redis client with error handling
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT, 10),
      retryStrategy: (times: number) => Math.min(times * 50, 2000)
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  /**
   * Creates a new message with transaction support
   */
  async createMessage(
    messageData: IMessage,
    options?: mongoose.TransactionOptions
  ): Promise<IMessage> {
    const session = options ? await this.mongooseConnection.startSession() : null;
    
    try {
      if (session) {
        session.startTransaction(options);
      }

      const message = new this.messageModel({
        ...messageData,
        timestamp: new Date(),
        schemaVersion: 1
      });

      await message.save({ session });

      if (session) {
        await session.commitTransaction();
      }

      // Invalidate relevant cache entries
      await this.invalidateMessageCache(messageData.chatId);

      return message.toObject();
    } catch (error) {
      if (session) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  /**
   * Retrieves messages for a chat with caching support
   */
  async findMessagesByChatId(
    chatId: string,
    options: PaginationOptions,
    aiFilter?: AIContextFilter
  ): Promise<IMessage[]> {
    const cacheKey = this.generateCacheKey(chatId, options, aiFilter);
    
    try {
      // Try cache first
      const cachedMessages = await this.redis.get(cacheKey);
      if (cachedMessages) {
        return JSON.parse(cachedMessages);
      }

      // Build query with AI context filtering if needed
      const query: any = { chatId, deleted: false };
      if (aiFilter?.agentId) {
        query['metadata.mentions'] = aiFilter.agentId;
      }
      if (aiFilter?.contextType) {
        query['metadata.aiContext.type'] = aiFilter.contextType;
      }

      // Execute query with proper indexing
      const messages = await this.messageModel
        .find(query)
        .sort({ timestamp: -1 })
        .skip(options.offset)
        .limit(options.limit)
        .lean();

      // Cache the results
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL_SECONDS,
        JSON.stringify(messages)
      );

      return messages;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }

  /**
   * Retrieves messages in a thread
   */
  async findMessagesByThreadId(
    threadId: string,
    options: PaginationOptions
  ): Promise<IMessage[]> {
    const cacheKey = `${this.CACHE_PREFIX}thread:${threadId}:${options.offset}:${options.limit}`;
    
    try {
      const cachedMessages = await this.redis.get(cacheKey);
      if (cachedMessages) {
        return JSON.parse(cachedMessages);
      }

      const messages = await this.messageModel.findByThreadId(threadId, options);
      
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL_SECONDS,
        JSON.stringify(messages)
      );

      return messages;
    } catch (error) {
      console.error('Error fetching thread messages:', error);
      throw error;
    }
  }

  /**
   * Archives messages older than the specified date
   */
  async archiveMessages(
    cutoffDate: Date,
    options: ArchiveOptions
  ): Promise<ArchiveResult> {
    const session = await this.mongooseConnection.startSession();
    const result: ArchiveResult = {
      archivedCount: 0,
      deletedCount: 0,
      errors: []
    };

    try {
      await session.withTransaction(async () => {
        const query = {
          timestamp: { $lt: cutoffDate },
          deleted: false
        };

        // Process in batches to avoid memory issues
        let processed = 0;
        while (true) {
          const messages = await this.messageModel
            .find(query)
            .limit(options.batchSize)
            .session(session);

          if (messages.length === 0) break;

          // Archive messages
          const archivePromises = messages.map(async (message) => {
            try {
              await this.messageModel.create(
                [{
                  ...message.toObject(),
                  _id: new mongoose.Types.ObjectId(),
                }],
                { session }
              );
              result.archivedCount++;

              if (options.deleteAfterArchive) {
                await message.updateOne(
                  { deleted: true, deletedAt: new Date() },
                  { session }
                );
                result.deletedCount++;
              }
            } catch (error) {
              result.errors.push(error);
            }
          });

          await Promise.all(archivePromises);
          processed += messages.length;
        }
      });

      return result;
    } finally {
      session.endSession();
    }
  }

  /**
   * Invalidates cache entries for a chat
   */
  private async invalidateMessageCache(chatId: string): Promise<void> {
    const pattern = `${this.CACHE_PREFIX}${chatId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Generates a cache key for message queries
   */
  private generateCacheKey(
    chatId: string,
    options: PaginationOptions,
    aiFilter?: AIContextFilter
  ): string {
    const filterString = aiFilter 
      ? `:${aiFilter.agentId || ''}:${aiFilter.contextType || ''}`
      : '';
    return `${this.CACHE_PREFIX}${chatId}:${options.offset}:${options.limit}${filterString}`;
  }
}