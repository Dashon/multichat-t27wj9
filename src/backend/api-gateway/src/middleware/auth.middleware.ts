/**
 * Authentication Middleware for API Gateway
 * Version: 1.0.0
 * 
 * Implements secure JWT token validation, role-based access control,
 * and comprehensive security monitoring for the API Gateway.
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.0
import { UnauthorizedError } from 'http-errors'; // v2.0.0
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import { verifyAccessToken, extractTokenFromHeader } from '../utils/jwt.utils';
import { TokenPayload, UserRole, AuthenticatedRequest } from '../../user-service/src/interfaces/auth.interface';
import { HttpError, SecurityEvent } from './error.middleware';

// Constants for configuration
const PUBLIC_ROUTES = ['/auth/login', '/auth/register', '/auth/refresh'];
const AUTH_RATE_LIMIT = { points: 5, duration: 60, blockDuration: 300 };

// Initialize rate limiter for authentication attempts
const authRateLimiter = new RateLimiterMemory({
  points: AUTH_RATE_LIMIT.points,
  duration: AUTH_RATE_LIMIT.duration,
  blockDuration: AUTH_RATE_LIMIT.blockDuration
});

/**
 * Interface for tracking authentication metrics
 */
interface AuthMetrics {
  attempts: number;
  failures: number;
  lastAttempt: Date;
  suspicious: boolean;
}

/**
 * Authentication middleware that validates JWT tokens and enriches requests with user data
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Skip authentication for public routes
    if (PUBLIC_ROUTES.includes(req.path)) {
      return next();
    }

    // Apply rate limiting
    try {
      await authRateLimiter.consume(req.ip);
    } catch (rateLimitError) {
      throw new HttpError(
        429,
        'Too many authentication attempts',
        { retryAfter: rateLimitError.msBeforeNext / 1000 },
        'RATE_LIMIT_EXCEEDED'
      );
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader ? extractTokenFromHeader(authHeader) : null;

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    // Track authentication metrics
    const metrics: AuthMetrics = {
      attempts: 1,
      failures: 0,
      lastAttempt: new Date(),
      suspicious: false
    };

    // Verify token and decode payload
    const startTime = Date.now();
    const payload = await verifyAccessToken(token);
    const verificationTime = Date.now() - startTime;

    // Check for suspicious verification times
    if (verificationTime > 1000) {
      metrics.suspicious = true;
    }

    // Enrich request with user data
    (req as AuthenticatedRequest).user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId
    };

    // Add security context
    (req as any).securityContext = {
      metrics,
      tokenExpiry: new Date(payload.exp * 1000),
      lastVerificationTime: verificationTime
    };

    next();
  } catch (error) {
    // Track authentication failures
    const securityEvent = new SecurityEvent(
      'AUTH_FAILURE',
      {
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        errorMessage: error.message
      },
      'high'
    );

    // Log security event
    console.error('Authentication failed:', securityEvent);

    // Return appropriate error response
    if (error instanceof UnauthorizedError) {
      next(new HttpError(401, error.message, {}, 'AUTH_FAILED'));
    } else if (error instanceof HttpError) {
      next(error);
    } else {
      next(new HttpError(500, 'Internal authentication error', {}, 'AUTH_ERROR'));
    }
  }
};

/**
 * Authorization middleware that enforces role-based access control
 */
export const authorize = (allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      
      if (!authenticatedReq.user || !authenticatedReq.user.role) {
        throw new UnauthorizedError('User role not found');
      }

      const userRole = authenticatedReq.user.role;

      // Validate user role
      if (!allowedRoles.includes(userRole)) {
        // Track unauthorized access attempt
        const securityEvent = new SecurityEvent(
          'UNAUTHORIZED_ACCESS',
          {
            path: req.path,
            userRole,
            requiredRoles: allowedRoles,
            userId: authenticatedReq.user.userId
          },
          'medium'
        );

        console.warn('Unauthorized access attempt:', securityEvent);

        throw new HttpError(
          403,
          'Insufficient permissions',
          { requiredRoles: allowedRoles },
          'FORBIDDEN'
        );
      }

      // Track successful authorization
      if (authenticatedReq.securityContext) {
        authenticatedReq.securityContext.lastAuthorization = {
          timestamp: new Date(),
          role: userRole,
          path: req.path
        };
      }

      next();
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        next(new HttpError(500, 'Authorization error', {}, 'AUTH_ERROR'));
      }
    }
  };
};