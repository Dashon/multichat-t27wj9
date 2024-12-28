/**
 * Database Configuration
 * Version: 1.0.0
 * 
 * Implements secure PostgreSQL database configuration with master-slave replication,
 * connection pooling, and enhanced security features using TypeORM.
 * Addresses requirements from sections 3.2.1 Schema Design and 7.2.1 Encryption Standards.
 */

import { DataSource, DataSourceOptions } from 'typeorm'; // v0.3+
import { config } from 'dotenv'; // v16.0+
import { UserEntity } from '../models/user.model';

// Load environment variables
config();

/**
 * Enhanced database configuration with security, replication, and performance optimizations
 * Implements master-slave replication architecture from section 2.2.2 Data Stores
 */
export const databaseConfig: DataSourceOptions = {
  type: 'postgres',
  
  // Master-slave replication configuration
  replication: {
    master: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT!, 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    },
    slaves: process.env.DB_REPLICA_HOSTS?.split(',').map(host => ({
      host,
      port: parseInt(process.env.DB_PORT!, 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    })) || [],
  },

  // Enhanced SSL configuration for secure connections
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA,
    checkServerIdentity: true,
  },

  // Entity configuration
  entities: [UserEntity],
  synchronize: process.env.NODE_ENV !== 'production',

  // Logging configuration for monitoring and debugging
  logging: ['query', 'error', 'schema'],
  logger: 'advanced-console',

  // Connection pool configuration for optimal performance
  extra: {
    // Maximum number of clients in the pool
    max: 20,
    
    // Connection timeout configurations
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    
    // Query timeout configurations
    statement_timeout: 10000,
    query_timeout: 10000,
    
    // Application name for monitoring
    application_name: 'user-service',
    
    // Connection resilience settings
    fallback: true,
    keepAlive: true,
    poolSize: 20,
  },

  // Query result caching configuration using Redis
  cache: {
    duration: 30000, // 30 seconds
    type: 'redis',
    options: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
  },

  // Performance and reliability settings
  maxQueryExecutionTime: 1000, // Log slow queries (>1s)
  connectTimeoutMS: 10000,     // Connection timeout
  retryAttempts: 3,           // Number of connection retry attempts
  retryDelay: 3000,           // Delay between retry attempts
  migrationsRun: true,        // Auto-run migrations
};

/**
 * TypeORM DataSource instance with enhanced configuration
 * Provides database connection management and query execution
 */
export const dataSource = new DataSource(databaseConfig);

/**
 * Initialize database connection with error handling
 * @returns Promise<void>
 */
export async function initializeDatabase(): Promise<void> {
  try {
    await dataSource.initialize();
    console.log('Database connection initialized successfully');
  } catch (error) {
    console.error('Error initializing database connection:', error);
    throw error;
  }
}

/**
 * Gracefully close database connection
 * @returns Promise<void>
 */
export async function closeDatabase(): Promise<void> {
  try {
    await dataSource.destroy();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
  }
}