import { Request, Response, NextFunction } from 'express'; // v4.18.0
import { Logger } from 'winston'; // v3.8.0
import { RequestContext } from './logging.middleware';

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const ERROR_MONITORING_ENABLED = process.env.ERROR_MONITORING_ENABLED === 'true';

/**
 * Custom HTTP Error class with enhanced tracking capabilities
 */
export class HttpError extends Error {
    public readonly statusCode: number;
    public readonly details: Record<string, any>;
    public readonly errorCode: string;
    public readonly isOperational: boolean;
    public readonly timestamp: Date;

    constructor(
        statusCode: number,
        message: string,
        details?: Record<string, any>,
        errorCode?: string,
        isOperational: boolean = true
    ) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.details = details || {};
        this.errorCode = errorCode || `HTTP_${statusCode}`;
        this.isOperational = isOperational;
        this.timestamp = new Date();
        Error.captureStackTrace(this, HttpError);
    }
}

/**
 * Error severity levels for monitoring and alerting
 */
enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * Determines error severity based on status code and operational status
 */
function getErrorSeverity(error: HttpError): ErrorSeverity {
    if (!error.isOperational) return ErrorSeverity.CRITICAL;
    
    if (error.statusCode >= 500) return ErrorSeverity.HIGH;
    if (error.statusCode >= 400) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
}

/**
 * Main error handling middleware with comprehensive error processing and monitoring
 */
export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // Get request context for error tracking
    const context = (req as any).requestContext as RequestContext;
    
    // Convert to HttpError if needed
    const httpError = error instanceof HttpError ? error : new HttpError(
        500,
        'Internal Server Error',
        { originalError: error.message },
        'INTERNAL_ERROR',
        false
    );

    // Determine error severity
    const severity = getErrorSeverity(httpError);

    // Update security metrics if applicable
    if (context) {
        context.securityMetrics.lastError = {
            timestamp: httpError.timestamp,
            errorCode: httpError.errorCode,
            severity
        };
    }

    // Log error with appropriate level and context
    const logMessage = {
        message: httpError.message,
        errorCode: httpError.errorCode,
        stack: httpError.stack,
        severity,
        context: context?.toJSON(),
        details: httpError.details
    };

    if (severity === ErrorSeverity.CRITICAL) {
        logger.error('Critical error occurred', logMessage);
        // Trigger alerts for critical errors
        triggerErrorAlert(httpError, context);
    } else if (severity === ErrorSeverity.HIGH) {
        logger.error('Error occurred', logMessage);
    } else {
        logger.warn('Warning occurred', logMessage);
    }

    // Format error response based on environment
    const errorResponse = {
        status: 'error',
        code: httpError.errorCode,
        message: httpError.message,
        ...(NODE_ENV === 'development' && {
            details: httpError.details,
            stack: httpError.stack
        })
    };

    // Send error response
    res.status(httpError.statusCode).json(errorResponse);
};

/**
 * Middleware for handling 404 Not Found errors with tracking
 */
export const notFoundHandler = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const notFoundError = new HttpError(
        404,
        'Resource not found',
        {
            path: req.path,
            method: req.method
        },
        'NOT_FOUND'
    );

    next(notFoundError);
};

/**
 * Triggers alerts for critical errors based on severity and threshold
 */
function triggerErrorAlert(error: HttpError, context?: RequestContext): void {
    if (!ERROR_MONITORING_ENABLED) return;

    // Implement alert logic here based on error severity and context
    // This could integrate with external monitoring systems
    const alertData = {
        timestamp: error.timestamp,
        errorCode: error.errorCode,
        message: error.message,
        severity: getErrorSeverity(error),
        context: context?.toJSON()
    };

    // Log alert for monitoring systems
    logger.error('Error alert triggered', alertData);
}

// Import logger instance from logging middleware
import { logger } from './logging.middleware';