/**
 * @fileoverview Entry point for the message service server, responsible for bootstrapping
 * the application, initializing HTTP and WebSocket servers, and handling graceful shutdown.
 * Implements comprehensive monitoring and performance features.
 * @version 1.0.0
 */

// External imports
import http from 'http'; // node built-in
import dotenv from 'dotenv'; // v16.3.1
import winston from 'winston'; // v3.10.0

// Internal imports
import app from './app';
import { createWebSocketServer } from './config/websocket.config';

// Load environment variables
dotenv.config();

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10);

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'message-service' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Server state tracking
let httpServer: http.Server;
let isShuttingDown = false;
let activeConnections = new Set<any>();

/**
 * Starts the HTTP and WebSocket servers with enhanced monitoring
 */
async function startServer(): Promise<void> {
  try {
    // Create HTTP server
    httpServer = http.createServer(app);

    // Track active connections for graceful shutdown
    httpServer.on('connection', (connection) => {
      activeConnections.add(connection);
      connection.on('close', () => {
        activeConnections.delete(connection);
      });
    });

    // Initialize WebSocket server with sticky session support
    const io = await createWebSocketServer(httpServer);

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`Message service running on port ${PORT} in ${NODE_ENV} mode`);
      logger.info('WebSocket server initialized successfully');
    });

    // Server error handling
    httpServer.on('error', (error: Error) => {
      logger.error('Server error:', error);
      process.exit(1);
    });

    // Setup error handlers
    setupErrorHandlers();

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Handles graceful shutdown of servers and connections
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Create a shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Stop accepting new connections
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Close all active connections
    activeConnections.forEach((connection) => {
      connection.end();
    });

    // Wait for active connections to close
    const checkConnections = setInterval(() => {
      if (activeConnections.size === 0) {
        clearInterval(checkConnections);
        logger.info('All connections closed');
        clearTimeout(shutdownTimeout);
        process.exit(0);
      }
    }, 100);

  } catch (error) {
    logger.error('Error during shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

/**
 * Configures comprehensive error handling for the server
 */
function setupErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });

  // Handle termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle process warnings
  process.on('warning', (warning: Error) => {
    logger.warn('Process warning:', warning);
  });
}

// Start server if this is the main module
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Server startup error:', error);
    process.exit(1);
  });
}

// Export for testing
export { startServer, gracefulShutdown };