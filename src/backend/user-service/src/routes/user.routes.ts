/**
 * User Routes Configuration
 * Version: 1.0.0
 * 
 * Implements secure REST endpoints for user management with comprehensive validation,
 * rate limiting, and audit logging. Addresses requirements from sections 2.2.1,
 * 7.1.2, and 7.2.2 of technical specifications.
 */

import { Router } from 'express'; // ^4.18.0
import rateLimit from 'express-rate-limit'; // ^6.7.0
import { UserController } from '../controllers/user.controller';
import { authenticateToken, authorizeRoles } from '../middleware/auth.middleware';
import { UserRole } from '../interfaces/auth.interface';
import { securityConfig } from '../config/auth.config';

// Initialize router
const userRouter = Router();

// Rate limiting configurations based on security settings
const createUserLimiter = rateLimit({
  windowMs: securityConfig.rateLimiting.api.windowMs,
  max: 5, // Stricter limit for user creation
  message: 'Too many user creation attempts, please try again later'
});

const apiLimiter = rateLimit({
  windowMs: securityConfig.rateLimiting.api.windowMs,
  max: securityConfig.rateLimiting.api.maxRequests,
  message: 'Too many requests from this IP, please try again later'
});

/**
 * @route   POST /api/users
 * @desc    Create new user account
 * @access  Admin only
 */
userRouter.post('/',
  authenticateToken,
  authorizeRoles([UserRole.ADMIN], 'profile', 'create'),
  createUserLimiter,
  UserController.createUser
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Authenticated users (self) or Admin
 */
userRouter.get('/:id',
  authenticateToken,
  authorizeRoles([UserRole.USER, UserRole.PREMIUM_USER, UserRole.MODERATOR, UserRole.ADMIN], 'profile', 'read'),
  apiLimiter,
  UserController.getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user profile
 * @access  Authenticated users (self) or Admin
 */
userRouter.put('/:id',
  authenticateToken,
  authorizeRoles([UserRole.USER, UserRole.PREMIUM_USER, UserRole.MODERATOR, UserRole.ADMIN], 'profile', 'update'),
  apiLimiter,
  UserController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user account
 * @access  Admin only
 */
userRouter.delete('/:id',
  authenticateToken,
  authorizeRoles([UserRole.ADMIN], 'profile', 'delete'),
  apiLimiter,
  UserController.deleteUser
);

/**
 * @route   PUT /api/users/:id/upgrade
 * @desc    Upgrade user to premium status
 * @access  Admin only
 */
userRouter.put('/:id/upgrade',
  authenticateToken,
  authorizeRoles([UserRole.ADMIN], 'profile', 'manage'),
  apiLimiter,
  UserController.upgradeUserToPremium
);

/**
 * @route   PUT /api/users/:id/settings
 * @desc    Update user settings
 * @access  Authenticated users (self) or Admin
 */
userRouter.put('/:id/settings',
  authenticateToken,
  authorizeRoles([UserRole.USER, UserRole.PREMIUM_USER, UserRole.MODERATOR, UserRole.ADMIN], 'profile', 'update'),
  apiLimiter,
  UserController.updateUserSettings
);

/**
 * Error handling middleware
 * Implements comprehensive error handling with security considerations
 */
userRouter.use((err: any, req: any, res: any, next: any) => {
  // Log error securely without exposing sensitive information
  console.error('User route error:', {
    path: req.path,
    method: req.method,
    errorType: err.name,
    errorMessage: err.message,
    timestamp: new Date().toISOString()
  });

  // Send appropriate error response
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    status: 'error',
    message,
    timestamp: new Date().toISOString()
  });
});

export { userRouter };