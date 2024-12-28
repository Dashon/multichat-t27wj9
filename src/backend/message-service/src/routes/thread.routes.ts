/**
 * @fileoverview Thread routes configuration implementing real-time messaging capabilities
 * with AI agent integration, comprehensive request validation, and transaction support.
 * @version 1.0.0
 */

// External imports
import { Router } from 'express'; // v4.18.0
import { authenticate } from 'express-jwt'; // v8.4.1
import { rateLimit } from 'express-rate-limit'; // v6.9.0
import { transactionMiddleware } from '@company/transaction-middleware'; // v1.0.0
import { validate } from 'express-validation'; // v4.1.0
import { WebSocket } from 'ws'; // v8.14.2

// Internal imports
import { ThreadController } from '../controllers/thread.controller';
import { IThread, ThreadStatus } from '../interfaces/thread.interface';

/**
 * Validation schema for thread creation
 */
const threadValidationSchema = {
  body: {
    parentMessageId: 'string|required',
    chatId: 'string|required',
    participantIds: 'array|required|min:1',
    metadata: {
      status: `enum:${Object.values(ThreadStatus).join(',')}`,
      aiContext: 'object'
    }
  }
};

/**
 * Validation schema for thread updates
 */
const threadUpdateSchema = {
  body: {
    status: `enum:${Object.values(ThreadStatus).join(',')}`,
    participantIds: 'array|min:1'
  }
};

/**
 * Configures and returns thread routes with comprehensive middleware
 */
export function configureThreadRoutes(
  threadController: ThreadController,
  rateLimiter: typeof rateLimit
): Router {
  const router = Router({ mergeParams: true });

  // Configure rate limiting
  const threadRateLimit = rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many thread operations, please try again later'
  });

  // Global authentication middleware
  router.use(authenticate({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256']
  }));

  // WebSocket setup for real-time updates
  router.ws('/threads/:threadId/live', (ws: WebSocket, req) => {
    const { threadId } = req.params;
    
    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        switch (data.type) {
          case 'join':
            // Handle thread join
            await threadController.getThreadStatus(threadId);
            break;
          case 'message':
            // Handle new message
            await threadController.addMessage(threadId, data.message);
            break;
          default:
            ws.send(JSON.stringify({ error: 'Unknown message type' }));
        }
      } catch (error) {
        ws.send(JSON.stringify({ error: 'Failed to process message' }));
      }
    });

    ws.on('close', () => {
      // Cleanup on connection close
    });
  });

  // Create new thread
  router.post('/threads',
    threadRateLimit,
    validate(threadValidationSchema),
    transactionMiddleware(),
    async (req, res, next) => {
      try {
        const thread = await threadController.createThread(req.body);
        res.status(201).json(thread);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get thread by ID
  router.get('/threads/:threadId',
    validate({ params: { threadId: 'string|required' } }),
    async (req, res, next) => {
      try {
        const thread = await threadController.getThread(req.params.threadId);
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }
        res.json(thread);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update thread
  router.patch('/threads/:threadId',
    threadRateLimit,
    validate(threadUpdateSchema),
    transactionMiddleware(),
    async (req, res, next) => {
      try {
        const thread = await threadController.updateThread(
          req.params.threadId,
          req.body
        );
        res.json(thread);
      } catch (error) {
        next(error);
      }
    }
  );

  // Add message to thread
  router.post('/threads/:threadId/messages',
    threadRateLimit,
    validate({
      body: {
        content: 'string|required|max:10000',
        metadata: 'object'
      }
    }),
    transactionMiddleware(),
    async (req, res, next) => {
      try {
        await threadController.addMessage(req.params.threadId, req.body);
        res.status(201).json({ message: 'Message added successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  // Error handling middleware
  router.use((error: any, req: any, res: any, next: any) => {
    console.error('Thread route error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details
      });
    }
    if (error.name === 'UnauthorizedError') {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }
    res.status(500).json({
      error: 'Internal server error'
    });
  });

  return router;
}

export default configureThreadRoutes;