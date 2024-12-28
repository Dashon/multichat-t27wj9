/**
 * @fileoverview Advanced utility module for managing test database cleanup operations
 * across MongoDB, PostgreSQL, and Redis stores with transaction safety and verification.
 * @version 1.0.0
 */

import mongoose from 'mongoose'; // ^7.x
import { Pool, PoolClient } from 'pg'; // ^8.x
import Redis from 'ioredis'; // ^5.x
import { getTestConfig, getDatabaseConfig } from '../config/test-config';
import { teardownTestEnvironment, logCleanupProgress } from './test-helpers';

// Types for cleanup operations
interface MongoCleanupOptions {
  dropCollections?: boolean;
  dropIndexes?: boolean;
  verifyCleanup?: boolean;
  timeout?: number;
  retryAttempts?: number;
}

interface PostgresCleanupOptions {
  truncateCascade?: boolean;
  resetSequences?: boolean;
  verifyCleanup?: boolean;
  timeout?: number;
}

interface RedisCleanupOptions {
  pattern?: string;
  batchSize?: number;
  verifyCleanup?: boolean;
  timeout?: number;
}

interface CleanupOptions {
  mongo?: MongoCleanupOptions;
  postgres?: PostgresCleanupOptions;
  redis?: RedisCleanupOptions;
  parallel?: boolean;
  timeout?: number;
}

interface CleanupResult {
  success: boolean;
  itemsRemoved: number;
  duration: number;
  errors?: string[];
  verificationStatus?: {
    verified: boolean;
    remainingItems: number;
  };
}

interface AllCleanupResults {
  mongo?: CleanupResult;
  postgres?: CleanupResult;
  redis?: CleanupResult;
  totalDuration: number;
  allSuccessful: boolean;
}

interface CleanupMetrics {
  startTime: number;
  endTime?: number;
  itemsProcessed: number;
  errors: string[];
  verificationAttempts: number;
}

/**
 * DatabaseCleaner class for managing coordinated database cleanup operations
 * with transaction safety, verification, and comprehensive logging.
 */
class DatabaseCleaner {
  private mongoConnection: mongoose.Connection | null = null;
  private pgPool: Pool | null = null;
  private redisClient: Redis | null = null;
  private metrics: CleanupMetrics;

  constructor(private config: any, private options: CleanupOptions = {}) {
    this.metrics = {
      startTime: Date.now(),
      itemsProcessed: 0,
      errors: [],
      verificationAttempts: 0
    };
  }

  /**
   * Initializes database connections based on configuration
   */
  private async initializeConnections(): Promise<void> {
    const dbConfig = await getDatabaseConfig();

    if (dbConfig.mongo) {
      this.mongoConnection = await mongoose.createConnection(dbConfig.mongo.uri);
    }

    if (dbConfig.postgres) {
      this.pgPool = new Pool(dbConfig.postgres);
    }

    if (dbConfig.redis) {
      this.redisClient = new Redis(dbConfig.redis);
    }
  }

