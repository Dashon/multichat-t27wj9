/**
 * API Gateway Server Entry Point
 * Version: 1.0.0
 * 
 * Initializes and manages the API Gateway server with comprehensive production features
 * including health checks, graceful shutdown, and monitoring capabilities.
 */

import http from 'http'; // ^1.0.0
import pino from 'pino'; // ^8.0.0
import app from './app';

// Environment variables with strict validation
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SHUTDOWN_TIMEOUT = process.env.SHUTDOWN_TIMEOUT ? parseInt(process.env.SHUTDOWN_TIMEOUT, 10) : 10000;
const KEEP_ALIVE_TIMEOUT = process.env.KEEP_ALIVE_TIMEOUT ? parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10) : 120000;
const HEADERS_TIMEOUT = KEEP_ALIVE_TIMEOUT + 5000; // Additional 5s buffer

// Initialize production-grade logger
const logger = pino({
    level: NODE_ENV === 'production' ? 'info' : 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ level: label }),
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
});

// Track active connections for graceful shutdown
const activeConnections = new Set<http.Socket>();

/**
 * Creates and configures HTTP server with production optimizations
 */
function createServer(app: Express.Application): http.Server {
    const server = http.createServer(app);

    // Configure keep-alive behavior
    server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
    server.headersTimeout = HEADERS_TIMEOUT;

    // Track connections
    server.on('connection', (socket) => {
        activeConnections.add(socket);
        socket.once('close', () => {
            activeConnections.delete(socket);
        });
    });

    return server;
}

/**
 * Configures comprehensive health check endpoint
 */
function setupHealthCheck(server: http.Server): void {
    app.get('/health', (req, res) => {
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: NODE_ENV,
            metrics: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                connections: activeConnections.size,
            },
            version: process.env.npm_package_version,
        };

        res.json(healthStatus);
    });
}

/**
 * Configures graceful shutdown with connection draining
 */
function setupGracefulShutdown(server: http.Server): void {
    let isShuttingDown = false;

    async function gracefulShutdown(signal: string): Promise<void> {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`Received ${signal}. Starting graceful shutdown...`);

        // Stop accepting new connections
        server.close(() => {
            logger.info('HTTP server closed');
        });

        // Close all active connections
        activeConnections.forEach((socket) => {
            socket.end();
        });

        // Wait for connections to drain or timeout
        const shutdownTimeout = setTimeout(() => {
            logger.warn('Shutdown timeout reached, forcing exit');
            activeConnections.forEach((socket) => {
                socket.destroy();
            });
            process.exit(1);
        }, SHUTDOWN_TIMEOUT);

        try {
            // Wait for active connections to close
            while (activeConnections.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            clearTimeout(shutdownTimeout);
            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

/**
 * Initializes and starts the server with all production configurations
 */
async function startServer(): Promise<void> {
    try {
        const server = createServer(app);
        setupHealthCheck(server);
        setupGracefulShutdown(server);

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.fatal('Uncaught Exception:', error);
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection:', {
                reason,
                promise,
            });
        });

        // Start server
        server.listen(PORT, () => {
            logger.info('API Gateway started', {
                port: PORT,
                environment: NODE_ENV,
                nodeVersion: process.version,
                pid: process.pid,
            });
        });

        // Log startup metrics
        const startupMetrics = {
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            uptime: process.uptime(),
        };
        logger.info('Server startup metrics:', startupMetrics);

    } catch (error) {
        logger.fatal('Failed to start server:', error);
        process.exit(1);
    }
}

// Initialize server
startServer().catch((error) => {
    logger.fatal('Server initialization failed:', error);
    process.exit(1);
});

export { startServer };