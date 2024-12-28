/**
 * @fileoverview Main application configuration for the message service.
 * Implements real-time messaging with WebSocket support, secure database connections,
 * and AI agent integration.
 * @version 1.0.0
 */

// External imports
import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import morgan from 'morgan'; // v1.10.0
import { createServer } from 'http';
import dotenv from 'dotenv'; // v16.3.1

// Internal imports
import { createDatabaseConnection } from './config/database.config';
import { createWebSocketServer } from './config/websocket.config';
import configureMessageRoutes from './routes/message.routes';
import configureThreadRoutes from './routes/thread.routes';

// Load environment variables
dotenv.config();

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_REQUEST_SIZE = process.env.MAX_REQUEST_SIZE || '1mb';
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW || 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || 100;

/**
 * Initializes and configures the Express application with comprehensive
 * security, monitoring, and performance optimizations
 */
export async function initializeApp(): Promise<Express> {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https:']
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Compression and parsing middleware
  app.use(compression());
  app.use(express.json({ limit: MAX_REQUEST_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_SIZE }));

  // Request logging
  if (NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  });

  // API routes
  app.use('/api/v1', configureMessageRoutes({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    message: 'Too many requests, please try again later'
  }));

  app.use('/api/v1', configureThreadRoutes({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    message: 'Too many requests, please try again later'
  }));

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Application error:', err);
    res.status(500).json({
      error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

/**
 * Starts the HTTP and WebSocket servers with proper error handling
 * and graceful shutdown
 */
export async function startServer(): Promise<void> {
  try {
    // Initialize Express app
    const app = await initializeApp();
    
    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize database connection
    await createDatabaseConnection();

    // Initialize WebSocket server
    const io = await createWebSocketServer(httpServer);

    // Start server
    httpServer.listen(PORT, () => {
      console.info(`Message service running on port ${PORT} in ${NODE_ENV} mode`);
      console.info('WebSocket server initialized');
    });

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.info('SIGTERM received. Starting graceful shutdown...');
      
      // Close HTTP server
      httpServer.close(() => {
        console.info('HTTP server closed');
      });

      // Close WebSocket connections
      io.close(() => {
        console.info('WebSocket server closed');
      });

      // Exit process
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this is the main module
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup error:', error);
    process.exit(1);
  });
}

// Export app for testing
export default initializeApp;