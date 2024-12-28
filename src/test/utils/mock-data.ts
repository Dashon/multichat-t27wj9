/**
 * @fileoverview Mock data generation utilities for AI-Enhanced Group Chat Platform testing
 * Provides comprehensive test data generation for users, messages, and AI interactions
 * @version 1.0.0
 */

// External imports - versions specified for production stability
import { faker } from '@faker-js/faker'; // v8.0.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0

// Internal imports
import { IMessage, MessageType, MessageMetadata, ThreadMetadata } from '../../backend/message-service/src/interfaces/message.interface';
import { Timestamp } from 'google-protobuf';

/**
 * User role enumeration for test data generation
 */
export enum UserRole {
  USER = 'USER',
  PREMIUM_USER = 'PREMIUM_USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN'
}

/**
 * Interface for user preferences in test data
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  notifications: boolean;
  language: string;
  accessibility: {
    highContrast: boolean;
    screenReader: boolean;
    keyboardNavigation: boolean;
  };
}

/**
 * Interface for message formatting options
 */
export interface MessageFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  emoji?: boolean;
}

/**
 * Interface for AI context in test data
 */
export interface AIContext {
  domain: string;
  confidence: number;
  sources: string[];
  previousInteractions: string[];
}

/**
 * Generates a mock user with realistic data and preferences
 * @param role - User role in the system
 * @param preferences - Optional custom preferences
 * @returns Generated user object
 */
export function generateMockUser(role: UserRole = UserRole.USER, preferences?: Partial<UserPreferences>) {
  const defaultPreferences: UserPreferences = {
    theme: faker.helpers.arrayElement(['light', 'dark', 'system']),
    fontSize: faker.helpers.arrayElement(['small', 'medium', 'large']),
    notifications: faker.datatype.boolean(),
    language: 'en',
    accessibility: {
      highContrast: faker.datatype.boolean(),
      screenReader: faker.datatype.boolean(),
      keyboardNavigation: faker.datatype.boolean()
    }
  };

  return {
    id: uuidv4(),
    email: faker.internet.email(),
    username: faker.internet.userName(),
    role,
    preferences: { ...defaultPreferences, ...preferences },
    createdAt: faker.date.past(),
    lastActive: faker.date.recent(),
    settings: {
      timezone: faker.location.timeZone(),
      emailNotifications: faker.datatype.boolean(),
      pushNotifications: faker.datatype.boolean()
    }
  };
}

/**
 * Generates a mock message with enhanced formatting and thread support
 * @param chatId - ID of the chat the message belongs to
 * @param senderId - ID of the message sender
 * @param formatting - Optional message formatting options
 * @param threadId - Optional thread ID for threaded messages
 * @returns Generated message object
 */
export function generateMockMessage(
  chatId: string,
  senderId: string,
  formatting?: MessageFormatting,
  threadId?: string
): IMessage {
  const metadata: MessageMetadata = {
    type: MessageType.TEXT,
    formatting: {
      bold: formatting?.bold ? 'true' : 'false',
      italic: formatting?.italic ? 'true' : 'false',
      underline: formatting?.underline ? 'true' : 'false',
      code: formatting?.code ? 'true' : 'false'
    },
    mentions: [],
    aiContext: {}
  };

  const message: IMessage = {
    id: uuidv4(),
    chatId,
    senderId,
    content: faker.lorem.paragraph(),
    threadId: threadId || '',
    timestamp: Timestamp.fromDate(new Date()),
    metadata,
    threadMetadata: threadId ? generateThreadMetadata() : undefined
  };

  return message;
}

/**
 * Generates mock thread metadata for threaded messages
 * @returns Generated thread metadata
 */
function generateThreadMetadata(): ThreadMetadata {
  return {
    participantIds: Array(faker.number.int({ min: 2, max: 5 }))
      .fill(null)
      .map(() => uuidv4()),
    lastActivityAt: Timestamp.fromDate(faker.date.recent()),
    messageCount: faker.number.int({ min: 1, max: 50 })
  };
}

/**
 * Generates a mock AI agent response with enhanced context awareness
 * @param agentType - Type of AI agent (@explorer, @foodie, etc.)
 * @param messageId - ID of the message being responded to
 * @param context - Optional AI context information
 * @returns Generated AI response object
 */
export function generateMockAIResponse(
  agentType: string,
  messageId: string,
  context?: Partial<AIContext>
): IMessage {
  const defaultContext: AIContext = {
    domain: agentType.replace('@', ''),
    confidence: faker.number.float({ min: 0.7, max: 1.0 }),
    sources: Array(faker.number.int({ min: 1, max: 3 }))
      .fill(null)
      .map(() => faker.internet.url()),
    previousInteractions: []
  };

  const aiContext = { ...defaultContext, ...context };

  const metadata: MessageMetadata = {
    type: MessageType.AI_RESPONSE,
    formatting: {
      bold: 'false',
      italic: 'false',
      underline: 'false',
      code: 'false'
    },
    mentions: [messageId],
    aiContext: {
      domain: aiContext.domain,
      confidence: aiContext.confidence.toString(),
      sources: JSON.stringify(aiContext.sources)
    }
  };

  return {
    id: uuidv4(),
    chatId: faker.string.uuid(),
    senderId: agentType,
    content: generateAIResponseContent(agentType),
    threadId: messageId,
    timestamp: Timestamp.fromDate(new Date()),
    metadata
  };
}

/**
 * Generates appropriate content based on AI agent type
 * @param agentType - Type of AI agent
 * @returns Generated response content
 */
function generateAIResponseContent(agentType: string): string {
  const responses = {
    '@explorer': () => `Here are some interesting places to visit: ${faker.location.nearbyGPSCoordinate().join(', ')}`,
    '@foodie': () => `I recommend trying ${faker.commerce.productName()} at ${faker.company.name()}`,
    '@planner': () => `I've scheduled the following activities: ${faker.date.future().toLocaleDateString()}`,
    '@budget': () => `The estimated cost is $${faker.number.float({ min: 10, max: 1000 })}`,
    '@local': () => `Local tip: ${faker.lorem.sentence()}`
  };

  return responses[agentType]?.() || faker.lorem.paragraph();
}