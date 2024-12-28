/**
 * @fileoverview Integration tests for WebSocket connections in the message service
 * Tests real-time message delivery, scaling, and performance requirements
 * @version 1.0.0
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals'; // ^29.0.0
import WebSocketTestClient from '../../utils/websocket-client';
import { TestHelpers } from '../../utils/test-helpers';
import { WebSocketConfig } from '../../../backend/message-service/src/config/websocket.config';
import { MessageType } from '../../../backend/message-service/src/interfaces/message.interface';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const WEBSOCKET_TIMEOUT = 5000;
const MAX_CONCURRENT_USERS = 5000;
const MESSAGE_DELIVERY_TIMEOUT = 2000; // 2s SLA requirement
const MESSAGE_RATE_LIMIT = 1000; // 1000 Msgs/Sec requirement
const SCALING_THRESHOLD = 0.8;

/**
 * WebSocket connection test suite
 * Tests real-time messaging capabilities and performance requirements
 */
describe('WebSocket Connection Integration Tests', () => {
  let wsConfig: WebSocketConfig;
  let testClients: WebSocketTestClient[] = [];
  let testUsers: any[] = [];
  let testGroup: any;

  /**
   * Set up test environment before all tests
   */
  beforeAll(async () => {
    // Initialize WebSocket configuration
    wsConfig = {
      port: 3001,
      path: '/chat',
      corsOrigin: '*',
      maxConnections: MAX_CONCURRENT_USERS,
      messageRateLimit: MESSAGE_RATE_LIMIT,
      namespace: '/chat',
      monitoring: {
        metrics: true,
        healthCheck: true,
        latencyThreshold: 100
      },
      scaling: {
        sticky: true,
        adaptivePolling: true
      }
    };

    // Create test users and chat group
    testUsers = await Promise.all([
      TestHelpers.createTestUser(),
      TestHelpers.createTestUser(),
      TestHelpers.createTestUser()
    ]);

    testGroup = await TestHelpers.createTestChatGroup(
      testUsers.length,
      ['@explorer', '@foodie'],
      { enableAI: true }
    );

    jest.setTimeout(TEST_TIMEOUT);
  });

  /**
   * Clean up test environment after all tests
   */
  afterAll(async () => {
    await Promise.all(testClients.map(client => client.disconnect()));
    testClients = [];
  });

  /**
   * Reset test state before each test
   */
  beforeEach(async () => {
    testClients = [];
  });

  /**
   * Clean up after each test
   */
  afterEach(async () => {
    await Promise.all(testClients.map(client => client.disconnect()));
    testClients = [];
  });

  /**
   * Test basic WebSocket connection establishment
   */
  it('should establish WebSocket connection with authentication', async () => {
    const client = new WebSocketTestClient({
      url: `ws://localhost:${wsConfig.port}`,
      path: wsConfig.path,
      timeout: WEBSOCKET_TIMEOUT
    });

    await client.connect();
    testClients.push(client);

    const stats = client.getPerformanceMetrics();
    expect(stats.get('connectionTime')).toBeDefined();
    expect(client['isConnected']).toBe(true);
  });

  /**
   * Test real-time message delivery within SLA
   */
  it('should deliver messages within 2 second SLA', async () => {
    const [sender, receiver] = await Promise.all([
      new WebSocketTestClient({
        url: `ws://localhost:${wsConfig.port}`,
        path: wsConfig.path
      }).connect(),
      new WebSocketTestClient({
        url: `ws://localhost:${wsConfig.port}`,
        path: wsConfig.path
      }).connect()
    ]);

    testClients.push(sender, receiver);

    const messageData = {
      chatId: testGroup.id,
      content: 'Test message',
      type: MessageType.TEXT
    };

    const deliveryTime = await TestHelpers.measureMessageDeliveryTime(
      sender,
      receiver,
      messageData
    );

    expect(deliveryTime).toBeLessThanOrEqual(MESSAGE_DELIVERY_TIMEOUT);
  });

  /**
   * Test scaling capabilities with concurrent connections
   */
  it('should handle 5000 concurrent connections with sticky sessions', async () => {
    const concurrentUsers = await TestHelpers.simulateConcurrentUsers(
      MAX_CONCURRENT_USERS,
      wsConfig
    );

    const connections = await Promise.all(
      concurrentUsers.map(user => {
        const client = new WebSocketTestClient({
          url: `ws://localhost:${wsConfig.port}`,
          path: wsConfig.path
        });
        testClients.push(client);
        return client.connect();
      })
    );

    const activeConnections = testClients.filter(
      client => client['isConnected']
    ).length;

    expect(activeConnections).toBeGreaterThanOrEqual(
      MAX_CONCURRENT_USERS * SCALING_THRESHOLD
    );
  });

  /**
   * Test message throughput capacity
   */
  it('should handle 1000 messages per second', async () => {
    const sender = new WebSocketTestClient({
      url: `ws://localhost:${wsConfig.port}`,
      path: wsConfig.path
    });

    await sender.connect();
    testClients.push(sender);

    const messageCount = MESSAGE_RATE_LIMIT;
    const startTime = Date.now();

    const messages = Array(messageCount)
      .fill(null)
      .map((_, index) => ({
        chatId: testGroup.id,
        content: `Test message ${index}`,
        type: MessageType.TEXT
      }));

    await Promise.all(
      messages.map(msg => sender.sendMessage('message', msg))
    );

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    const throughput = messageCount / duration;

    expect(throughput).toBeGreaterThanOrEqual(MESSAGE_RATE_LIMIT);
  });

  /**
   * Test WebSocket reconnection handling
   */
  it('should handle connection interruptions and reconnect', async () => {
    const client = new WebSocketTestClient({
      url: `ws://localhost:${wsConfig.port}`,
      path: wsConfig.path,
      autoReconnect: true
    });

    await client.connect();
    testClients.push(client);

    // Simulate network interruption
    await client.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await client.connect();

    expect(client['isConnected']).toBe(true);
    const stats = client.getPerformanceMetrics();
    expect(stats.get('connectionTime')).toBeDefined();
  });

  /**
   * Test sticky session maintenance during scaling
   */
  it('should maintain sticky sessions during horizontal scaling', async () => {
    const client = new WebSocketTestClient({
      url: `ws://localhost:${wsConfig.port}`,
      path: wsConfig.path
    });

    await client.connect();
    testClients.push(client);

    const initialSessionId = client['socket']?.id;
    
    // Simulate multiple reconnections
    for (let i = 0; i < 3; i++) {
      await client.disconnect();
      await client.connect();
    }

    expect(client['socket']?.id).toBe(initialSessionId);
  });
});