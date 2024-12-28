import { Request, Response, NextFunction } from 'express'; // v4.18.0
import { validate, ValidationError } from 'class-validator'; // v0.14.0
import { plainToClass } from 'class-transformer'; // v0.5.1
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import { HttpError } from './error.middleware';
import { logger, RequestContext } from './logging.middleware';

// Environment configuration
const VALIDATION_CACHE_TTL = parseInt(process.env.VALIDATION_CACHE_TTL || '300', 10); // 5 minutes
const VALIDATION_RATE_LIMIT = parseInt(process.env.VALIDATION_RATE_LIMIT || '1000', 10); // per minute
const VALIDATION_TIMEOUT = parseInt(process.env.VALIDATION_TIMEOUT || '100', 10); // 100ms target

// Rate limiter for validation requests
const validationRateLimiter = new RateLimiter({
    points: VALIDATION_RATE_LIMIT,
    duration: 60,
    blockDuration: 60,
    keyPrefix: 'validation'
});

// Validation patterns for security monitoring
const SUSPICIOUS_PATTERNS = {
    SQL_INJECTION: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)|(-{2})|(\b(OR|AND)\b\s+\d+\s*[=<>])/i,
    XSS: /<[^>]*>|javascript:|data:/i,
    PATH_TRAVERSAL: /\.{2}[\/\\]/,
    COMMAND_INJECTION: /\b(cmd|powershell|bash|sh|wget|curl)\b/i
};

/**
 * Interface for validation options
 */
interface ValidationOptions {
    skipMissingProperties?: boolean;
    whitelist?: boolean;
    forbidNonWhitelisted?: boolean;
    forbidUnknownValues?: boolean;
    validationTimeout?: number;
}

/**
 * Enhanced validation middleware factory for request body validation
 */
export function validateRequest(ClassType: any, options: ValidationOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const startTime = Date.now();
        const context = (req as any).requestContext as RequestContext;

        try {
            // Check rate limiting
            await validationRateLimiter.consume(req.ip);

            // Transform request body to class instance
            const input = plainToClass(ClassType, req.body);

            // Validate with timeout
            const errors = await Promise.race([
                validate(input, {
                    skipMissingProperties: options.skipMissingProperties ?? false,
                    whitelist: options.whitelist ?? true,
                    forbidNonWhitelisted: options.forbidNonWhitelisted ?? true,
                    forbidUnknownValues: options.forbidUnknownValues ?? true
                }),
                new Promise<ValidationError[]>((_, reject) => 
                    setTimeout(() => reject(new Error('Validation timeout')), 
                    options.validationTimeout ?? VALIDATION_TIMEOUT)
                )
            ]);

            // Check for security patterns
            const securityIssues = checkSecurityPatterns(req.body);
            
            if (securityIssues.length > 0) {
                throw new HttpError(400, 'Security validation failed', {
                    issues: securityIssues
                }, 'SECURITY_VALIDATION_FAILED');
            }

            if (errors.length > 0) {
                // Track validation failures
                if (context) {
                    context.securityMetrics.validationErrors.push({
                        timestamp: new Date(),
                        errors: errors.map(e => ({
                            property: e.property,
                            constraints: e.constraints
                        }))
                    });
                }

                throw new HttpError(400, 'Validation failed', {
                    errors: errors.map(e => ({
                        property: e.property,
                        constraints: e.constraints
                    }))
                }, 'VALIDATION_FAILED');
            }

            // Track validation performance
            if (context) {
                context.addPerformanceMetric('validationTime', Date.now() - startTime);
            }

            // Attach validated object to request
            req.body = input;
            next();

        } catch (error) {
            if (error instanceof HttpError) {
                next(error);
            } else {
                next(new HttpError(500, 'Validation processing failed', {
                    originalError: error.message
                }, 'VALIDATION_PROCESSING_FAILED'));
            }
        }
    };
}

/**
 * Enhanced query parameter validation middleware factory
 */
export function validateQueryParams(constraints: Record<string, any>, options: ValidationOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const startTime = Date.now();
        const context = (req as any).requestContext as RequestContext;

        try {
            const errors: string[] = [];
            
            // Validate required parameters
            for (const [key, constraint] of Object.entries(constraints)) {
                if (constraint.required && !req.query[key]) {
                    errors.push(`Missing required query parameter: ${key}`);
                    continue;
                }

                if (req.query[key]) {
                    // Type coercion and validation
                    const value = req.query[key];
                    if (constraint.type === 'number') {
                        const num = Number(value);
                        if (isNaN(num)) {
                            errors.push(`Invalid number format for parameter: ${key}`);
                        } else {
                            req.query[key] = num;
                        }
                    }

                    // Pattern validation
                    if (constraint.pattern && !new RegExp(constraint.pattern).test(String(value))) {
                        errors.push(`Invalid format for parameter: ${key}`);
                    }
                }
            }

            // Check for security patterns in query parameters
            const securityIssues = checkSecurityPatterns(req.query);
            
            if (securityIssues.length > 0) {
                throw new HttpError(400, 'Query parameter security validation failed', {
                    issues: securityIssues
                }, 'QUERY_SECURITY_VALIDATION_FAILED');
            }

            if (errors.length > 0) {
                throw new HttpError(400, 'Query parameter validation failed', {
                    errors
                }, 'QUERY_VALIDATION_FAILED');
            }

            // Track validation performance
            if (context) {
                context.addPerformanceMetric('queryValidationTime', Date.now() - startTime);
            }

            next();

        } catch (error) {
            next(error instanceof HttpError ? error : new HttpError(500, 'Query validation processing failed', {
                originalError: error.message
            }, 'QUERY_VALIDATION_PROCESSING_FAILED'));
        }
    };
}

/**
 * Enhanced input sanitization middleware
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const context = (req as any).requestContext as RequestContext;

    try {
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }

        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }

        // Track sanitization performance
        if (context) {
            context.addPerformanceMetric('sanitizationTime', Date.now() - startTime);
        }

        next();
    } catch (error) {
        next(new HttpError(500, 'Input sanitization failed', {
            originalError: error.message
        }, 'SANITIZATION_FAILED'));
    }
}

/**
 * Helper function to check for security patterns in input
 */
function checkSecurityPatterns(input: any): string[] {
    const issues: string[] = [];
    const stringInput = JSON.stringify(input).toLowerCase();

    for (const [pattern, regex] of Object.entries(SUSPICIOUS_PATTERNS)) {
        if (regex.test(stringInput)) {
            issues.push(`Suspicious ${pattern} pattern detected`);
        }
    }

    return issues;
}

/**
 * Helper function to sanitize objects recursively
 */
function sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            // Basic sanitization for strings
            sanitized[key] = value
                .replace(/[<>]/g, '') // Remove potential HTML tags
                .trim();
        } else if (typeof value === 'object') {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}