/**
 * @fileoverview End-to-end tests for AI agent context awareness capabilities
 * Validates context retention, multi-turn conversations, and context management
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.x
import supertest from 'supertest'; // v6.x
import { MockAgent } from '../../utils/ai-agent-mock';
import { createTestUser, createTestChatGroup, waitForWebSocketEvent } from '../../utils/test-helpers';
import { TestConfig } from '../../config/test-config';
import { MessageType, IMessage } from '../../../backend/message-service/src/interfaces/message.interface';
import { Timestamp } from 'google-protobuf';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const CONTEXT_RETENTION_TIME = 3600000; // 1 hour in milliseconds
const MAX_RESPONSE_TIME = 5000; // 5 seconds
const MIN_CONFIDENCE_SCORE = 0.85;

// Mock agents for testing
let foodieAgent: MockAgent;
let explorerAgent: MockAgent;
let plannerAgent: MockAgent;

// Test data
let testUser: any;
let testGroup: any;
let config: any;

describe('AI Agent Context Awareness Tests', () => {
  beforeAll(async () => {
    // Initialize test configuration
    config = TestConfig.getInstance();
    await config.initialize({ aiAgentTesting: true });

    // Create test user with preferences
    testUser = await createTestUser('USER', {
      dietary_restrictions: ['vegetarian'],
      preferred_price_range: 'moderate',
      preferred_cuisines: ['French', 'Italian']
    });

    // Initialize mock agents
    foodieAgent = new MockAgent('foodie', ['restaurant_selection', 'dietary_accommodation']);
    explorerAgent = new MockAgent('explorer', ['local_attractions', 'cultural_sites']);
    plannerAgent = new MockAgent('planner', ['itinerary_optimization', 'time_management']);

    // Create test chat group
    testGroup = await createTestChatGroup(3, ['@foodie', '@explorer', '@planner']);

    // Configure longer timeout for E2E tests
    jest.setTimeout(TEST_TIMEOUT);
  });

  afterAll(async () => {
    // Reset all agent contexts
    [foodieAgent, explorerAgent, plannerAgent].forEach(agent => {
      agent['context'].clear();
      agent['performanceMetrics'].clear();
    });
  });

  describe('Short-term Context Retention', () => {
    it('should maintain context within a single conversation', async () => {
      // Initial query to foodie agent
      const initialMessage: IMessage = {
        id: 'msg-001',
        chatId: testGroup.id,
        senderId: testUser.id,
        content: '@foodie Looking for a vegetarian restaurant near the Louvre',
        threadId: '',
        timestamp: Timestamp.fromDate(new Date()),
        metadata: {
          type: MessageType.TEXT,
          formatting: { bold: 'false', italic: 'false', underline: 'false', code: 'false' },
          mentions: ['@foodie'],
          aiContext: {}
        }
      };

      const initialResponse = await foodieAgent.processMessage(
        initialMessage.content,
        initialMessage.chatId,
        { userPreferences: testUser.preferences }
      );

      // Validate initial response
      expect(initialResponse.metadata.aiContext.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
      expect(initialResponse.metadata.aiContext.domain).toBe('foodie');
      expect(Date.now() - initialResponse.timestamp.toDate().getTime()).toBeLessThan(MAX_RESPONSE_TIME);

      // Follow-up query
      const followUpMessage: IMessage = {
        ...initialMessage,
        id: 'msg-002',
        content: '@foodie What are their opening hours?',
        timestamp: Timestamp.fromDate(new Date())
      };

      const followUpResponse = await foodieAgent.processMessage(
        followUpMessage.content,
        followUpMessage.chatId,
        { userPreferences: testUser.preferences }
      );

      // Validate context retention
      expect(followUpResponse.metadata.aiContext.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
      expect(followUpResponse.content).toContain('Bistrot Vivienne');
      expect(followUpResponse.metadata.mentions).toContain(initialMessage.id);
    });
  });

  describe('Long-term Context Retention', () => {
    it('should maintain context across multiple conversations', async () => {
      const conversations = await Promise.all([
        createTestChatGroup(2, ['@foodie']),
        createTestChatGroup(2, ['@foodie']),
        createTestChatGroup(2, ['@foodie'])
      ]);

      // Send related messages in different conversations
      for (const conversation of conversations) {
        const message: IMessage = {
          id: `msg-${conversation.id}`,
          chatId: conversation.id,
          senderId: testUser.id,
          content: '@foodie Tell me about French restaurants',
          threadId: '',
          timestamp: Timestamp.fromDate(new Date()),
          metadata: {
            type: MessageType.TEXT,
            formatting: { bold: 'false', italic: 'false', underline: 'false', code: 'false' },
            mentions: ['@foodie'],
            aiContext: {}
          }
        };

        const response = await foodieAgent.processMessage(
          message.content,
          message.chatId,
          { userPreferences: testUser.preferences }
        );

        expect(response.metadata.aiContext.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
      }

      // Verify context persistence after time
      const contextAfterDelay = await new Promise(resolve => {
        setTimeout(async () => {
          const response = await foodieAgent.processMessage(
            '@foodie Which of these restaurants would you recommend?',
            conversations[0].id,
            { userPreferences: testUser.preferences }
          );
          resolve(response);
        }, 5000);
      });

      expect(contextAfterDelay).toBeDefined();
      expect(contextAfterDelay['metadata'].aiContext.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
    });
  });

  describe('Multi-agent Context Sharing', () => {
    it('should coordinate context between multiple agents', async () => {
      // Initial query to explorer agent
      const explorerMessage: IMessage = {
        id: 'msg-003',
        chatId: testGroup.id,
        senderId: testUser.id,
        content: '@explorer Suggest activities near the Louvre for tomorrow morning',
        threadId: '',
        timestamp: Timestamp.fromDate(new Date()),
        metadata: {
          type: MessageType.TEXT,
          formatting: { bold: 'false', italic: 'false', underline: 'false', code: 'false' },
          mentions: ['@explorer'],
          aiContext: {}
        }
      };

      const explorerResponse = await explorerAgent.processMessage(
        explorerMessage.content,
        explorerMessage.chatId,
        { userPreferences: testUser.preferences }
      );

      // Follow-up with planner agent
      const plannerMessage: IMessage = {
        id: 'msg-004',
        chatId: testGroup.id,
        senderId: testUser.id,
        content: '@planner Can you create an itinerary including these activities?',
        threadId: '',
        timestamp: Timestamp.fromDate(new Date()),
        metadata: {
          type: MessageType.TEXT,
          formatting: { bold: 'false', italic: 'false', underline: 'false', code: 'false' },
          mentions: ['@planner'],
          aiContext: {}
        }
      };

      const plannerResponse = await plannerAgent.processMessage(
        plannerMessage.content,
        plannerMessage.chatId,
        { 
          userPreferences: testUser.preferences,
          sharedContext: explorerResponse.metadata.aiContext
        }
      );

      // Validate context sharing
      expect(plannerResponse.metadata.aiContext.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
      expect(plannerResponse.content).toContain('Louvre');
      expect(plannerResponse.metadata.mentions).toContain(explorerMessage.id);
    });
  });

  describe('Contextual Recommendations', () => {
    it('should provide recommendations based on user preferences and context', async () => {
      const message: IMessage = {
        id: 'msg-005',
        chatId: testGroup.id,
        senderId: testUser.id,
        content: '@foodie Recommend a restaurant for dinner',
        threadId: '',
        timestamp: Timestamp.fromDate(new Date()),
        metadata: {
          type: MessageType.TEXT,
          formatting: { bold: 'false', italic: 'false', underline: 'false', code: 'false' },
          mentions: ['@foodie'],
          aiContext: {}
        }
      };

      const response = await foodieAgent.processMessage(
        message.content,
        message.chatId,
        { userPreferences: testUser.preferences }
      );

      // Validate preference-aware response
      expect(response.metadata.aiContext.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
      expect(response.content).toContain('vegetarian');
      expect(response.content).toMatch(/\b(moderate|mid-range)\b/i);
      expect(Date.now() - response.timestamp.toDate().getTime()).toBeLessThan(MAX_RESPONSE_TIME);
    });
  });
});