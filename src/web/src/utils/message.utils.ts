// External imports - v3.0.6
import DOMPurify from 'dompurify';
// External imports - v5.2.3
import { caching } from 'cache-manager';

// Internal imports
import { Message, MessageType, MessageStatus } from '../types/message';
import { formatMessageDate } from './date.utils';
import { validateMessageContent } from './validation.utils';

// Constants for message processing
const AI_MENTION_REGEX = /(?:^|\s)(@[a-zA-Z][\w-]{2,31})(?:\s|$)/g;
const MAX_MESSAGE_LENGTH = 5000;
const EMOJI_SHORTCUTS: Record<string, { emoji: string; label: string }> = {
  ':)': { emoji: '😊', label: 'smiling face' },
  ':(': { emoji: '😢', label: 'sad face' },
  ':D': { emoji: '😃', label: 'grinning face' },
  ';)': { emoji: '😉', label: 'winking face' }
};

// Cache configuration
const CACHE_CONFIG = {
  ttl: 3600, // 1 hour
  max: 1000, // Maximum items in cache
  updateAgeOnGet: true
};

// Initialize cache
const messageCache = caching(CACHE_CONFIG);

/**
 * Interface for message formatting options
 */
interface FormatOptions {
  enableEmoji?: boolean;
  enableLinks?: boolean;
  enableFormatting?: boolean;
  preserveWhitespace?: boolean;
}

/**
 * Interface for AI agent mention
 */
interface AIAgentMention {
  agent: string;
  index: number;
  context?: Record<string, any>;
}

/**
 * Formats and sanitizes message content with accessibility support
 * @param content - Raw message content to format
 * @param options - Formatting options
 * @returns Sanitized and formatted message content
 */
export const formatMessageContent = async (
  content: string,
  options: FormatOptions = {}
): Promise<string> => {
  // Validate content length
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message content must be between 1 and ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Check cache first
  const cacheKey = `msg:${content}:${JSON.stringify(options)}`;
  const cached = await messageCache.get(cacheKey);
  if (cached) {
    return cached as string;
  }

  try {
    // Configure DOMPurify
    const purifyConfig = {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'aria-label'],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target="_blank"', 'rel="noopener noreferrer"']
    };

    // Initial sanitization
    let formatted = DOMPurify.sanitize(content, purifyConfig);

    // Apply formatting if enabled
    if (options.enableFormatting) {
      // Bold text
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Italic text
      formatted = formatted.replace(/\_(.*?)\_/g, '<em>$1</em>');
    }

    // Process emoji shortcuts if enabled
    if (options.enableEmoji) {
      Object.entries(EMOJI_SHORTCUTS).forEach(([shortcut, { emoji, label }]) => {
        formatted = formatted.replace(
          new RegExp(shortcut, 'g'),
          `<span role="img" aria-label="${label}">${emoji}</span>`
        );
      });
    }

    // Process links if enabled
    if (options.enableLinks) {
      const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
      formatted = formatted.replace(
        urlRegex,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      );
    }

    // Preserve whitespace if enabled
    if (options.preserveWhitespace) {
      formatted = formatted.replace(/\n/g, '<br>');
    }

    // Final sanitization pass
    formatted = DOMPurify.sanitize(formatted, purifyConfig);

    // Cache the result
    await messageCache.set(cacheKey, formatted);

    return formatted;
  } catch (error) {
    console.error('Error formatting message content:', error);
    throw new Error('Failed to format message content');
  }
};

/**
 * Extracts and validates AI agent mentions with context awareness
 * @param content - Message content to parse
 * @param context - Current AI context
 * @returns Array of validated AI agent mentions
 */
export const parseAIMentions = async (
  content: string,
  context?: Record<string, any>
): Promise<AIAgentMention[]> => {
  // Validate content
  const validation = validateMessageContent({ 
    content,
    metadata: { type: MessageType.TEXT, status: MessageStatus.SENDING }
  } as Message);

  if (!validation.isValid) {
    throw new Error('Invalid message content');
  }

  const mentions: AIAgentMention[] = [];
  let match;

  // Extract mentions using regex
  while ((match = AI_MENTION_REGEX.exec(content)) !== null) {
    const agent = match[1].substring(1); // Remove @ symbol
    const index = match.index;

    // Build context for this mention
    const mentionContext = {
      ...context,
      position: index,
      surroundingText: content.substring(
        Math.max(0, index - 50),
        Math.min(content.length, index + 50)
      )
    };

    mentions.push({
      agent,
      index,
      context: mentionContext
    });
  }

  return mentions;
};

/**
 * Formats message metadata for display
 * @param message - Message object to format
 * @returns Formatted metadata string
 */
export const formatMessageMetadata = (message: Message): string => {
  const timestamp = formatMessageDate(new Date(message.metadata.timestamp));
  const status = message.metadata.status.toLowerCase();
  
  return `${timestamp} • ${status}`;
};

/**
 * Checks if a message contains sensitive content
 * @param message - Message to check
 * @returns Boolean indicating if message contains sensitive content
 */
export const hasSensitiveContent = (message: Message): boolean => {
  // Add patterns for sensitive content detection
  const sensitivePatterns = [
    /\b(password|credit.?card|ssn)\b/i,
    /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN pattern
    /\b\d{4}[-.]?\d{4}[-.]?\d{4}[-.]?\d{4}\b/ // Credit card pattern
  ];

  return sensitivePatterns.some(pattern => pattern.test(message.content));
};