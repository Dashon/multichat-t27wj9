/**
 * @fileoverview Express router configuration for message-related endpoints.
 * Implements secure real-time message operations with AI integration, rate limiting,
 * and comprehensive validation.
 * @version 1.0.0
 */

// External imports - versions specified as per requirements
import { Router } from 'express'; // v4.18.2
import { authenticate } from 'express-jwt'; // v8.4.1
import { body, param, query, validationResult } from 'express-validator'; // v7.0.1
import rateLimit from 'express-rate-limit'; // v6.9.0
import helmet from 'helmet'; // v7.0.0

// Internal imports
import { MessageController } from '../controllers/message.controller';
import { IMessage } from '../interfaces/message.interface';

/**
 * Rate limit configuration options
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
}

/**
 * Configures and returns an Express router with secured message endpoints
 */
export default function configureMessageRoutes(
  messageController: MessageController,
  rateLimitOptions: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later'
  }
): Router {
  const router = Router();

  // Apply security middleware
  router.use(helmet());

  // Configure rate limiting
  const messageLimiter = rateLimit({
    ...rateLimitOptions,
    standardHeaders: true,
    legacyHeaders: false
  });

  // JWT authentication middleware
  const authMiddleware = authenticate({
    secret: process.env.JWT_SECRET!,
    algorithms: ['HS256']
  });

  // Validation middleware
  const validateMessagePayload = [
    body('chatId')
      .isUUID()
      .withMessage('Invalid chat ID format'),
    body('content')
      .isString()
      .trim()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Content must be between 1 and 10000 characters'),
    body('threadId')
      .optional()
      .isUUID()
      .withMessage('Invalid thread ID format'),
    body('metadata')
      .isObject()
      .withMessage('Metadata must be an object'),
    body('metadata.type')
      .isIn(['TEXT', 'AI_RESPONSE', 'POLL', 'SYSTEM'])
      .withMessage('Invalid message type')
  ];

  const validatePaginationQuery = [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative')
  ];

  // Error handling middleware
  const handleValidationErrors = (req: any, res: any, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };

  /**
   * POST /messages
   * Creates and sends a new message with AI integration
   */
  router.post(
    '/messages',
    authMiddleware,
    messageLimiter,
    validateMessagePayload,
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const message: IMessage = await messageController.sendMessage({
          ...req.body,
          senderId: req.user.id,
          timestamp: new Date()
        });
        res.status(201).json(message);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /messages/chat/:chatId
   * Retrieves paginated messages for a chat with caching
   */
  router.get(
    '/messages/chat/:chatId',
    authMiddleware,
    messageLimiter,
    param('chatId').isUUID(),
    validatePaginationQuery,
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { limit = 50, offset = 0 } = req.query;
        const messages = await messageController.getChatMessages(
          req.params.chatId,
          { limit: Number(limit), offset: Number(offset) }
        );
        res.json(messages);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /messages/thread/:threadId
   * Retrieves paginated messages for a thread with caching
   */
  router.get(
    '/messages/thread/:threadId',
    authMiddleware,
    messageLimiter,
    param('threadId').isUUID(),
    validatePaginationQuery,
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { limit = 50, offset = 0 } = req.query;
        const messages = await messageController.getThreadMessages(
          req.params.threadId,
          { limit: Number(limit), offset: Number(offset) }
        );
        res.json(messages);
      } catch (error) {
        next(error);
      }
    }
  );

  // Error handling middleware
  router.use((err: any, req: any, res: any, next: any) => {
    console.error('Route error:', err);
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({ error: 'Unauthorized access' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}