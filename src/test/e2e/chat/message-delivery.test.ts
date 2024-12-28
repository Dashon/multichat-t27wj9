/**
 * End-to-end tests for message delivery functionality in the AI-Enhanced Group Chat Platform
 * Tests real-time message delivery, persistence, and AI agent interactions
 * @version 1.0.0
 */

// External imports
import { jest, describe, beforeAll, afterAll, test, expect } from '@jest/globals'; // ^29.0.0

// Internal imports
import WebSocketTestClient, { WebSocketMessage } from '../../utils/websocket-client';
import { createTestUser, createTestChatGroup, waitForDatabaseSync } from '../../utils/test-helpers';
import { generateMockMessage } from '../../utils/mock-data';
import { MessageType } from '../../../backend/message-service/src/interfaces/message.interface';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const DELIVERY_TIMEOUT = 2000; // 2 seconds SLA requirement
const DATABASE_SYNC_TIMEOUT = 5000;
const AI_RESPONSE_TIMEOUT = 5000;
const PERFORMANCE_THRESHOLDS = {
  deliveryTime: 2000,
  aiResponseTime: 5000,
  successRate: 0.999
};

// Test state variables
let senderClient: WebSocketTestClient;
let receiverClient: WebSocketTestClient;
let testGroup: any;
let testUsers: any[];
let performanceMetrics: Map<string, number[]> = new Map();

