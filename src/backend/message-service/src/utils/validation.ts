/**
 * @fileoverview Validation utilities for message and thread data
 * Ensures data integrity, security compliance, and format validation
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.2
import { isUUID } from 'validator'; // v13.11.0
import { IMessage, MessageType } from '../interfaces/message.interface';
import { IThread } from '../interfaces/thread.interface';

// Constants for validation rules
export const MAX_MESSAGE_LENGTH = 5000;
export const MIN_MESSAGE_LENGTH = 1;
export const MAX_THREAD_PARTICIPANTS = 100;
export const MAX_THREAD_DEPTH = 10;
export const MAX_MENTIONS_PER_MESSAGE = 50;
export const MAX_EMOJI_DENSITY = 0.3;

/**
 * Custom error class for validation failures
 */
class ValidationError extends Error {
  constructor(message: string, public context: Record<string, any>) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Zod schema for message metadata validation
 */
const messageMetadataSchema = z.object({
  type: z.enum([
    MessageType.TEXT,
    MessageType.AI_RESPONSE,
    MessageType.POLL,
    MessageType.SYSTEM
  ]),
  formatting: z.record(z.string()),
  mentions: z.array(z.string().uuid()),
  aiContext: z.record(z.string())
});

/**
 * Validates message content for security and formatting
 * @param content - Message content to validate
 * @returns Promise<boolean> - True if valid, throws ValidationError if invalid
 */
export async function validateMessageContent(content: string): Promise<boolean> {
  try {
    // Check content length
    if (content.length < MIN_MESSAGE_LENGTH || content.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError('Invalid content length', {
        min: MIN_MESSAGE_LENGTH,
        max: MAX_MESSAGE_LENGTH,
        actual: content.length
      });
    }

    // XSS prevention - check for suspicious patterns
    const xssPatterns = /<script|javascript:|data:|vbscript:|<iframe|<img|onerror|onclick/i;
    if (xssPatterns.test(content)) {
      throw new ValidationError('Potential XSS detected', { content });
    }

    // Emoji density check
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu;
    const emojiCount = (content.match(emojiPattern) || []).length;
    const emojiDensity = emojiCount / content.length;
    if (emojiDensity > MAX_EMOJI_DENSITY) {
      throw new ValidationError('Excessive emoji usage', {
        density: emojiDensity,
        max: MAX_EMOJI_DENSITY
      });
    }

    // URL validation
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = content.match(urlPattern) || [];
    for (const url of urls) {
      try {
        new URL(url);
      } catch {
        throw new ValidationError('Invalid URL detected', { url });
      }
    }

    // Check for balanced formatting tags
    const formatTags = content.match(/\*\*|__|\*|_|~~|`/g) || [];
    if (formatTags.length % 2 !== 0) {
      throw new ValidationError('Unbalanced formatting tags', { tags: formatTags });
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Content validation failed', { error });
  }
}

/**
 * Validates complete message object including metadata and security checks
 * @param message - Message object to validate
 * @returns Promise<boolean> - True if valid, throws ValidationError if invalid
 */
export async function validateMessage(message: IMessage): Promise<boolean> {
  try {
    // Validate UUID format
    if (!isUUID(message.id, 4)) {
      throw new ValidationError('Invalid message ID format', { id: message.id });
    }

    // Validate content
    await validateMessageContent(message.content);

    // Validate metadata using Zod schema
    const metadataResult = messageMetadataSchema.safeParse(message.metadata);
    if (!metadataResult.success) {
      throw new ValidationError('Invalid message metadata', {
        errors: metadataResult.error.errors
      });
    }

    // Validate mentions count
    if (message.metadata.mentions.length > MAX_MENTIONS_PER_MESSAGE) {
      throw new ValidationError('Too many mentions', {
        count: message.metadata.mentions.length,
        max: MAX_MENTIONS_PER_MESSAGE
      });
    }

    // Additional validation for AI responses
    if (message.metadata.type === MessageType.AI_RESPONSE) {
      if (!message.metadata.aiContext.modelId || !message.metadata.aiContext.confidence) {
        throw new ValidationError('Missing required AI context', {
          context: message.metadata.aiContext
        });
      }
    }

    // Thread validation if part of a thread
    if (message.threadId && !isUUID(message.threadId, 4)) {
      throw new ValidationError('Invalid thread ID format', { threadId: message.threadId });
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Message validation failed', { error });
  }
}

/**
 * Validates thread structure and metadata
 * @param thread - Thread object to validate
 * @returns Promise<boolean> - True if valid, throws ValidationError if invalid
 */
export async function validateThread(thread: IThread): Promise<boolean> {
  try {
    // Validate UUID format
    if (!isUUID(thread.id, 4)) {
      throw new ValidationError('Invalid thread ID format', { id: thread.id });
    }

    // Validate participant count
    if (thread.metadata.participantIds.length > MAX_THREAD_PARTICIPANTS) {
      throw new ValidationError('Too many thread participants', {
        count: thread.metadata.participantIds.length,
        max: MAX_THREAD_PARTICIPANTS
      });
    }

    // Validate all participant IDs are valid UUIDs
    for (const participantId of thread.metadata.participantIds) {
      if (!isUUID(participantId, 4)) {
        throw new ValidationError('Invalid participant ID format', { participantId });
      }
    }

    // Validate message count
    if (thread.metadata.messageCount < 0) {
      throw new ValidationError('Invalid message count', {
        count: thread.metadata.messageCount
      });
    }

    // Validate timestamps
    const now = Date.now();
    const lastActivity = thread.metadata.lastActivityAt.toDate().getTime();
    if (lastActivity > now) {
      throw new ValidationError('Future timestamp not allowed', {
        timestamp: lastActivity
      });
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Thread validation failed', { error });
  }
}