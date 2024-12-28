/**
 * User Service Server Entry Point
 * Version: 1.0.0
 * 
 * Initializes and manages the Express server with comprehensive monitoring,
 * graceful shutdown, and security features. Implements requirements from
 * sections 2.2.1 Core Components and 7.3.2 Security Monitoring.
 */

import { config } from 'dotenv'; // v16.0.0
import * as promClient from 'prom-client'; // v14.0.0
import * as http from 'http';
import * as winston from 'winston'; // v3.8.0

import { app } from './app';
import { dataSource } from './config/database.config';

// Load environment variables
config();

// Initialize Prometheus metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
const Registry = promClient.Registry;
const register = new Registry();
collectDefaultMetrics({ register });

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

// Add console logging in non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

const activeConnections = new promClient.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections'
});
register.registerMetric(activeConnections);

/**
 * Initializes and starts the server with monitoring
 */
async function startServer(): Promise<void> {
  try {
    const PORT = process.env.PORT || 3000;
    const server = http.createServer(app);

    // Track connections
    server.on('connection', (socket) => {
      activeConnections.inc();
      socket.on('close', () => {
        activeConnections.dec();
      });
    });

    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });

    // Metrics endpoint
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        logger.error('Metrics collection failed:', error);
        res.status(500).end();
      }
    });

    // Health check endpoint
    let isShuttingDown = false;
    app.get('/health', (req, res) => {
      res.json({
        status: isShuttingDown ? 'shutting_down' : 'healthy',
        timestamp: new Date().toISOString(),
        database: dataSource.isInitialized,
        uptime: process.uptime()
      });
    });

    // Graceful shutdown handler
    async function handleShutdown(signal: string): Promise<void> {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      isShuttingDown = true;

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connection
          if (dataSource.isInitialized) {
            await dataSource.destroy();
            logger.info('Database connections closed');
          }

          // Clear metrics
          register.clear();
          logger.info('Metrics cleared');

          // Exit process
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, process.env.SHUTDOWN_TIMEOUT || 10000);
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      handleShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      handleShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Server initialization failed:', error);
    process.exit(1);
  }
}

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    logger.error('Server startup failed:', error);
    process.exit(1);
  });
}

export { startServer };