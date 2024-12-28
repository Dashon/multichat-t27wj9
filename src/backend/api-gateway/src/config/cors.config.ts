/**
 * CORS Configuration for API Gateway
 * Implements secure Cross-Origin Resource Sharing with strict origin validation
 * @version 1.0.0
 * @package @cors ^2.8.5
 */

import cors, { CorsOptions } from 'cors'; // ^2.8.5

// Environment-based configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
const MAX_AGE = 86400; // 24 hours in seconds
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

/**
 * Validates if the requesting origin is allowed to access the API
 * Implements strict security checks and logging for origin validation
 * 
 * @param origin - The origin of the incoming request
 * @param callback - Function to be called with validation result
 */
const validateOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void => {
    // Reject if origin is undefined or null (direct access)
    if (!origin) {
        callback(new Error('Origin not allowed - direct access prohibited'));
        return;
    }

    try {
        // Validate origin format
        const originUrl = new URL(origin);
        
        // Check if origin is in allowed list
        const isAllowed = ALLOWED_ORIGINS.includes(origin);
        
        // Allow localhost in development
        const isLocalhost = IS_DEVELOPMENT && (
            originUrl.hostname === 'localhost' || 
            originUrl.hostname === '127.0.0.1'
        );

        if (isAllowed || isLocalhost) {
            callback(null, true);
            return;
        }

        // Log validation failure for security monitoring
        console.warn(`CORS validation failed for origin: ${origin}`);
        callback(new Error('Origin not allowed'));
        
    } catch (error) {
        console.error(`Invalid origin format: ${origin}`, error);
        callback(new Error('Invalid origin format'));
    }
};

/**
 * CORS configuration options with strict security controls
 * Implements comprehensive security headers and access controls
 */
export const corsOptions: CorsOptions = {
    // Strict origin validation
    origin: validateOrigin,
    
    // Allowed HTTP methods
    methods: ALLOWED_METHODS,
    
    // Allowed request headers
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'X-API-Key',
        'X-Client-Version'
    ],
    
    // Exposed response headers
    exposedHeaders: [
        'Content-Range',
        'X-Content-Range',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
    ],
    
    // Enable credentials (cookies, authorization headers)
    credentials: true,
    
    // Cache preflight requests
    maxAge: MAX_AGE,
    
    // Don't pass OPTIONS to the next handler
    preflightContinue: false,
    
    // Successful OPTIONS response status code
    optionsSuccessStatus: 204,
    
    // Allow credentials to be sent with requests
    allowCredentials: true
};

export default corsOptions;