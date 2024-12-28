/**
 * @fileoverview Integration tests for AI context management system
 * Validates context persistence, retrieval, and maintenance across conversations
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // ^29.x
import supertest from 'supertest'; // ^6.x
import { getTestConfig } from '../../config/test-config';
import { createTestUser, createTestChatGroup, waitForDatabaseSync } from '../../utils/test-helpers';
import { MessageType, IMessage } from '../../../backend/message-service/src/interfaces/message.interface';
import { Timestamp } from 'google-protobuf';

// Test configuration and constants
const TEST_TIMEOUT = 30000;
const CONTEXT_SYNC_TIMEOUT = 5000;
const MIN_CONFIDENCE_SCORE = 0.85;
const MAX_SHORT_TERM_MESSAGES = 10;
const VECTOR_SIMILARITY_THRESHOLD = 0.7;

// Test context interface
interface TestContext {
  users: any[];
  chatGroup: any;
  messages: IMessage[];
  vectorStore: any;
  startTime: number;
}

/**
 * Setup test environment and resources
 */
async function setupTestContext(): Promise<TestContext> {
  const startTime = Date.now();
  
  // Create test users with different interaction patterns
  const users = await Promise.all([
    createTestUser('USER', { language: 'en' }, { preferredAgents: ['@explorer', '@foodie'] }),
    createTestUser('USER', { language: 'en' }, { preferredAgents: ['@planner'] }),
    createTestUser('USER', { language: 'en' }, { preferredAgents: ['@local'] })
  ]);

  // Create test chat group with AI agents
  const chatGroup = await createTestChatGroup(
    users.length,
    ['@explorer', '@foodie', '@planner', '@local'],
    {
      contextRetention: MAX_SHORT_TERM_MESSAGES,
      vectorSimilarityThreshold: VECTOR_SIMILARITY_THRESHOLD
    }
  );

  return {
    users,
    chatGroup,
    messages: [],
    vectorStore: {},
    startTime
  };
}

/**
 * Cleanup test resources and validate cleanup
 */
async function cleanupTestContext(context: TestContext): Promise<void> {
  try {
    // Clear messages and verify cleanup
    await Promise.all(context.messages.map(msg => 
      waitForDatabaseSync({ timeout: CONTEXT_SYNC_TIMEOUT })
    ));

    // Clear vector store entries
    await context.vectorStore.clear();

    // Verify cleanup completion
    const cleanupTime = Date.now() - context.startTime;
    console.log(`Test cleanup completed in ${cleanupTime}ms`);
  } catch (error) {
    console.error('Cleanup failed:', error);
    throw error;
  }
}

