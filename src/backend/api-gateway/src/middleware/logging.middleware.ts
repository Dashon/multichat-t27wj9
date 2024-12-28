import express, { Request, Response, NextFunction } from 'express';
import winston, { Logger, format } from 'winston'; // v3.8.0
import morgan from 'morgan'; // v1.10.0
import { createNamespace, getNamespace } from 'cls-hooked'; // v4.2.0
import { v4 as uuidv4 } from 'uuid';

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FORMAT = process.env.LOG_FORMAT || 'json';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);

// Create request context namespace
const requestContextNamespace = createNamespace('request-context');

/**
 * Enhanced request context class for tracking request-specific data and metrics
 */
export class RequestContext {
    public readonly correlationId: string;
    public readonly userId: string;
    public readonly requestPath: string;
    public readonly requestMethod: string;
    public readonly timestamp: Date;
    public performanceMetrics: Record<string, number>;
    public securityMetrics: Record<string, any>;

    constructor(
        correlationId: string,
        userId: string,
        requestPath: string,
        requestMethod: string
    ) {
        this.correlationId = correlationId;
        this.userId = userId;
        this.requestPath = requestPath;
        this.requestMethod = requestMethod;
        this.timestamp = new Date();
        this.performanceMetrics = {};
        this.securityMetrics = {
            suspicious: false,
            rateExceeded: false,
            validationErrors: []
        };
    }

    /**
     * Converts context to ELK-compatible JSON format
     */
    toJSON(): object {
        return {
            correlationId: this.correlationId,
            userId: this.userId,
            requestPath: this.requestPath,
            requestMethod: this.requestMethod,
            timestamp: this.timestamp.toISOString(),
            performanceMetrics: this.performanceMetrics,
            securityMetrics: this.securityMetrics
        };
    }

    /**
     * Adds performance metric to the context
     */
    addPerformanceMetric(metricName: string, value: number): void {
        if (!metricName || typeof value !== 'number') {
            throw new Error('Invalid performance metric');
        }
        this.performanceMetrics[metricName] = value;
    }
}

/**
 * Creates and configures Winston logger instance with ELK Stack integration
 */
export const createLogger = (): Logger => {
    const loggerOptions = {
        level: LOG_LEVEL,
        format: format.combine(
            format.timestamp(),
            format.errors({ stack: true }),
            LOG_FORMAT === 'json' ? format.json() : format.simple()
        ),
        defaultMeta: { service: 'api-gateway' },
        transports: [
            new winston.transports.Console({
                format: format.combine(
                    format.colorize(),
                    format.printf(({ timestamp, level, message, ...meta }) => {
                        return `${timestamp} ${level}: ${message} ${JSON.stringify(meta)}`;
                    })
                )
            })
        ]
    };

    // Add file transport in production
    if (NODE_ENV === 'production') {
        loggerOptions.transports.push(
            new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
                maxFiles: LOG_RETENTION_DAYS,
                maxsize: 5242880, // 5MB
                tailable: true
            }),
            new winston.transports.File({
                filename: 'logs/combined.log',
                maxFiles: LOG_RETENTION_DAYS,
                maxsize: 5242880,
                tailable: true
            })
        );
    }

    return winston.createLogger(loggerOptions);
};

export const logger = createLogger();

/**
 * Express middleware for logging HTTP requests with security and performance tracking
 */
export const requestLoggingMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    const userId = req.headers['x-user-id'] as string || 'anonymous';

    requestContextNamespace.run(() => {
        const context = new RequestContext(
            correlationId,
            userId,
            req.path,
            req.method
        );

        // Store context in namespace
        requestContextNamespace.set('context', context);

        // Add request start time for performance tracking
        context.addPerformanceMetric('requestStartTime', Date.now());

        // Basic security checks
        const suspicious = req.headers['user-agent'] === undefined || 
                         req.headers['host'] === undefined;
        context.securityMetrics.suspicious = suspicious;

        // Log sanitized request details
        logger.info('Incoming request', {
            context: context.toJSON(),
            headers: {
                'user-agent': req.headers['user-agent'],
                'content-type': req.headers['content-type']
            },
            query: req.query,
            body: sanitizeRequestBody(req.body)
        });

        next();
    });
};

/**
 * Express middleware for logging HTTP responses with metrics
 */
export const responseLoggingMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const context = requestContextNamespace.get('context') as RequestContext;
    
    if (!context) {
        logger.error('Response logging failed: No request context found');
        next();
        return;
    }

    // Calculate response time
    const startTime = context.performanceMetrics.requestStartTime;
    const responseTime = Date.now() - startTime;
    context.addPerformanceMetric('responseTime', responseTime);

    // Capture response
    const originalSend = res.send;
    res.send = function(body: any): Response {
        // Log response details
        logger.info('Outgoing response', {
            context: context.toJSON(),
            statusCode: res.statusCode,
            responseTime,
            responseSize: Buffer.byteLength(JSON.stringify(body)),
            body: sanitizeResponseBody(body)
        });

        return originalSend.call(this, body);
    };

    next();
};

/**
 * Sanitizes request body for logging by removing sensitive data
 */
function sanitizeRequestBody(body: any): any {
    if (!body) return body;
    
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'creditCard'];
    
    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    });
    
    return sanitized;
}

/**
 * Sanitizes response body for logging by removing sensitive data
 */
function sanitizeResponseBody(body: any): any {
    if (!body) return body;
    
    // If body is string, try to parse it as JSON
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            return body;
        }
    }
    
    return sanitizeRequestBody(body);
}