/**
 * User Service Application Configuration
 * Version: 1.0.0
 * 
 * Implements secure Express server configuration with comprehensive middleware stack,
 * database integration, and enterprise-grade security features.
 * Addresses requirements from sections 2.2.1 Core Components and 7.3 Security Protocols.
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.0
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import morgan from 'morgan'; // v1.10.0
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v6.9.0
import { validationResult } from 'express-validator'; // v7.0.0
import fs from 'fs';
import https from 'https';
import { Server } from 'http';

import { authConfig } from './config/auth.config';
import { dataSource } from './config/database.config';
import { configureAuthRoutes } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';

/**
 * Initializes Express application with comprehensive security middleware
 * and enterprise-grade configuration
 */
async function initializeApp(): Promise<Express> {
  const app = express();

  // Security middleware configuration
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }));

  // CORS configuration with whitelist
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || authConfig.corsWhitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400, // 24 hours
  }));

  // Request parsing and compression
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use(compression());

  // Rate limiting configuration
  const apiLimiter = rateLimit({
    windowMs: authConfig.rateLimitConfig.windowMs,
    max: authConfig.rateLimitConfig.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil(authConfig.rateLimitConfig.windowMs / 1000)
      });
    }
  });
  app.use('/api/', apiLimiter);

  // Audit logging configuration
  app.use(morgan('combined', {
    skip: (req: Request) => req.path === '/health',
    stream: fs.createWriteStream('./logs/access.log', { flags: 'a' })
  }));

  // Database initialization with retry logic
  try {
    await dataSource.initialize();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dataSource.isInitialized
    });
  });

  // Route configuration
  app.use('/api/auth', configureAuthRoutes());
  app.use('/api/users', userRouter);

  // Global error handling
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', {
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Internal server error',
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

/**
 * Starts the server with SSL support and graceful shutdown
 */
async function startServer(app: Express): Promise<Server> {
  const port = process.env.PORT || 3000;
  let server: Server;

  // Configure SSL if certificates are available
  if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
    const sslOptions = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH)
    };
    server = https.createServer(sslOptions, app);
  } else {
    server = app.listen(port);
  }

  // Configure keep-alive
  server.keepAliveTimeout = 120000; // 2 minutes
  server.headersTimeout = 120000; // 2 minutes

  // Start listening
  server.listen(port, () => {
    console.log(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
  });

  return server;
}

/**
 * Implements graceful shutdown with cleanup
 */
async function gracefulShutdown(server: Server): Promise<void> {
  console.log('Initiating graceful shutdown...');

  // Stop accepting new connections
  server.close(async () => {
    try {
      // Close database connections
      if (dataSource.isInitialized) {
        await dataSource.destroy();
        console.log('Database connections closed');
      }

      // Cleanup other resources
      console.log('Cleanup complete, shutting down...');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000); // 30 seconds timeout
}

// Initialize and start server
if (require.main === module) {
  (async () => {
    try {
      const app = await initializeApp();
      const server = await startServer(app);

      // Register shutdown handlers
      process.on('SIGTERM', () => gracefulShutdown(server));
      process.on('SIGINT', () => gracefulShutdown(server));
    } catch (error) {
      console.error('Server initialization failed:', error);
      process.exit(1);
    }
  })();
}

// Export for testing
export { initializeApp, startServer, gracefulShutdown };