describe('Context Management Integration Tests', () => {
  let testContext: TestContext;

  // Setup test environment
  beforeAll(async () => {
    jest.setTimeout(TEST_TIMEOUT);
    testContext = await setupTestContext();
  });

  // Cleanup after tests
  afterAll(async () => {
    await cleanupTestContext(testContext);
  });

  describe('Short-term Context Management', () => {
    it('should maintain short-term context within message limit', async () => {
      const { chatGroup, users } = testContext;
      const messages: IMessage[] = [];

      // Generate test messages
      for (let i = 0; i < MAX_SHORT_TERM_MESSAGES + 5; i++) {
        const message: IMessage = {
          id: `msg-${i}`,
          chatId: chatGroup.id,
          senderId: users[i % users.length].id,
          content: `Test message ${i}`,
          threadId: '',
          timestamp: Timestamp.fromDate(new Date()),
          metadata: {
            type: MessageType.TEXT,
            formatting: {},
            mentions: [],
            aiContext: {}
          }
        };
        messages.push(message);
      }

      // Add messages and verify context size
      for (const message of messages) {
        await waitForDatabaseSync();
        testContext.messages.push(message);
      }

      // Verify context size stays within limit
      const contextSize = testContext.messages.length;
      expect(contextSize).toBeLessThanOrEqual(MAX_SHORT_TERM_MESSAGES);

      // Verify oldest messages are removed
      const oldestMessage = testContext.messages[0];
      expect(oldestMessage.id).not.toBe('msg-0');
    });
  });

  describe('Long-term Context Management', () => {
    it('should store and retrieve long-term context with vector similarity', async () => {
      const { chatGroup, users, vectorStore } = testContext;

      // Create message with specific context
      const contextMessage: IMessage = {
        id: 'context-msg-1',
        chatId: chatGroup.id,
        senderId: users[0].id,
        content: 'Looking for Italian restaurants in downtown',
        threadId: '',
        timestamp: Timestamp.fromDate(new Date()),
        metadata: {
          type: MessageType.TEXT,
          formatting: {},
          mentions: ['@foodie'],
          aiContext: {
            domain: 'restaurant',
            context: 'Italian cuisine, downtown location'
          }
        }
      };

      // Store message and generate embedding
      await waitForDatabaseSync();
      testContext.messages.push(contextMessage);

      // Query similar context
      const similarQuery = 'Italian dining options in city center';
      const results = await vectorStore.similaritySearch(similarQuery);

      // Validate similarity results
      expect(results).toBeDefined();
      expect(results[0].score).toBeGreaterThan(VECTOR_SIMILARITY_THRESHOLD);
      expect(results[0].message.id).toBe(contextMessage.id);
    });
  });

  describe('Concurrent Context Updates', () => {
    it('should handle concurrent context updates correctly', async () => {
      const { chatGroup, users } = testContext;
      const updatePromises = [];

      // Generate concurrent updates
      for (let i = 0; i < 5; i++) {
        const message: IMessage = {
          id: `concurrent-${i}`,
          chatId: chatGroup.id,
          senderId: users[i % users.length].id,
          content: `Concurrent message ${i}`,
          threadId: '',
          timestamp: Timestamp.fromDate(new Date()),
          metadata: {
            type: MessageType.TEXT,
            formatting: {},
            mentions: [],
            aiContext: {}
          }
        };

        updatePromises.push(
          waitForDatabaseSync()
            .then(() => testContext.messages.push(message))
        );
      }

      // Execute concurrent updates
      await Promise.all(updatePromises);

      // Verify context consistency
      expect(testContext.messages.length).toBeLessThanOrEqual(MAX_SHORT_TERM_MESSAGES);
      const messageIds = new Set(testContext.messages.map(m => m.id));
      expect(messageIds.size).toBe(testContext.messages.length);
    });
  });

  describe('Context Cleanup', () => {
    it('should cleanup stale contexts correctly', async () => {
      const { chatGroup, users } = testContext;

      // Create messages with different timestamps
      const oldMessage: IMessage = {
        id: 'old-msg',
        chatId: chatGroup.id,
        senderId: users[0].id,
        content: 'Old message',
        threadId: '',
        timestamp: Timestamp.fromDate(new Date(Date.now() - 86400000)), // 24h old
        metadata: {
          type: MessageType.TEXT,
          formatting: {},
          mentions: [],
          aiContext: {}
        }
      };

      testContext.messages.push(oldMessage);
      await waitForDatabaseSync();

      // Trigger cleanup
      const beforeCount = testContext.messages.length;
      await waitForDatabaseSync();
      const afterCount = testContext.messages.length;

      // Verify cleanup
      expect(afterCount).toBeLessThan(beforeCount);
      const remainingIds = testContext.messages.map(m => m.id);
      expect(remainingIds).not.toContain(oldMessage.id);
    });
  });

  describe('Group Dynamics Context', () => {
    it('should track group interaction patterns correctly', async () => {
      const { chatGroup, users } = testContext;

      // Generate interaction pattern
      const interactions = users.map((user, index) => ({
        id: `interaction-${index}`,
        chatId: chatGroup.id,
        senderId: user.id,
        content: `User ${index} message`,
        threadId: '',
        timestamp: Timestamp.fromDate(new Date()),
        metadata: {
          type: MessageType.TEXT,
          formatting: {},
          mentions: index > 0 ? [users[index - 1].id] : [],
          aiContext: {}
        }
      }));

      // Add interactions
      for (const interaction of interactions) {
        await waitForDatabaseSync();
        testContext.messages.push(interaction);
      }

      // Verify group dynamics
      const groupMetrics = chatGroup.dynamics;
      expect(groupMetrics).toBeDefined();
      expect(groupMetrics.interactionPatterns).toBeDefined();
      expect(groupMetrics.participationRate).toBeGreaterThan(0);
    });
  });
});