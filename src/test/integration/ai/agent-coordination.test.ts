/**
 * @fileoverview Integration tests for AI agent coordination capabilities
 * Tests multi-agent interactions, context sharing, and group dynamics analysis
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.0.0
import { MockAgent, MockAgentFactory } from '../../utils/ai-agent-mock';
import { ai_responses } from '../../fixtures/ai-responses.json';
import { MessageType } from '../../../backend/message-service/src/interfaces/message.interface';

// Test constants
const TEST_CHAT_ID = 'test-chat-123';
const TEST_USER_ID = 'test-user-123';
const RESPONSE_TIME_SLA = 2000; // 2 seconds SLA requirement

interface AgentSetupOptions {
  specializations?: string[];
  initialContext?: Record<string, any>;
  groupDynamics?: Record<string, any>;
}

/**
 * Sets up mock agents with specialized capabilities for testing
 */
async function setupAgents(options: AgentSetupOptions = {}) {
  const factory = new MockAgentFactory();
  const agents = new Map<string, MockAgent>();

  // Create specialized agents
  const agentTypes = ['explorer', 'foodie', 'planner'];
  for (const type of agentTypes) {
    const agent = factory.createAgent(type);
    agents.set(type, agent);

    // Initialize agent context if provided
    if (options.initialContext) {
      agent.updateContext(TEST_CHAT_ID, {
        ...options.initialContext,
        agentType: type
      });
    }
  }

  // Initialize group context if provided
  if (options.groupDynamics) {
    for (const agent of agents.values()) {
      agent.updateContext(TEST_CHAT_ID, {
        groupDynamics: options.groupDynamics
      });
    }
  }

  return { factory, agents };
}

/**
 * Tests coordination between multiple agents including response timing and context sharing
 */
async function testMultiAgentCoordination(
  agents: Map<string, MockAgent>,
  chatId: string
): Promise<void> {
  const startTime = Date.now();

  // Send travel planning query that requires multiple agent coordination
  const query = "We're near the Louvre and need suggestions for lunch and afternoon activities";
  
  // Get responses from each agent
  const explorerResponse = await agents.get('explorer')?.processMessage(
    query,
    chatId,
    { location: 'Louvre', time: 'afternoon' }
  );

  const foodieResponse = await agents.get('foodie')?.processMessage(
    query,
    chatId,
    { mealType: 'lunch', location: 'Louvre' }
  );

  const plannerResponse = await agents.get('planner')?.processMessage(
    query,
    chatId,
    { timeSlot: 'afternoon', existingPlans: [explorerResponse, foodieResponse] }
  );

  // Validate response times
  const totalTime = Date.now() - startTime;
  expect(totalTime).toBeLessThanOrEqual(RESPONSE_TIME_SLA);

  // Verify response coordination
  expect(explorerResponse?.metadata.type).toBe(MessageType.AI_RESPONSE);
  expect(foodieResponse?.metadata.type).toBe(MessageType.AI_RESPONSE);
  expect(plannerResponse?.metadata.type).toBe(MessageType.AI_RESPONSE);

  // Verify context sharing
  expect(plannerResponse?.metadata.aiContext.context).toContain(explorerResponse?.id);
  expect(plannerResponse?.metadata.aiContext.context).toContain(foodieResponse?.id);
}

/**
 * Tests agents' ability to maintain and share context including preference learning
 */
async function testContextAwareness(
  agents: Map<string, MockAgent>,
  chatId: string
): Promise<void> {
  // Initialize baseline context
  const baseContext = {
    userPreferences: {
      cuisine: 'French',
      budget: 'moderate',
      activityLevel: 'moderate'
    }
  };

  // Update context for all agents
  for (const agent of agents.values()) {
    agent.updateContext(chatId, baseContext);
  }

  // Send context-dependent query
  const query = "What restaurants are available for dinner?";
  const foodieResponse = await agents.get('foodie')?.processMessage(
    query,
    chatId,
    { mealType: 'dinner' }
  );

  // Verify context awareness
  expect(foodieResponse?.metadata.aiContext.context).toContain('French');
  expect(foodieResponse?.metadata.aiContext.context).toContain('moderate');

  // Update preferences and verify adaptation
  const newContext = {
    userPreferences: {
      ...baseContext.userPreferences,
      cuisine: 'Italian'
    }
  };

  agents.get('foodie')?.updateContext(chatId, newContext);
  
  const updatedResponse = await agents.get('foodie')?.processMessage(
    query,
    chatId,
    { mealType: 'dinner' }
  );

  expect(updatedResponse?.metadata.aiContext.context).toContain('Italian');
}

/**
 * Tests agents' ability to handle concurrent interactions while maintaining consistency
 */
async function testConcurrentAgentInteractions(
  agents: Map<string, MockAgent>,
  chatId: string
): Promise<void> {
  // Prepare concurrent queries
  const queries = [
    { text: "Find a restaurant", agent: 'foodie' },
    { text: "Plan afternoon activities", agent: 'explorer' },
    { text: "Optimize the schedule", agent: 'planner' }
  ];

  // Send queries concurrently
  const startTime = Date.now();
  const responses = await Promise.all(
    queries.map(query => 
      agents.get(query.agent)?.processMessage(
        query.text,
        chatId,
        { timestamp: startTime }
      )
    )
  );

  // Verify timing
  const totalTime = Date.now() - startTime;
  expect(totalTime).toBeLessThanOrEqual(RESPONSE_TIME_SLA);

  // Verify response consistency
  responses.forEach(response => {
    expect(response?.metadata.type).toBe(MessageType.AI_RESPONSE);
    expect(response?.chatId).toBe(chatId);
  });
}

describe('AI Agent Coordination', () => {
  let agents: Map<string, MockAgent>;
  let factory: MockAgentFactory;

  beforeEach(async () => {
    const setup = await setupAgents({
      initialContext: {
        location: 'Paris',
        timezone: 'Europe/Paris'
      }
    });
    agents = setup.agents;
    factory = setup.factory;
  });

  afterEach(async () => {
    await factory.bulkReset();
  });

  it('should coordinate responses between multiple agents within SLA', async () => {
    await testMultiAgentCoordination(agents, TEST_CHAT_ID);
  });

  it('should maintain shared context and learn preferences', async () => {
    await testContextAwareness(agents, TEST_CHAT_ID);
  });

  it('should handle concurrent interactions while maintaining consistency', async () => {
    await testConcurrentAgentInteractions(agents, TEST_CHAT_ID);
  });

  it('should analyze and adapt to group dynamics', async () => {
    const groupDynamics = {
      participantCount: 6,
      preferences: {
        decisionStyle: 'collaborative',
        pacePreference: 'moderate'
      }
    };

    // Update context with group dynamics
    for (const agent of agents.values()) {
      agent.updateContext(TEST_CHAT_ID, { groupDynamics });
    }

    // Test group-aware response
    const plannerResponse = await agents.get('planner')?.processMessage(
      "Plan our day considering everyone's preferences",
      TEST_CHAT_ID,
      { groupContext: true }
    );

    expect(plannerResponse?.metadata.aiContext.context).toContain('collaborative');
    expect(plannerResponse?.metadata.aiContext.context).toContain('moderate');
    expect(plannerResponse?.content).toContain('group');
  });
});