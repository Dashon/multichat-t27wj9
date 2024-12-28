/**
 * API Gateway Routes Configuration
 * Version: 1.0.0
 * 
 * Defines comprehensive routing rules, service mappings, and middleware chains
 * for all microservices with enhanced security controls and monitoring.
 */

import { Router } from 'express'; // v4.18.0
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import { createLogger } from 'winston'; // v3.8.0
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';

// API Version and Base Path Configuration
export const API_VERSION = '/api/v1';

// Public Routes Configuration
export const PUBLIC_ROUTES = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/refresh'
];

// Rate Limiting Configuration
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

/**
 * Route Configuration Class
 * Manages route configurations and middleware chains with comprehensive security
 */
export class RouteConfig {
    private router: Router;
    private rateLimiter: RateLimiterMemory;
    private logger: ReturnType<typeof createLogger>;
    private serviceRoutes: Map<string, Router>;

    constructor() {
        this.router = Router();
        this.initializeRateLimiter();
        this.initializeLogger();
        this.serviceRoutes = new Map();
        this.setupBaseMiddleware();
    }

    /**
     * Initializes rate limiter with configurable thresholds
     */
    private initializeRateLimiter(): void {
        this.rateLimiter = new RateLimiterMemory({
            points: RATE_LIMIT_MAX,
            duration: RATE_LIMIT_WINDOW,
            blockDuration: RATE_LIMIT_WINDOW,
            keyPrefix: 'api_gateway'
        });
    }

    /**
     * Initializes Winston logger with custom configuration
     */
    private initializeLogger(): void {
        this.logger = createLogger({
            level: 'info',
            format: 'json',
            defaultMeta: { service: 'api-gateway-routes' }
        });
    }

    /**
     * Sets up base middleware chain for all routes
     */
    private setupBaseMiddleware(): void {
        // Security headers
        this.router.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });

        // Rate limiting
        this.router.use(async (req, res, next) => {
            try {
                await this.rateLimiter.consume(req.ip);
                next();
            } catch (error) {
                res.status(429).json({
                    status: 'error',
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests'
                });
            }
        });
    }

    /**
     * Configures message service routes with WebSocket support
     */
    public configureMessageRoutes(): Router {
        const messageRouter = Router();

        // Message CRUD endpoints
        messageRouter.post('/messages',
            authenticate,
            validateRequest('MessageCreateDTO'),
            this.createMessageHandler.bind(this)
        );

        messageRouter.get('/messages',
            authenticate,
            this.getMessagesHandler.bind(this)
        );

        messageRouter.get('/messages/:id',
            authenticate,
            this.getMessageByIdHandler.bind(this)
        );

        // WebSocket endpoints
        messageRouter.ws('/chat',
            authenticate,
            this.handleWebSocketConnection.bind(this)
        );

        this.serviceRoutes.set('messages', messageRouter);
        return messageRouter;
    }

    /**
     * Configures user service routes with role-based access
     */
    public configureUserRoutes(): Router {
        const userRouter = Router();

        // Authentication endpoints
        userRouter.post('/auth/login',
            validateRequest('LoginDTO'),
            this.loginHandler.bind(this)
        );

        userRouter.post('/auth/register',
            validateRequest('RegisterDTO'),
            this.registerHandler.bind(this)
        );

        // User management endpoints
        userRouter.get('/users/profile',
            authenticate,
            this.getUserProfileHandler.bind(this)
        );

        userRouter.put('/users/profile',
            authenticate,
            validateRequest('UpdateProfileDTO'),
            this.updateUserProfileHandler.bind(this)
        );

        this.serviceRoutes.set('users', userRouter);
        return userRouter;
    }

    /**
     * Configures AI service routes with context management
     */
    public configureAIRoutes(): Router {
        const aiRouter = Router();

        // AI agent endpoints
        aiRouter.post('/ai/query',
            authenticate,
            validateRequest('AIQueryDTO'),
            this.handleAIQuery.bind(this)
        );

        aiRouter.get('/ai/agents',
            authenticate,
            this.getAvailableAgentsHandler.bind(this)
        );

        // Context management endpoints
        aiRouter.post('/ai/context',
            authenticate,
            validateRequest('AIContextDTO'),
            this.updateAIContextHandler.bind(this)
        );

        this.serviceRoutes.set('ai', aiRouter);
        return aiRouter;
    }

    /**
     * Configures preference service routes with learning system
     */
    public configurePreferenceRoutes(): Router {
        const preferenceRouter = Router();

        // Preference management endpoints
        preferenceRouter.get('/preferences',
            authenticate,
            this.getUserPreferencesHandler.bind(this)
        );

        preferenceRouter.put('/preferences',
            authenticate,
            validateRequest('UpdatePreferencesDTO'),
            this.updateUserPreferencesHandler.bind(this)
        );

        // Learning system endpoints
        preferenceRouter.post('/preferences/learn',
            authenticate,
            validateRequest('LearnPreferencesDTO'),
            this.learnUserPreferencesHandler.bind(this)
        );

        this.serviceRoutes.set('preferences', preferenceRouter);
        return preferenceRouter;
    }

    /**
     * Creates service routes with security controls and monitoring
     */
    private createServiceRoutes(
        serviceName: string,
        basePath: string,
        options: any = {}
    ): Router {
        const serviceRouter = Router();
        const routePath = `${API_VERSION}${basePath}`;

        // Apply service-specific rate limiting
        const serviceRateLimiter = new RateLimiterMemory({
            points: options.rateLimit?.max || RATE_LIMIT_MAX,
            duration: options.rateLimit?.window || RATE_LIMIT_WINDOW,
            keyPrefix: `api_gateway_${serviceName}`
        });

        serviceRouter.use(async (req, res, next) => {
            try {
                await serviceRateLimiter.consume(req.ip);
                next();
            } catch (error) {
                res.status(429).json({
                    status: 'error',
                    code: 'SERVICE_RATE_LIMIT_EXCEEDED',
                    message: `Too many requests to ${serviceName} service`
                });
            }
        });

        // Apply authentication for protected routes
        if (!PUBLIC_ROUTES.includes(routePath)) {
            serviceRouter.use(authenticate);
        }

        return serviceRouter;
    }

    /**
     * Returns the configured router instance
     */
    public getRouter(): Router {
        return this.router;
    }
}

// Export configured routes
export const routes = {
    messageRoutes: new RouteConfig().configureMessageRoutes(),
    userRoutes: new RouteConfig().configureUserRoutes(),
    aiRoutes: new RouteConfig().configureAIRoutes(),
    preferenceRoutes: new RouteConfig().configurePreferenceRoutes()
};