  /**
   * Cleans up MongoDB collections with transaction safety
   */
  private async cleanupMongo(options: MongoCleanupOptions = {}): Promise<CleanupResult> {
    if (!this.mongoConnection) {
      throw new Error('MongoDB connection not initialized');
    }

    const startTime = Date.now();
    const result: CleanupResult = {
      success: false,
      itemsRemoved: 0,
      duration: 0,
      errors: []
    };

    const session = await this.mongoConnection.startSession();
    try {
      await session.withTransaction(async () => {
        const collections = await this.mongoConnection!.db.collections();
        
        for (const collection of collections) {
          try {
            if (options.dropIndexes) {
              await collection.dropIndexes();
            }
            await collection.deleteMany({});
            result.itemsRemoved += 1;
          } catch (error) {
            result.errors!.push(`Failed to clean collection ${collection.collectionName}: ${error.message}`);
          }
        }

        if (options.verifyCleanup) {
          const remainingDocs = await this.verifyMongoCleanup();
          result.verificationStatus = {
            verified: remainingDocs === 0,
            remainingItems: remainingDocs
          };
        }
      });

      result.success = true;
    } catch (error) {
      result.errors!.push(`MongoDB cleanup transaction failed: ${error.message}`);
    } finally {
      session.endSession();
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Cleans up PostgreSQL tables with cascade support
   */
  private async cleanupPostgres(options: PostgresCleanupOptions = {}): Promise<CleanupResult> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL connection not initialized');
    }

    const startTime = Date.now();
    const result: CleanupResult = {
      success: false,
      itemsRemoved: 0,
      duration: 0,
      errors: []
    };

    const client = await this.pgPool.connect();
    try {
      await client.query('BEGIN');

      // Get all tables in the public schema
      const tablesQuery = await client.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);

      for (const row of tablesQuery.rows) {
        try {
          const tableName = row.tablename;
          await client.query(`TRUNCATE TABLE "${tableName}" ${options.truncateCascade ? 'CASCADE' : ''}`);
          
          if (options.resetSequences) {
            await client.query(`ALTER SEQUENCE IF EXISTS "${tableName}_id_seq" RESTART WITH 1`);
          }
          
          result.itemsRemoved += 1;
        } catch (error) {
          result.errors!.push(`Failed to clean table ${row.tablename}: ${error.message}`);
        }
      }

      if (options.verifyCleanup) {
        const remainingRows = await this.verifyPostgresCleanup(client);
        result.verificationStatus = {
          verified: remainingRows === 0,
          remainingItems: remainingRows
        };
      }

      await client.query('COMMIT');
      result.success = true;
    } catch (error) {
      await client.query('ROLLBACK');
      result.errors!.push(`PostgreSQL cleanup transaction failed: ${error.message}`);
    } finally {
      client.release();
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Cleans up Redis keys with pattern matching
   */
  private async cleanupRedis(options: RedisCleanupOptions = {}): Promise<CleanupResult> {
    if (!this.redisClient) {
      throw new Error('Redis connection not initialized');
    }

    const startTime = Date.now();
    const result: CleanupResult = {
      success: false,
      itemsRemoved: 0,
      duration: 0,
      errors: []
    };

    try {
      const pattern = options.pattern || '*';
      const batchSize = options.batchSize || 1000;
      let cursor = '0';

      do {
        const [newCursor, keys] = await this.redisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          batchSize
        );
        
        cursor = newCursor;

        if (keys.length > 0) {
          await this.redisClient.del(...keys);
          result.itemsRemoved += keys.length;
        }
      } while (cursor !== '0');

      if (options.verifyCleanup) {
        const remainingKeys = await this.verifyRedisCleanup(pattern);
        result.verificationStatus = {
          verified: remainingKeys === 0,
          remainingItems: remainingKeys
        };
      }

      result.success = true;
    } catch (error) {
      result.errors!.push(`Redis cleanup failed: ${error.message}`);
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Verifies MongoDB cleanup completion
   */
  private async verifyMongoCleanup(): Promise<number> {
    let totalDocs = 0;
    const collections = await this.mongoConnection!.db.collections();
    
    for (const collection of collections) {
      totalDocs += await collection.countDocuments();
    }
    
    return totalDocs;
  }

  /**
   * Verifies PostgreSQL cleanup completion
   */
  private async verifyPostgresCleanup(client: PoolClient): Promise<number> {
    const result = await client.query(`
      SELECT SUM(n_live_tup) as total
      FROM pg_stat_user_tables
    `);
    
    return parseInt(result.rows[0].total) || 0;
  }

  /**
   * Verifies Redis cleanup completion
   */
  private async verifyRedisCleanup(pattern: string): Promise<number> {
    const [cursor, keys] = await this.redisClient!.scan('0', 'MATCH', pattern);
    return keys.length;
  }

  /**
   * Executes cleanup across all configured databases
   */
  public async cleanup(): Promise<AllCleanupResults> {
    const startTime = Date.now();
    const results: AllCleanupResults = {
      totalDuration: 0,
      allSuccessful: false
    };

    try {
      await this.initializeConnections();

      if (this.options.parallel) {
        // Parallel cleanup
        const cleanupPromises: Promise<void>[] = [];

        if (this.mongoConnection) {
          cleanupPromises.push(
            this.cleanupMongo(this.options.mongo).then(r => results.mongo = r)
          );
        }

        if (this.pgPool) {
          cleanupPromises.push(
            this.cleanupPostgres(this.options.postgres).then(r => results.postgres = r)
          );
        }

        if (this.redisClient) {
          cleanupPromises.push(
            this.cleanupRedis(this.options.redis).then(r => results.redis = r)
          );
        }

        await Promise.all(cleanupPromises);
      } else {
        // Sequential cleanup
        if (this.mongoConnection) {
          results.mongo = await this.cleanupMongo(this.options.mongo);
        }

        if (this.pgPool) {
          results.postgres = await this.cleanupPostgres(this.options.postgres);
        }

        if (this.redisClient) {
          results.redis = await this.cleanupRedis(this.options.redis);
        }
      }

      results.totalDuration = Date.now() - startTime;
      results.allSuccessful = this.validateCleanupResults(results);

      await this.closeConnections();
      return results;
    } catch (error) {
      throw new Error(`Database cleanup failed: ${error.message}`);
    }
  }

  /**
   * Validates cleanup results across all databases
   */
  private validateCleanupResults(results: AllCleanupResults): boolean {
    return Object.values(results)
      .filter(r => typeof r === 'object')
      .every((r: any) => r.success && (!r.verificationStatus || r.verificationStatus.verified));
  }

  /**
   * Closes all database connections
   */
  private async closeConnections(): Promise<void> {
    if (this.mongoConnection) {
      await this.mongoConnection.close();
    }
    if (this.pgPool) {
      await this.pgPool.end();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

/**
 * Utility function to clean up all configured databases
 */
export async function cleanupAllDatabases(options: CleanupOptions = {}): Promise<AllCleanupResults> {
  const config = getTestConfig('unit');
  const cleaner = new DatabaseCleaner(config, options);
  return cleaner.cleanup();
}

// Export the DatabaseCleaner class for more granular control
export default DatabaseCleaner;