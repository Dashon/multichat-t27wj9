/**
 * @fileoverview Thread repository implementation with caching and transaction support.
 * Provides optimized data access patterns for thread management.
 * @version 1.0.0
 */

// External imports
import mongoose from 'mongoose'; // v7.x
import Redis from 'ioredis'; // v5.x
import { Injectable } from '@nestjs/common'; // v9.x

// Internal imports
import { IThread, ThreadStatus, ThreadMetadata } from '../interfaces/thread.interface';
import { ThreadModel } from '../models/thread.model';
import { DatabaseConfig } from '../config/database.config';

/**
 * Interface for pagination response
 */
interface PaginatedThreads {
  threads: IThread[];
  total: number;
  hasMore: boolean;
}

/**
 * Interface for thread cache options
 */
interface ThreadCacheOptions {
  ttl: number;
  prefix: string;
}

/**
 * Repository class for thread-related database operations
 * Implements caching and transaction support for optimal performance
 */
@Injectable()
export class ThreadRepository {
  private readonly redis: Redis;
  private readonly cacheOptions: ThreadCacheOptions = {
    ttl: 3600, // 1 hour cache TTL
    prefix: 'thread:'
  };

  constructor(
    private readonly threadModel: typeof ThreadModel,
    private readonly dbConfig: DatabaseConfig
  ) {
    // Initialize Redis connection with config
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });

    // Handle Redis connection events
    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });
  }

  /**
   * Creates a new thread with transaction support
   * @param threadData Partial thread data
   * @param session Optional mongoose session for transactions
   * @returns Newly created thread
   */
  async createThread(
    threadData: Partial<IThread>,
    session?: mongoose.ClientSession
  ): Promise<IThread> {
    const useTransaction = !session;
    let threadSession = session;

    try {
      // Start transaction if not provided
      if (useTransaction) {
        threadSession = await mongoose.startSession();
        threadSession.startTransaction();
      }

      // Create and save thread document
      const thread = new this.threadModel({
        ...threadData,
        metadata: {
          status: ThreadStatus.ACTIVE,
          participantIds: threadData.metadata?.participantIds || [],
          lastActivityAt: new Date(),
          messageCount: 0
        }
      });

      const savedThread = await thread.save({ session: threadSession });

      // Commit transaction if we started it
      if (useTransaction) {
        await threadSession.commitTransaction();
      }

      // Cache the new thread
      await this.cacheThread(savedThread);

      return savedThread.toObject();
    } catch (error) {
      // Rollback transaction if we started it
      if (useTransaction && threadSession) {
        await threadSession.abortTransaction();
      }
      throw error;
    } finally {
      // End session if we started it
      if (useTransaction && threadSession) {
        threadSession.endSession();
      }
    }
  }

  /**
   * Retrieves paginated threads for a chat with caching
   * @param chatId Chat identifier
   * @param options Pagination options
   * @returns Paginated thread results
   */
  async findThreadsByChatId(
    chatId: string,
    options: { limit: number; offset: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }
  ): Promise<PaginatedThreads> {
    const cacheKey = `${this.cacheOptions.prefix}chat:${chatId}:${JSON.stringify(options)}`;

    try {
      // Try to get from cache first
      const cachedResult = await this.redis.get(cacheKey);
      if (cachedResult) {
        return JSON.parse(cachedResult);
      }

      // Query database with pagination
      const threads = await this.threadModel.findByChatId(chatId, options);
      const total = await this.threadModel.countDocuments({ chatId });

      const result: PaginatedThreads = {
        threads,
        total,
        hasMore: total > (options.offset + options.limit)
      };

      // Cache the results
      await this.redis.setex(
        cacheKey,
        this.cacheOptions.ttl,
        JSON.stringify(result)
      );

      return result;
    } catch (error) {
      console.error('Error finding threads by chatId:', error);
      throw error;
    }
  }

  /**
   * Updates thread status with optimistic locking
   * @param threadId Thread identifier
   * @param status New thread status
   * @returns Updated thread
   */
  async updateThreadStatus(
    threadId: string,
    status: ThreadStatus
  ): Promise<IThread> {
    try {
      const updatedThread = await this.threadModel.updateThreadStatus(threadId, status);
      
      // Invalidate cache
      await this.invalidateThreadCache(threadId);
      
      return updatedThread;
    } catch (error) {
      console.error('Error updating thread status:', error);
      throw error;
    }
  }

  /**
   * Retrieves a thread by its parent message ID with caching
   * @param parentMessageId Parent message identifier
   * @returns Thread or null if not found
   */
  async findByParentMessageId(parentMessageId: string): Promise<IThread | null> {
    const cacheKey = `${this.cacheOptions.prefix}parent:${parentMessageId}`;

    try {
      // Try cache first
      const cachedThread = await this.redis.get(cacheKey);
      if (cachedThread) {
        return JSON.parse(cachedThread);
      }

      // Query database
      const thread = await this.threadModel.findByParentMessageId(parentMessageId);
      
      if (thread) {
        // Cache the result
        await this.redis.setex(
          cacheKey,
          this.cacheOptions.ttl,
          JSON.stringify(thread)
        );
      }

      return thread;
    } catch (error) {
      console.error('Error finding thread by parent message:', error);
      throw error;
    }
  }

  /**
   * Caches a thread object
   * @param thread Thread to cache
   */
  private async cacheThread(thread: IThread): Promise<void> {
    const cacheKey = `${this.cacheOptions.prefix}${thread.id}`;
    await this.redis.setex(
      cacheKey,
      this.cacheOptions.ttl,
      JSON.stringify(thread)
    );
  }

  /**
   * Invalidates thread cache entries
   * @param threadId Thread identifier
   */
  private async invalidateThreadCache(threadId: string): Promise<void> {
    const cacheKey = `${this.cacheOptions.prefix}${threadId}`;
    await this.redis.del(cacheKey);
    
    // Also invalidate related chat list caches
    const pattern = `${this.cacheOptions.prefix}chat:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup(): Promise<void> {
    await this.redis.quit();
  }
}