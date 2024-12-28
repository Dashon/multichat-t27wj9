/**
 * @fileoverview End-to-end tests for real-time message synchronization
 * Validates message delivery, ordering, state consistency, and AI agent interactions
 * @version 1.0.0
 */

import { jest, describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals'; // ^29.0.0
import WebSocketTestClient from '../../utils/websocket-client';
import { createTestUser, createTestChatGroup, waitForDatabaseSync } from '../../utils/test-helpers';
import TestConfig from '../../config/test-config';
import { MessageType } from '../../../backend/message-service/src/interfaces/message.interface';

// Test configuration and constants
const TEST_TIMEOUT = 30000;
const MESSAGE_DELIVERY_TIMEOUT = 2000;
const DATABASE_SYNC_TIMEOUT = 1000;
const PERFORMANCE_THRESHOLDS = {
  messageDelivery: 2000,
  dbQuery: 100,
  aiResponse: 5000
};

// Test client configuration
interface TestClientSetup {
  clients: WebSocketTestClient[];
  chatGroup: any;
  users: any[];
}

/**
 * Sets up test clients and chat group with AI configuration
 * @param clientCount Number of test clients to create
 * @param aiAgents Array of AI agent types to include
 */
async function setupTestClients(clientCount: number, aiAgents: string[] = []): Promise<TestClientSetup> {
  const config = TestConfig.getInstance().getConfig('e2e');
  
  // Create test users and chat group
  const users = await Promise.all(
    Array(clientCount).fill(null).map(() => createTestUser())
  );
  
  const chatGroup = await createTestChatGroup(
    clientCount,
    aiAgents,
    { messageValidation: true }
  );

  // Initialize WebSocket clients
  const clients = await Promise.all(
    users.map(async (user) => {
      const client = new WebSocketTestClient({
        url: config.wsEndpoint,
        timeout: MESSAGE_DELIVERY_TIMEOUT,
        validateMessages: true
      });
      await client.connect();
      return client;
    })
  );

  return { clients, chatGroup, users };
}

/**
 * Cleans up test resources and validates final state
 */
async function cleanupTestClients(setup: TestClientSetup): Promise<void> {
  const { clients, chatGroup } = setup;
  
  // Collect final metrics
  const metrics = clients.map(client => client.getPerformanceMetrics());
  
  // Disconnect clients
  await Promise.all(clients.map(client => client.disconnect()));
  
  // Wait for database synchronization
  await waitForDatabaseSync({
    timeout: DATABASE_SYNC_TIMEOUT,
    consistencyLevel: 'strong'
  });
}

describe('Real-time Message Synchronization', () => {
  let testSetup: TestClientSetup;

  beforeAll(async () => {
    // Initialize test configuration
    await TestConfig.getInstance().initialize({
      performanceMonitoring: true,
      aiAgentTesting: true
    });
  });

  afterAll(async () => {
    // Final cleanup and metric validation
    if (testSetup) {
      await cleanupTestClients(testSetup);
    }
  });

  beforeEach(async () => {
    jest.setTimeout(TEST_TIMEOUT);
  });

  it('should deliver messages to all clients within 2 seconds', async () => {
    // Set up test environment
    testSetup = await setupTestClients(3);
    const { clients, chatGroup } = testSetup;
    
    // Send test message
    const testMessage = {
      content: 'Test message for delivery validation',
      type: MessageType.TEXT,
      chatId: chatGroup.id
    };

    const startTime = Date.now();
    await clients[0].sendMessage('message', testMessage);

    // Wait for message delivery to all clients
    const deliveryPromises = clients.slice(1).map(client =>
      client.waitForMessage('message', MESSAGE_DELIVERY_TIMEOUT)
    );

    const responses = await Promise.all(deliveryPromises);
    const endTime = Date.now();

    // Validate delivery time and content
    const deliveryTime = endTime - startTime;
    expect(deliveryTime).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.messageDelivery);

    responses.forEach(response => {
      expect(response.content).toBe(testMessage.content);
      expect(response.type).toBe(testMessage.type);
    });
  });

  it('should maintain message order and state consistency', async () => {
    testSetup = await setupTestClients(3);
    const { clients, chatGroup } = testSetup;

    // Send multiple messages concurrently
    const messages = Array(5).fill(null).map((_, index) => ({
      content: `Test message ${index}`,
      type: MessageType.TEXT,
      chatId: chatGroup.id,
      sequence: index
    }));

    await Promise.all(
      messages.map(msg => clients[0].sendMessage('message', msg))
    );

    // Wait for database sync
    await waitForDatabaseSync({
      timeout: DATABASE_SYNC_TIMEOUT,
      consistencyLevel: 'strong'
    });

    // Verify message order on all clients
    for (const client of clients.slice(1)) {
      const messageHistory = client.getMessageHistory();
      
      // Validate sequence
      messageHistory.forEach((msg, index) => {
        expect(msg.sequence).toBe(index);
      });
    }
  });

  it('should handle network issues and reconnection', async () => {
    testSetup = await setupTestClients(3);
    const { clients, chatGroup } = testSetup;

    // Simulate network disruption
    await clients[1].disconnect();
    
    // Send messages during disruption
    const message = {
      content: 'Message during disruption',
      type: MessageType.TEXT,
      chatId: chatGroup.id
    };
    
    await clients[0].sendMessage('message', message);

    // Reconnect and verify message recovery
    await clients[1].connect();
    
    const recoveredMessage = await clients[1].waitForMessage(
      'message',
      MESSAGE_DELIVERY_TIMEOUT
    );

    expect(recoveredMessage.content).toBe(message.content);
  });

  it('should integrate AI agents with performance requirements', async () => {
    testSetup = await setupTestClients(3, ['@explorer', '@foodie']);
    const { clients, chatGroup } = testSetup;

    // Trigger AI agent interaction
    const messageWithAI = {
      content: '@explorer where should we visit?',
      type: MessageType.TEXT,
      chatId: chatGroup.id,
      metadata: {
        mentions: ['@explorer']
      }
    };

    const startTime = Date.now();
    await clients[0].sendMessage('message', messageWithAI);

    // Wait for AI response
    const aiResponse = await clients[0].waitForMessage(
      'ai_response',
      PERFORMANCE_THRESHOLDS.aiResponse
    );

    const responseTime = Date.now() - startTime;

    // Validate AI response
    expect(responseTime).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.aiResponse);
    expect(aiResponse.metadata.aiContext).toBeDefined();
    expect(aiResponse.metadata.aiContext.confidence).toBeGreaterThanOrEqual(0.85);
  });
});