describe('Message Delivery E2E Tests', () => {
  beforeAll(async () => {
    // Initialize test environment
    jest.setTimeout(TEST_TIMEOUT);

    // Create test users with AI interaction capabilities
    testUsers = await Promise.all([
      createTestUser('USER', { notifications: true }, { preferredAgents: ['@explorer'] }),
      createTestUser('USER', { notifications: true }, { preferredAgents: ['@foodie'] })
    ]);

    // Create test chat group with AI agents
    testGroup = await createTestChatGroup(2, ['@explorer', '@foodie'], {
      enableAIInteractions: true,
      messageRetention: '12months'
    });

    // Initialize WebSocket clients with enhanced metrics collection
    senderClient = new WebSocketTestClient({
      url: process.env.WS_URL || 'ws://localhost:3001',
      path: '/chat',
      timeout: DELIVERY_TIMEOUT,
      validateMessages: true
    });

    receiverClient = new WebSocketTestClient({
      url: process.env.WS_URL || 'ws://localhost:3001',
      path: '/chat',
      timeout: DELIVERY_TIMEOUT,
      validateMessages: true
    });

    // Connect clients
    await Promise.all([
      senderClient.connect(),
      receiverClient.connect()
    ]);

    // Initialize performance metrics tracking
    performanceMetrics.set('messageDelivery', []);
    performanceMetrics.set('aiResponse', []);
  });

  afterAll(async () => {
    // Collect and log performance metrics
    const deliveryTimes = performanceMetrics.get('messageDelivery') || [];
    const aiResponseTimes = performanceMetrics.get('aiResponse') || [];

    console.info('Performance Metrics:', {
      averageDeliveryTime: deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length,
      averageAIResponseTime: aiResponseTimes.reduce((a, b) => a + b, 0) / aiResponseTimes.length,
      successRate: deliveryTimes.filter(t => t <= PERFORMANCE_THRESHOLDS.deliveryTime).length / deliveryTimes.length
    });

    // Cleanup
    await Promise.all([
      senderClient.disconnect(),
      receiverClient.disconnect()
    ]);

    // Wait for database cleanup
    await waitForDatabaseSync({
      timeout: DATABASE_SYNC_TIMEOUT,
      consistencyLevel: 'strong'
    });
  });

  test('should deliver message within SLA timeframe', async () => {
    // Generate test message
    const message = generateMockMessage(
      testGroup.id,
      testUsers[0].id,
      { bold: true, italic: false },
      undefined
    );

    // Record start time for delivery metrics
    const startTime = Date.now();

    // Send message
    await senderClient.sendMessage('chat:message', {
      type: MessageType.TEXT,
      chatId: testGroup.id,
      content: message.content,
      metadata: message.metadata
    });

    // Wait for message receipt
    const receivedMessage = await receiverClient.waitForMessage('chat:message', DELIVERY_TIMEOUT);

    // Calculate and record delivery time
    const deliveryTime = Date.now() - startTime;
    performanceMetrics.get('messageDelivery')?.push(deliveryTime);

    // Assertions
    expect(receivedMessage).toBeDefined();
    expect(receivedMessage.content).toBe(message.content);
    expect(deliveryTime).toBeLessThanOrEqual(DELIVERY_TIMEOUT);

    // Verify message persistence
    await waitForDatabaseSync({ timeout: DATABASE_SYNC_TIMEOUT });
    // Database verification would be implemented here
  });

  test('should deliver message to all group members', async () => {
    // Create additional test client for group testing
    const thirdClient = new WebSocketTestClient({
      url: process.env.WS_URL || 'ws://localhost:3001',
      path: '/chat',
      timeout: DELIVERY_TIMEOUT
    });
    await thirdClient.connect();

    // Generate group message
    const groupMessage = generateMockMessage(
      testGroup.id,
      testUsers[0].id,
      { emoji: true }
    );

    // Track delivery to all clients
    const deliveryPromises = [
      receiverClient.waitForMessage('chat:message', DELIVERY_TIMEOUT),
      thirdClient.waitForMessage('chat:message', DELIVERY_TIMEOUT)
    ];

    // Send message
    const startTime = Date.now();
    await senderClient.sendMessage('chat:message', {
      type: MessageType.TEXT,
      chatId: testGroup.id,
      content: groupMessage.content,
      metadata: groupMessage.metadata
    });

    // Wait for all deliveries
    const receivedMessages = await Promise.all(deliveryPromises);

    // Record metrics
    const maxDeliveryTime = Date.now() - startTime;
    performanceMetrics.get('messageDelivery')?.push(maxDeliveryTime);

    // Assertions
    receivedMessages.forEach(msg => {
      expect(msg.content).toBe(groupMessage.content);
      expect(msg.metadata.type).toBe(MessageType.TEXT);
    });
    expect(maxDeliveryTime).toBeLessThanOrEqual(DELIVERY_TIMEOUT);

    // Cleanup
    await thirdClient.disconnect();
  });

  test('should handle AI agent interaction and response', async () => {
    // Generate message with AI mention
    const messageWithAI = generateMockMessage(
      testGroup.id,
      testUsers[0].id,
      { code: false },
      undefined
    );
    messageWithAI.metadata.mentions = ['@explorer'];
    messageWithAI.metadata.type = MessageType.TEXT;

    // Record start time for AI interaction
    const startTime = Date.now();

    // Send message with AI mention
    await senderClient.sendMessage('chat:message', {
      type: MessageType.TEXT,
      chatId: testGroup.id,
      content: messageWithAI.content,
      metadata: messageWithAI.metadata
    });

    // Wait for AI response
    const aiResponse = await receiverClient.waitForMessage('chat:ai_response', AI_RESPONSE_TIMEOUT);

    // Record AI response time
    const responseTime = Date.now() - startTime;
    performanceMetrics.get('aiResponse')?.push(responseTime);

    // Assertions
    expect(aiResponse).toBeDefined();
    expect(aiResponse.metadata.type).toBe(MessageType.AI_RESPONSE);
    expect(aiResponse.metadata.aiContext).toBeDefined();
    expect(responseTime).toBeLessThanOrEqual(AI_RESPONSE_TIMEOUT);

    // Verify AI response was delivered to all participants
    const allReceivedAI = await Promise.all([
      senderClient.waitForMessage('chat:ai_response', DELIVERY_TIMEOUT),
      receiverClient.waitForMessage('chat:ai_response', DELIVERY_TIMEOUT)
    ]);

    allReceivedAI.forEach(response => {
      expect(response.metadata.type).toBe(MessageType.AI_RESPONSE);
      expect(response.metadata.aiContext.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });
});