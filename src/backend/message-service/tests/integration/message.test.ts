/**
 * @fileoverview Integration tests for message service verifying real-time message handling,
 * persistence, delivery functionality including threading, AI agent integration, and performance monitoring.
 * @version 1.0.0
 */

// External imports - versions specified for production stability
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals'; // v29.x
import { Socket } from 'socket.io-client'; // v4.7.2
import { PerformanceObserver } from 'perf_hooks'; // node:18

// Internal imports
import { IMessage } from '../../src/interfaces/message.interface';
import { MessageService } from '../../src/services/message.service';
import { TestEnvironment } from '../../../test/utils/test-setup';
import { MockDataGenerators } from '../../../test/utils/mock-data';

// Constants for test configuration
const TEST_TIMEOUT = 30000;
const WEBSOCKET_URL = 'ws://localhost:3000';
const DELIVERY_SLA_MS = 2000;
const AI_RESPONSE_TIMEOUT = 5000;
const PERFORMANCE_METRICS_INTERVAL = 100;

describe('MessageService Integration Tests', () => {
  let messageService: MessageService;
  let testEnv: TestEnvironment;
  let testSocket: Socket;
  let performanceObserver: PerformanceObserver;

  // Test data holders
  let testChatGroup: any;
  let testMessages: IMessage[];
  let testThread: IMessage[];

  beforeAll(async () => {
    // Initialize test environment with AI and performance monitoring
    testEnv = new TestEnvironment();
    await testEnv.setupTestEnvironment({
      databases: { mongo: true, redis: true },
      aiValidation: true,
      performanceMonitoring: true
    });

    // Initialize performance monitoring
    performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.duration > DELIVERY_SLA_MS) {
          console.warn(`Performance warning: ${entry.name} took ${entry.duration}ms`);
        }
      });
    });
    performanceObserver.observe({ entryTypes: ['measure'], buffered: true });

    // Initialize WebSocket connection
    testSocket = new Socket(WEBSOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true
    });
  });

  beforeEach(async () => {
    // Generate fresh test data for each test
    testChatGroup = await MockDataGenerators.generateMockChatGroup(5, ['@explorer', '@foodie']);
    testMessages = Array(5).fill(null).map(() => 
      MockDataGenerators.generateMockMessage(testChatGroup.id, testChatGroup.participants[0].id)
    );
    testThread = Array(3).fill(null).map(() =>
      MockDataGenerators.generateMockMessage(testChatGroup.id, testChatGroup.participants[1].id, {}, testMessages[0].id)
    );
  });

  afterEach(async () => {
    // Clear test data and reset metrics
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterAll(async () => {
    // Cleanup test environment
    performanceObserver.disconnect();
    testSocket.close();
    await testEnv.cleanup();
  });

  describe('Real-time Message Delivery', () => {
    it('should deliver messages within SLA timeframe', async () => {
      // Arrange
      const testMessage = testMessages[0];
      let deliveryTime: number;

      // Act
      performance.mark('deliveryStart');
      
      const messagePromise = new Promise<void>((resolve) => {
        testSocket.once('new-message', () => {
          performance.mark('deliveryEnd');
          performance.measure('messageDelivery', 'deliveryStart', 'deliveryEnd');
          deliveryTime = performance.getEntriesByName('messageDelivery')[0].duration;
          resolve();
        });
      });

      await messageService.sendMessage(testMessage);
      await messagePromise;

      // Assert
      expect(deliveryTime).toBeLessThanOrEqual(DELIVERY_SLA_MS);
    }, TEST_TIMEOUT);

    it('should maintain message order in real-time delivery', async () => {
      // Arrange
      const receivedMessages: IMessage[] = [];

      // Act
      const messagePromise = new Promise<void>((resolve) => {
        let count = 0;
        testSocket.on('new-message', (message: IMessage) => {
          receivedMessages.push(message);
          count++;
          if (count === testMessages.length) {
            resolve();
          }
        });
      });

      for (const message of testMessages) {
        await messageService.sendMessage(message);
      }

      await messagePromise;

      // Assert
      expect(receivedMessages.map(m => m.id))
        .toEqual(testMessages.map(m => m.id));
    });
  });

  describe('Message Threading', () => {
    it('should maintain thread integrity and metadata', async () => {
      // Arrange
      const parentMessage = testMessages[0];
      await messageService.sendMessage(parentMessage);

      // Act
      for (const threadMessage of testThread) {
        await messageService.sendMessage(threadMessage);
      }

      // Assert
      const threadMessages = await messageService.getMessagesByThreadId(parentMessage.id);
      expect(threadMessages).toHaveLength(testThread.length);
      expect(threadMessages[0].threadMetadata).toBeDefined();
      expect(threadMessages[0].threadMetadata!.participantIds)
        .toContain(testThread[0].senderId);
    });

    it('should update thread metadata on new messages', async () => {
      // Arrange
      const parentMessage = testMessages[0];
      await messageService.sendMessage(parentMessage);
      await Promise.all(testThread.map(m => messageService.sendMessage(m)));

      // Act
      const newThreadMessage = MockDataGenerators.generateMockMessage(
        testChatGroup.id,
        testChatGroup.participants[2].id,
        {},
        parentMessage.id
      );
      await messageService.sendMessage(newThreadMessage);

      // Assert
      const updatedThread = await messageService.getMessagesByThreadId(parentMessage.id);
      expect(updatedThread).toHaveLength(testThread.length + 1);
      expect(updatedThread[0].threadMetadata!.messageCount)
        .toBe(testThread.length + 1);
    });
  });

  describe('AI Agent Integration', () => {
    it('should process AI mentions and generate responses', async () => {
      // Arrange
      const messageWithAIMention = MockDataGenerators.generateMockMessage(
        testChatGroup.id,
        testChatGroup.participants[0].id,
        { bold: true }
      );
      messageWithAIMention.content = 'Hey @explorer, what are some interesting places nearby?';

      // Act
      const responsePromise = new Promise<IMessage>((resolve) => {
        testSocket.once('new-message', (message: IMessage) => {
          if (message.metadata.type === 'AI_RESPONSE') {
            resolve(message);
          }
        });
      });

      await messageService.sendMessage(messageWithAIMention);
      const aiResponse = await responsePromise;

      // Assert
      expect(aiResponse.metadata.type).toBe('AI_RESPONSE');
      expect(aiResponse.metadata.mentions).toContain(messageWithAIMention.id);
      expect(Number(aiResponse.metadata.aiContext.confidence)).toBeGreaterThanOrEqual(0.7);
    }, AI_RESPONSE_TIMEOUT);

    it('should maintain AI context across multiple interactions', async () => {
      // Arrange
      const conversationMessages = [
        'Hey @explorer, what are some interesting places in Paris?',
        'And @foodie, what restaurants are near the Eiffel Tower?'
      ].map(content => {
        const msg = MockDataGenerators.generateMockMessage(
          testChatGroup.id,
          testChatGroup.participants[0].id
        );
        msg.content = content;
        return msg;
      });

      // Act
      const responses: IMessage[] = [];
      const responsePromise = new Promise<void>((resolve) => {
        let responseCount = 0;
        testSocket.on('new-message', (message: IMessage) => {
          if (message.metadata.type === 'AI_RESPONSE') {
            responses.push(message);
            responseCount++;
            if (responseCount === 2) resolve();
          }
        });
      });

      for (const message of conversationMessages) {
        await messageService.sendMessage(message);
      }

      await responsePromise;

      // Assert
      expect(responses).toHaveLength(2);
      expect(responses[1].metadata.aiContext.previousContext).toBeDefined();
      expect(JSON.parse(responses[1].metadata.aiContext.previousContext))
        .toContain(responses[0].id);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track and report message delivery metrics', async () => {
      // Arrange
      const metrics: number[] = [];
      const measurementPromise = new Promise<void>((resolve) => {
        let count = 0;
        const interval = setInterval(() => {
          const deliveryMetrics = messageService.getDeliveryMetrics();
          metrics.push(deliveryMetrics.averageDeliveryTime);
          count++;
          if (count === 10) {
            clearInterval(interval);
            resolve();
          }
        }, PERFORMANCE_METRICS_INTERVAL);
      });

      // Act
      for (const message of testMessages) {
        await messageService.sendMessage(message);
      }

      await measurementPromise;

      // Assert
      const averageDeliveryTime = metrics.reduce((a, b) => a + b) / metrics.length;
      expect(averageDeliveryTime).toBeLessThanOrEqual(DELIVERY_SLA_MS);
      expect(Math.max(...metrics)).toBeLessThanOrEqual(DELIVERY_SLA_MS * 1.5);
    });
  });
});