/**
 * @fileoverview End-to-end tests for AI agent interactions in the group chat platform
 * Tests agent response patterns, context awareness, and specialization behaviors
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.0.0
import supertest from 'supertest'; // v6.3.3
import { MockAgent, MockAgentFactory } from '../../utils/ai-agent-mock';
import { ai_responses } from '../../fixtures/ai-responses.json';
import { TestHelpers } from '../../utils/test-helpers';
import { MessageType } from '../../../backend/message-service/src/interfaces/message.interface';

// Test timeouts and thresholds from technical specifications
const TEST_TIMEOUT = 30000;
const WEBSOCKET_TIMEOUT = 5000;
const AI_RESPONSE_TIMEOUT = 5000;
const MIN_CONFIDENCE_SCORE = 0.85;

// Test data
let mockAgentFactory: MockAgentFactory;
let testUsers: any[];
let testGroup: any;
let explorerAgent: MockAgent;
let foodieAgent: MockAgent;
let plannerAgent: MockAgent;
let budgetAgent: MockAgent;
let localAgent: MockAgent;

beforeAll(async () => {
  // Initialize mock agent factory
  mockAgentFactory = new MockAgentFactory();

  // Create test users with different roles
  testUsers = await Promise.all([
    TestHelpers.createTestUser('USER', { 
      preferences: { language: 'en', notifications: true }
    }),
    TestHelpers.createTestUser('PREMIUM_USER', {
      preferences: { language: 'en', notifications: true }
    })
  ]);

  // Create test chat group
  testGroup = await TestHelpers.createTestChatGroup(testUsers.map(u => u.id));

  // Initialize specialized agents
  explorerAgent = mockAgentFactory.createAgent('explorer');
  foodieAgent = mockAgentFactory.createAgent('foodie');
  plannerAgent = mockAgentFactory.createAgent('planner');
  budgetAgent = mockAgentFactory.createAgent('budget');
  localAgent = mockAgentFactory.createAgent('local');

  // Set longer timeout for all tests
  jest.setTimeout(TEST_TIMEOUT);
});

afterAll(async () => {
  // Reset all mock agents
  await mockAgentFactory.bulkReset();
  
  // Clean up test data
  await TestHelpers.cleanupTestData();
});

beforeEach(async () => {
  // Reset agent contexts before each test
  [explorerAgent, foodieAgent, plannerAgent, budgetAgent, localAgent].forEach(agent => {
    agent.updateContext(testGroup.id, {
      tokens: [],
      relevantHistory: [],
      userPreferences: {}
    });
  });
});

test('should trigger agent response on @mention with correct timing', async () => {
  // Send message with agent mention
  const message = '@explorer any interesting places near the Louvre?';
  const startTime = Date.now();

  // Wait for agent response
  const response = await TestHelpers.waitForWebSocketEvent(
    'message',
    AI_RESPONSE_TIMEOUT,
    true
  );

  // Verify response timing meets SLA
  const responseTime = Date.now() - startTime;
  expect(responseTime).toBeLessThan(5000); // 5s requirement from specs

  // Validate response structure
  expect(response).toMatchObject({
    type: MessageType.AI_RESPONSE,
    metadata: {
      aiContext: {
        confidence: expect.any(String),
        domain: 'explorer'
      }
    }
  });

  // Verify confidence score meets minimum threshold
  expect(parseFloat(response.metadata.aiContext.confidence)).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
});

test('should maintain context awareness across multiple messages', async () => {
  // Send initial context-setting message
  await TestHelpers.waitForWebSocketEvent(
    'message',
    AI_RESPONSE_TIMEOUT,
    true
  );

  // Send follow-up message referencing previous context
  const followUpMessage = '@explorer and what about restaurants in that area?';
  const response = await TestHelpers.waitForWebSocketEvent(
    'message',
    AI_RESPONSE_TIMEOUT,
    true
  );

  // Verify context retention
  expect(response.metadata.aiContext.context).toContain('Louvre');
  expect(response.content).toContain('Bistrot Vivienne');
});

test('should coordinate responses between multiple agents', async () => {
  // Trigger multiple agents in sequence
  const messages = [
    '@explorer places to visit',
    '@foodie restaurant recommendations',
    '@planner organize the schedule'
  ];

  const responses = await Promise.all(
    messages.map(msg => TestHelpers.waitForWebSocketEvent(
      'message',
      AI_RESPONSE_TIMEOUT,
      true
    ))
  );

  // Verify each agent responded appropriately
  responses.forEach((response, index) => {
    expect(response.metadata.type).toBe(MessageType.AI_RESPONSE);
    expect(response.metadata.aiContext.domain).toBe(
      messages[index].split('@')[1].split(' ')[0]
    );
  });

  // Verify responses are properly coordinated
  expect(responses[2].content).toContain(responses[0].content);
  expect(responses[2].content).toContain(responses[1].content);
});

test('should respect agent specializations', async () => {
  // Test each specialized agent type
  const specializations = [
    { agent: '@explorer', keywords: ['visit', 'attractions', 'places'] },
    { agent: '@foodie', keywords: ['restaurant', 'cuisine', 'dining'] },
    { agent: '@planner', keywords: ['schedule', 'itinerary', 'plan'] },
    { agent: '@budget', keywords: ['cost', 'price', 'budget'] },
    { agent: '@local', keywords: ['local', 'tips', 'current'] }
  ];

  for (const spec of specializations) {
    const response = await TestHelpers.waitForWebSocketEvent(
      'message',
      AI_RESPONSE_TIMEOUT,
      true
    );

    // Verify response matches specialization
    expect(response.metadata.aiContext.domain).toBe(spec.agent.substring(1));
    expect(spec.keywords.some(keyword => 
      response.content.toLowerCase().includes(keyword)
    )).toBe(true);
  }
});