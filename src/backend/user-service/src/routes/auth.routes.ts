/**
 * Authentication Routes Configuration
 * Version: 1.0.0
 * 
 * Implements secure authentication routes with comprehensive security controls,
 * rate limiting, and audit logging. Addresses requirements from sections 7.1 and 7.3
 * of the technical specifications.
 */

import { Router } from 'express'; // v4.18.0
import { rateLimit } from 'express-rate-limit'; // v7.0.0
import { body, param, validationResult } from 'express-validator'; // v7.0.0
import winston from 'winston'; // v3.10.0

import { AuthController } from '../controllers/auth.controller';
import { 
  authenticateToken, 
  authorizeRoles, 
  validateDevice 
} from '../middleware/auth.middleware';
import { UserRole } from '../interfaces/auth.interface';

// Configure secure rate limiter for authentication endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { 
      ip: req.ip,
      path: req.path,
      headers: req.headers
    });
    res.status(429).json({ 
      error: 'Too many login attempts. Please try again later.',
      retryAfter: Math.ceil(15 * 60) // seconds until retry allowed
    });
  }
});

// Configure secure audit logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/auth-events.log',
      level: 'info'
    }),
    new winston.transports.File({ 
      filename: 'logs/auth-errors.log',
      level: 'error'
    })
  ]
});

/**
 * Configures and returns the Express router with enhanced authentication routes
 * and comprehensive security features.
 */
export function configureAuthRoutes(): Router {
  const router = Router();
  const authController = new AuthController();

  /**
   * Login route with enhanced security validation
   * POST /auth/login
   */
  router.post('/login',
    authRateLimiter,
    [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address is required'),
      body('password')
        .isString()
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long'),
      body('deviceInfo')
        .optional()
        .isObject()
        .withMessage('Invalid device information format')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          logger.warn('Login validation failed', { 
            errors: errors.array(),
            ip: req.ip
          });
          return res.status(400).json({ errors: errors.array() });
        }

        const result = await authController.login(req.body);
        
        logger.info('Successful login', { 
          userId: result.userId,
          deviceInfo: req.body.deviceInfo
        });

        return res.status(200).json(result);

      } catch (error) {
        logger.error('Login error', { 
          error: error.message,
          ip: req.ip,
          email: req.body.email
        });
        return res.status(401).json({ error: 'Authentication failed' });
      }
    }
  );

  /**
   * Token refresh route with device validation
   * POST /auth/refresh
   */
  router.post('/refresh',
    rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10 // 10 refresh attempts per hour
    }),
    validateDevice,
    [
      body('refreshToken')
        .isString()
        .notEmpty()
        .withMessage('Refresh token is required')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          logger.warn('Refresh token validation failed', {
            errors: errors.array(),
            ip: req.ip
          });
          return res.status(400).json({ errors: errors.array() });
        }

        const result = await authController.refreshToken(req.body);

        logger.info('Token refreshed', { 
          userId: result.userId,
          deviceInfo: req.deviceInfo
        });

        return res.status(200).json(result);

      } catch (error) {
        logger.error('Token refresh error', {
          error: error.message,
          ip: req.ip
        });
        return res.status(401).json({ error: 'Token refresh failed' });
      }
    }
  );

  /**
   * Secure logout route with session termination
   * POST /auth/logout
   */
  router.post('/logout',
    authenticateToken,
    validateDevice,
    async (req, res) => {
      try {
        await authController.logout(req.user.userId, req.deviceInfo?.deviceId);

        logger.info('User logged out', {
          userId: req.user.userId,
          deviceId: req.deviceInfo?.deviceId
        });

        return res.status(200).json({ message: 'Logout successful' });

      } catch (error) {
        logger.error('Logout error', {
          error: error.message,
          userId: req.user?.userId
        });
        return res.status(500).json({ error: 'Logout failed' });
      }
    }
  );

  /**
   * Token validation route with enhanced security checks
   * POST /auth/validate
   */
  router.post('/validate',
    authenticateToken,
    validateDevice,
    async (req, res) => {
      try {
        const result = await authController.validateToken(
          req.headers.authorization?.split(' ')[1],
          req.deviceInfo
        );

        if (!result.valid) {
          logger.warn('Token validation failed', {
            userId: req.user?.userId,
            deviceInfo: req.deviceInfo,
            error: result.error
          });
          return res.status(401).json({ error: result.error });
        }

        return res.status(200).json({ 
          valid: true,
          user: {
            id: result.payload.userId,
            role: result.payload.role,
            email: result.payload.email
          }
        });

      } catch (error) {
        logger.error('Token validation error', {
          error: error.message,
          token: req.headers.authorization?.substring(0, 10) + '...'
        });
        return res.status(401).json({ error: 'Token validation failed' });
      }
    }
  );

  /**
   * Password reset request route with rate limiting
   * POST /auth/reset-password
   */
  router.post('/reset-password',
    rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3 // 3 reset requests per hour
    }),
    [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address is required')
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        // Note: Actual implementation would be in AuthController
        // We return 200 even if email doesn't exist for security
        logger.info('Password reset requested', {
          email: req.body.email,
          ip: req.ip
        });

        return res.status(200).json({ 
          message: 'If an account exists, a reset email will be sent.' 
        });

      } catch (error) {
        logger.error('Password reset request error', {
          error: error.message,
          email: req.body.email
        });
        return res.status(500).json({ 
          error: 'Unable to process password reset request' 
        });
      }
    }
  );

  return router;
}