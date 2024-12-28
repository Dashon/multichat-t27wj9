import mongoose from 'mongoose'; // v7.x
import dotenv from 'dotenv'; // v16.x

// Load environment variables
dotenv.config();

/**
 * Interface defining comprehensive MongoDB configuration options
 * including sharding, replication, and indexing strategies
 */
export interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
  shardKey: { [key: string]: 1 | -1 };
  replicaSet: {
    enabled: boolean;
    name: string;
    readPreference: string;
    readConcern: string;
    writeConcern: {
      w: string | number;
      j: boolean;
      wtimeout: number;
    };
    heartbeatFrequencyMS: number;
  };
  indexes: Array<{
    fields: { [key: string]: 1 | -1 };
    options: mongoose.IndexOptions;
  }>;
}

/**
 * Returns environment-specific MongoDB configuration with optimized settings
 * for sharding, replication, and performance
 */
export function getDatabaseConfig(): DatabaseConfig {
  const environment = process.env.NODE_ENV || 'development';
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/messages';

  const baseConfig: DatabaseConfig = {
    uri,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 100,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: 'majority',
      readPreference: 'secondaryPreferred',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority', j: true, wtimeout: 5000 }
    },
    shardKey: { chatId: 1 },
    replicaSet: {
      enabled: true,
      name: 'msg-replica-set',
      readPreference: 'secondaryPreferred',
      readConcern: 'majority',
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 5000
      },
      heartbeatFrequencyMS: 2000
    },
    indexes: [
      {
        fields: { chatId: 1, timestamp: -1 },
        options: { background: true }
      },
      {
        fields: { threadId: 1, timestamp: 1 },
        options: { background: true }
      },
      {
        fields: { senderId: 1, chatId: 1 },
        options: { background: true }
      }
    ]
  };

  // Environment-specific configurations
  switch (environment) {
    case 'production':
      return {
        ...baseConfig,
        options: {
          ...baseConfig.options,
          maxPoolSize: 200,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 60000
        }
      };
    case 'staging':
      return {
        ...baseConfig,
        options: {
          ...baseConfig.options,
          maxPoolSize: 150
        }
      };
    default:
      return baseConfig;
  }
}

/**
 * Creates and configures MongoDB connection with comprehensive error handling,
 * connection pooling, and event monitoring
 */
export async function createDatabaseConnection(): Promise<mongoose.Connection> {
  const config = getDatabaseConfig();

  // Configure mongoose connection
  mongoose.set('strictQuery', true);

  try {
    // Initialize connection
    await mongoose.connect(config.uri, config.options);
    const connection = mongoose.connection;

    // Connection event handlers
    connection.on('connected', () => {
      console.info('MongoDB connection established successfully');
    });

    connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      process.exit(1);
    });

    connection.on('disconnected', () => {
      console.warn('MongoDB connection disconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await connection.close();
        console.info('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        console.error('Error during MongoDB connection closure:', err);
        process.exit(1);
      }
    });

    // Configure indexes
    for (const index of config.indexes) {
      await connection.collection('messages').createIndex(
        index.fields,
        index.options
      );
    }

    // Verify sharding status if enabled
    if (environment !== 'development') {
      const adminDb = connection.db.admin();
      const shardStatus = await adminDb.command({ listShards: 1 });
      console.info('Sharding status:', shardStatus);
    }

    return connection;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}