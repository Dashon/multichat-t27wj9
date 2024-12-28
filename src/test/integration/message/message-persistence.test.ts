/**
 * @fileoverview Integration tests for message persistence functionality
 * Verifies message storage, threading, metadata handling, and AI context persistence
 * @version 1.0.0
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals'; // ^29.0.0
import mongoose from 'mongoose'; // ^7.0.0
import { IMessage } from '../../../backend/message-service/src/interfaces/message.interface';
import { MessageModel } from '../../../backend/message-service/src/models/message.model';
import { setupTestEnvironment, teardownTestEnvironment } from '../../utils/test-setup';
import { testHelpers } from '../../utils/test-helpers';

describe('Message Persistence Integration Tests', () => {
  // Test environment setup
  beforeAll(async () => {
    await setupTestEnvironment({
      databases: { mongo: true },
      performanceMonitoring: true
    });
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  describe('Basic Message Storage', () => {
    it('should create and store new messages within 2s SLA', async () => {
      // Create test user and chat group
      const user = await testHelpers.createTestUser();
      const chatGroup = await testHelpers.createTestChatGroup();

      const startTime = Date.now();
      const message = await testHelpers.createTestMessage({
        chatId: chatGroup.id,
        senderId: user.id,
        content: 'Test message content'
      });

      // Verify message creation time
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(2000); // 2s SLA

      // Verify message persistence
      const storedMessage = await MessageModel.findOne({ id: message.id });
      expect(storedMessage).toBeTruthy();
      expect(storedMessage?.content).toBe('Test message content');
    });

    it('should retrieve messages by chat ID with correct sharding', async () => {
      const chatId = new mongoose.Types.ObjectId().toString();
      const messageCount = 10;
      
      // Create multiple test messages
      const messages = await Promise.all(
        Array(messageCount).fill(null).map(() => 
          testHelpers.createTestMessage({ chatId })
        )
      );

      // Verify retrieval with pagination
      const retrievedMessages = await MessageModel.findByChatId(chatId, {
        limit: 5,
        offset: 0
      });

      expect(retrievedMessages).toHaveLength(5);
      expect(retrievedMessages[0].chatId).toBe(chatId);
    });

    it('should handle concurrent message creation without conflicts', async () => {
      const chatId = new mongoose.Types.ObjectId().toString();
      const concurrentMessages = 50;

      // Create messages concurrently
      const messagePromises = Array(concurrentMessages).fill(null).map(() =>
        testHelpers.createTestMessage({ chatId })
      );

      const messages = await Promise.all(messagePromises);
      const uniqueIds = new Set(messages.map(m => m.id));

      expect(uniqueIds.size).toBe(concurrentMessages);
    });
  });

  describe('Message Threading', () => {
    it('should create and maintain thread relationships', async () => {
      // Create parent message
      const parentMessage = await testHelpers.createTestMessage();
      
      // Create threaded replies
      const replies = await Promise.all([
        testHelpers.createTestMessage({ threadId: parentMessage.id }),
        testHelpers.createTestMessage({ threadId: parentMessage.id }),
        testHelpers.createTestMessage({ threadId: parentMessage.id })
      ]);

      // Verify thread relationships
      const threadedMessages = await MessageModel.findByThreadId(
        parentMessage.id,
        { limit: 10, offset: 0 }
      );

      expect(threadedMessages).toHaveLength(3);
      expect(threadedMessages[0].threadId).toBe(parentMessage.id);
    });

    it('should update thread metadata accurately', async () => {
      const threadParent = await testHelpers.createTestMessage();
      const participants = ['user1', 'user2', 'user3'];

      // Add messages to thread
      await Promise.all(
        participants.map(userId =>
          testHelpers.createTestMessage({
            threadId: threadParent.id,
            senderId: userId
          })
        )
      );

      // Verify thread metadata
      const updatedParent = await MessageModel.findOne({ id: threadParent.id });
      expect(updatedParent?.threadMetadata?.participantIds).toHaveLength(3);
      expect(updatedParent?.threadMetadata?.messageCount).toBe(3);
    });
  });

  describe('Message Metadata', () => {
    it('should store and retrieve different message types', async () => {
      // Create messages with different types
      const textMessage = await testHelpers.createTestMessage();
      const aiMessage = await testHelpers.createTestAIMessage();

      // Verify message types
      const storedText = await MessageModel.findOne({ id: textMessage.id });
      const storedAI = await MessageModel.findOne({ id: aiMessage.id });

      expect(storedText?.metadata.type).toBe('TEXT');
      expect(storedAI?.metadata.type).toBe('AI_RESPONSE');
    });

    it('should preserve formatting and emoji data', async () => {
      const formattedMessage = await testHelpers.createTestMessage({
        metadata: {
          formatting: {
            bold: 'true',
            italic: 'true',
            emoji: '👋'
          }
        }
      });

      const stored = await MessageModel.findOne({ id: formattedMessage.id });
      expect(stored?.metadata.formatting.get('bold')).toBe('true');
      expect(stored?.metadata.formatting.get('italic')).toBe('true');
      expect(stored?.metadata.formatting.get('emoji')).toBe('👋');
    });
  });

  describe('AI Message Handling', () => {
    it('should store AI agent context accurately', async () => {
      const aiMessage = await testHelpers.createTestAIMessage({
        agentId: '@explorer',
        confidence: 0.95,
        context: {
          domain: 'travel',
          sources: ['source1', 'source2']
        }
      });

      const stored = await MessageModel.findOne({ id: aiMessage.id });
      expect(stored?.metadata.aiContext.get('confidence')).toBe('0.95');
      expect(stored?.metadata.aiContext.get('domain')).toBe('travel');
    });

    it('should maintain AI context history', async () => {
      const chatId = new mongoose.Types.ObjectId().toString();
      const contextHistory = [];

      // Create sequence of AI interactions
      for (let i = 0; i < 5; i++) {
        const aiMessage = await testHelpers.createTestAIMessage({
          chatId,
          context: {
            previousInteractions: contextHistory.slice()
          }
        });
        contextHistory.push(aiMessage.id);
      }

      // Verify context chain
      const messages = await MessageModel.findByChatId(chatId, {
        limit: 5,
        offset: 0
      });

      expect(messages).toHaveLength(5);
      expect(messages[4].metadata.aiContext.get('previousInteractions'))
        .toContain(messages[0].id);
    });
  });

  describe('Performance Validation', () => {
    it('should meet 2s message delivery SLA under load', async () => {
      const messageCount = 100;
      const chatId = new mongoose.Types.ObjectId().toString();
      const startTime = Date.now();

      // Create messages in bulk
      await Promise.all(
        Array(messageCount).fill(null).map(() =>
          testHelpers.createTestMessage({ chatId })
        )
      );

      const endTime = Date.now();
      const averageTime = (endTime - startTime) / messageCount;

      expect(averageTime).toBeLessThan(2000);
    });

    it('should maintain query performance with large threads', async () => {
      const threadId = new mongoose.Types.ObjectId().toString();
      const messageCount = 1000;

      // Create large thread
      await Promise.all(
        Array(messageCount).fill(null).map(() =>
          testHelpers.createTestMessage({ threadId })
        )
      );

      // Measure query performance
      const startTime = Date.now();
      const messages = await MessageModel.findByThreadId(threadId, {
        limit: 50,
        offset: 0
      });
      const queryTime = Date.now() - startTime;

      expect(queryTime).toBeLessThan(500); // 500ms SLA for queries
      expect(messages).toHaveLength(50);
    });
  });
});