/**
 * API Gateway Main Application Configuration
 * Version: 1.0.0
 * 
 * Implements a secure, scalable REST API gateway with comprehensive middleware chain,
 * monitoring, and error handling capabilities.
 */

import express, { Express, Request, Response } from 'express'; // ^4.18.0
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^6.0.0
import compression from 'compression'; // ^1.7.4
import { corsOptions } from './config/cors.config';
import { 
    defaultRateLimitConfig, 
    authRateLimitConfig, 
    aiRateLimitConfig 
} from './config/rate-limit.config';
import { routes } from './config/routes.config';
import { authenticate } from './middleware/auth.middleware';
import { 
    errorHandler, 
    notFoundHandler 
} from './middleware/error.middleware';
import { 
    requestLoggingMiddleware, 
    responseLoggingMiddleware,
    logger 
} from './middleware/logging.middleware';

// Environment variables
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Express application
const app: Express = express();

/**
 * Configures and applies comprehensive middleware chain to Express application
 * with security, monitoring, and performance optimizations
 */
function configureMiddleware(app: Express): void {
    // Security middleware
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
                frameSrc: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: "same-site" },
        dnsPrefetchControl: true,
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        hsts: true,
        ieNoOpen: true,
        noSniff: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        xssFilter: true
    }));

    // CORS configuration
    app.use(cors(corsOptions));

    // Request parsing
    app.use(express.json({ 
        limit: '10kb',
        type: ['application/json', 'application/vnd.api+json']
    }));
    app.use(express.urlencoded({ 
        extended: true, 
        limit: '10kb' 
    }));

    // Compression
    app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req: Request) => {
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression.filter(req, req.res as Response);
        }
    }));

    // Logging middleware
    app.use(requestLoggingMiddleware);
    app.use(responseLoggingMiddleware);

    // Rate limiting
    app.use('/api/v1/auth', defaultRateLimitConfig);
    app.use('/api/v1/messages', authRateLimitConfig);
    app.use('/api/v1/ai', aiRateLimitConfig);
}

/**
 * Sets up versioned API routes with authentication, validation, and monitoring
 */
function configureRoutes(app: Express): void {
    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: NODE_ENV
        });
    });

    // API version prefix
    const apiPrefix = '/api/v1';

    // Mount service routes
    app.use(`${apiPrefix}/messages`, authenticate, routes.messageRoutes);
    app.use(`${apiPrefix}/users`, routes.userRoutes);
    app.use(`${apiPrefix}/ai`, authenticate, routes.aiRoutes);
    app.use(`${apiPrefix}/preferences`, authenticate, routes.preferenceRoutes);

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);
}

/**
 * Initializes and starts the Express server with error handling and logging
 */
async function startServer(app: Express): Promise<void> {
    try {
        // Configure middleware and routes
        configureMiddleware(app);
        configureRoutes(app);

        // Start server
        app.listen(PORT, () => {
            logger.info(`API Gateway started`, {
                port: PORT,
                environment: NODE_ENV,
                timestamp: new Date().toISOString()
            });
        });

        // Handle shutdown gracefully
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received. Starting graceful shutdown...');
            // Implement graceful shutdown logic here
            process.exit(0);
        });

    } catch (error) {
        logger.error('Failed to start API Gateway', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        process.exit(1);
    }
}

// Initialize server
startServer(app);

export default app;