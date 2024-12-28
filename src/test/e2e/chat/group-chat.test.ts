/**
 * End-to-end test suite for group chat functionality
 * Tests real-time messaging, participant management, AI agent interactions,
 * and group dynamics analysis in chat groups
 * @version 1.0.0
 */

import { jest, describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals'; // ^29.x
import supertest from 'supertest'; // ^6.x
import WebSocketTestClient, { WebSocketMessage } from '../../utils/websocket-client';
import { createTestUser, createTestChatGroup, waitForWebSocketEvent } from '../../utils/test-helpers';
import { UserRole } from '../../utils/mock-data';
import TestConfig from '../../config/test-config';

// Constants for test configuration
const TEST_TIMEOUT = 30000;
const WEBSOCKET_TIMEOUT = 5000;
const MESSAGE_DELIVERY_TIMEOUT = 2000;
const AI_RESPONSE_TIMEOUT = 5000;
const GROUP_DYNAMICS_INTERVAL = 1000;

// Test fixtures
const AI_AGENTS = ['@explorer', '@foodie', '@planner'];
const TEST_GROUP_SIZE = 5;

describe('Group Chat E2E Tests', () => {
  let wsClient: WebSocketTestClient;
  let testConfig: TestConfig;
  let testUsers: any[];
  let testGroup: any;

  beforeAll(async () => {
    // Initialize test configuration with AI and performance monitoring
    testConfig = TestConfig.getInstance();
    await testConfig.initialize({
      aiAgentTesting: true,
      performanceMonitoring: true,
      securityValidation: true
    });

    // Initialize WebSocket client with enhanced validation
    wsClient = new WebSocketTestClient({
      url: process.env.WS_URL || 'ws://localhost:3001',
      timeout: WEBSOCKET_TIMEOUT,
      validateMessages: true,
      namespace: '/chat'
    });

    await wsClient.connect();

    // Create test users with varied roles and preferences
    testUsers = await Promise.all([
      createTestUser(UserRole.ADMIN, { notifications: true }, { preferredAgents: AI_AGENTS }),
      createTestUser(UserRole.MODERATOR),
      ...Array(TEST_GROUP_SIZE - 2).fill(null).map(() => createTestUser(UserRole.USER))
    ]);

    // Create test group with AI agents
    testGroup = await createTestChatGroup(TEST_GROUP_SIZE, AI_AGENTS, {
      dynamicsTracking: true,
      interactionPatterns: ['decision-making', 'collaboration'],
      aiAssistance: true
    });

    jest.setTimeout(TEST_TIMEOUT);
  });

  afterAll(async () => {
    await wsClient.disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create a new group chat with AI capabilities', async () => {
    const response = await supertest(process.env.API_URL)
      .post('/api/v1/groups')
      .send({
        name: 'Test Group',
        participants: testUsers.map(user => user.id),
        aiAgents: AI_AGENTS,
        settings: {
          dynamicsTracking: true,
          aiAssistance: true
        }
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Test Group',
      participants: expect.arrayContaining(testUsers.map(user => user.id)),
      aiAgents: expect.arrayContaining(AI_AGENTS)
    });

    // Verify WebSocket notifications
    const wsEvent = await waitForWebSocketEvent('group:created', WEBSOCKET_TIMEOUT);
    expect(wsEvent.type).toBe('group:created');
    expect(wsEvent.payload.groupId).toBe(response.body.id);
  });

  test('should deliver messages in real-time with performance validation', async () => {
    const testMessage = {
      content: 'Test message with @explorer mention',
      chatId: testGroup.id,
      metadata: {
        mentions: ['@explorer']
      }
    };

    // Send message and measure delivery time
    const startTime = Date.now();
    await wsClient.sendMessage('message:send', testMessage);

    // Wait for message delivery confirmation
    const deliveryEvent = await waitForWebSocketEvent('message:delivered', MESSAGE_DELIVERY_TIMEOUT);
    const deliveryTime = Date.now() - startTime;

    // Validate delivery time against SLA
    expect(deliveryTime).toBeLessThanOrEqual(MESSAGE_DELIVERY_TIMEOUT);
    expect(deliveryEvent.payload).toMatchObject({
      messageId: expect.any(String),
      chatId: testGroup.id,
      status: 'delivered'
    });

    // Verify message persistence
    const response = await supertest(process.env.API_URL)
      .get(`/api/v1/groups/${testGroup.id}/messages`)
      .query({ limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.messages[0]).toMatchObject({
      content: testMessage.content,
      chatId: testGroup.id
    });
  });

  test('should handle AI agent interactions with context awareness', async () => {
    const testMessage = {
      content: 'Hey @explorer, suggest some activities near the Louvre',
      chatId: testGroup.id,
      metadata: {
        mentions: ['@explorer']
      }
    };

    // Send message with AI mention
    await wsClient.sendMessage('message:send', testMessage);

    // Wait for AI agent response with enhanced validation
    const aiResponse = await waitForWebSocketEvent('ai:response', AI_RESPONSE_TIMEOUT, true);

    // Validate AI response format and content
    expect(aiResponse.aiContext).toBeDefined();
    expect(aiResponse.aiContext.agentId).toBe('@explorer');
    expect(aiResponse.aiContext.confidence).toBeGreaterThanOrEqual(0.85);
    expect(aiResponse.payload).toMatchObject({
      type: 'AI_RESPONSE',
      content: expect.stringContaining('activities'),
      metadata: {
        aiContext: expect.any(Object)
      }
    });

    // Verify context retention
    const contextResponse = await supertest(process.env.API_URL)
      .get(`/api/v1/groups/${testGroup.id}/context`)
      .query({ agentId: '@explorer' });

    expect(contextResponse.status).toBe(200);
    expect(contextResponse.body.context).toContain('Louvre');
  });

  test('should track and analyze group dynamics', async () => {
    // Simulate group interactions
    const interactions = testUsers.map(user => ({
      userId: user.id,
      action: 'message',
      timestamp: Date.now()
    }));

    // Record interactions
    await Promise.all(interactions.map(interaction =>
      supertest(process.env.API_URL)
        .post(`/api/v1/groups/${testGroup.id}/interactions`)
        .send(interaction)
    ));

    // Wait for dynamics analysis
    await new Promise(resolve => setTimeout(resolve, GROUP_DYNAMICS_INTERVAL));

    // Get group dynamics analysis
    const analysisResponse = await supertest(process.env.API_URL)
      .get(`/api/v1/groups/${testGroup.id}/dynamics`);

    expect(analysisResponse.status).toBe(200);
    expect(analysisResponse.body).toMatchObject({
      participationMetrics: expect.any(Object),
      interactionPatterns: expect.any(Array),
      aiAssistanceMetrics: expect.any(Object)
    });

    // Verify metrics calculation
    expect(analysisResponse.body.participationMetrics).toMatchObject({
      activeParticipants: TEST_GROUP_SIZE,
      messageDistribution: expect.any(Object),
      aiInteractions: expect.any(Number)
    });
  });

  test('should manage participant roles and permissions', async () => {
    const newUser = await createTestUser(UserRole.USER);
    
    // Add new participant
    const addResponse = await supertest(process.env.API_URL)
      .post(`/api/v1/groups/${testGroup.id}/participants`)
      .send({
        userId: newUser.id,
        role: UserRole.USER
      });

    expect(addResponse.status).toBe(200);

    // Verify WebSocket notification
    const participantEvent = await waitForWebSocketEvent('participant:added', WEBSOCKET_TIMEOUT);
    expect(participantEvent.payload).toMatchObject({
      groupId: testGroup.id,
      userId: newUser.id,
      role: UserRole.USER
    });

    // Modify participant role
    const updateResponse = await supertest(process.env.API_URL)
      .put(`/api/v1/groups/${testGroup.id}/participants/${newUser.id}`)
      .send({
        role: UserRole.MODERATOR
      });

    expect(updateResponse.status).toBe(200);

    // Verify role update
    const groupResponse = await supertest(process.env.API_URL)
      .get(`/api/v1/groups/${testGroup.id}`);

    const updatedParticipant = groupResponse.body.participants
      .find(p => p.userId === newUser.id);
    expect(updatedParticipant.role).toBe(UserRole.MODERATOR);
  });
});