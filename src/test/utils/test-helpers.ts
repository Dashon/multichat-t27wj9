/**
 * @fileoverview Enhanced test helper utilities for AI-Enhanced Group Chat Platform
 * Provides comprehensive test setup, assertions, and validation functions
 * @version 1.0.0
 */

// External imports with versions for production stability
import { jest } from '@jest/globals'; // ^29.x
import supertest from 'supertest'; // ^6.x

// Internal imports
import { getTestConfig, validateAIConfig } from '../config/test-config';
import { generateMockUser, generateMockMessage, UserRole } from './mock-data';

// Constants for test timeouts and thresholds
const TEST_TIMEOUT = 30000;
const WEBSOCKET_TIMEOUT = 2000;
const DATABASE_SYNC_TIMEOUT = 10000;
const AI_RESPONSE_TIMEOUT = 5000;
const MAX_GROUP_PARTICIPANTS = 50;
const MIN_AI_CONFIDENCE_SCORE = 0.85;

/**
 * Interface for WebSocket event data with enhanced AI support
 */
interface WebSocketEventData {
  type: string;
  payload: any;
  timestamp: number;
  aiContext?: {
    agentId: string;
    confidence: number;
    context: Record<string, any>;
  };
}

/**
 * Interface for database consistency check options
 */
interface ConsistencyCheckOptions {
  timeout?: number;
  retries?: number;
  consistencyLevel?: 'eventual' | 'strong';
}

/**
 * Enhanced utility to wait for WebSocket events with strict timing validation
 * @param eventName Name of the event to wait for
 * @param timeout Maximum wait time in milliseconds
 * @param validateAIResponse Whether to validate AI agent response format
 * @returns Promise resolving to event data
 */
export async function waitForWebSocketEvent(
  eventName: string,
  timeout: number = WEBSOCKET_TIMEOUT,
  validateAIResponse: boolean = false
): Promise<WebSocketEventData> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout;

    const handleEvent = (data: WebSocketEventData) => {
      const responseTime = Date.now() - startTime;

      // Validate response time against SLA
      if (responseTime > timeout) {
        reject(new Error(`WebSocket response time ${responseTime}ms exceeded SLA ${timeout}ms`));
        return;
      }

      // Validate AI response if required
      if (validateAIResponse && data.aiContext) {
        if (data.aiContext.confidence < MIN_AI_CONFIDENCE_SCORE) {
          reject(new Error(`AI confidence score ${data.aiContext.confidence} below threshold ${MIN_AI_CONFIDENCE_SCORE}`));
          return;
        }
      }

      clearTimeout(timeoutId);
      resolve(data);
    };

    // Set timeout handler
    timeoutId = setTimeout(() => {
      reject(new Error(`WebSocket event ${eventName} timed out after ${timeout}ms`));
    }, timeout);

    // Attach event listener
    global.websocketClient.once(eventName, handleEvent);
  });
}

/**
 * Creates a test user with enhanced AI interaction preferences
 * @param role User role in the system
 * @param preferences Optional user preferences
 * @param aiInteractionSettings Optional AI interaction settings
 * @returns Created test user object
 */
export async function createTestUser(
  role: UserRole = UserRole.USER,
  preferences?: any,
  aiInteractionSettings?: any
): Promise<any> {
  const user = generateMockUser(role, preferences);

  // Add AI interaction settings if provided
  if (aiInteractionSettings) {
    user.aiSettings = {
      preferredAgents: aiInteractionSettings.preferredAgents || [],
      interactionHistory: [],
      confidenceThreshold: aiInteractionSettings.confidenceThreshold || MIN_AI_CONFIDENCE_SCORE,
      ...aiInteractionSettings
    };
  }

  // Validate user data
  const config = getTestConfig('ai-agent');
  if (!validateAIConfig(user.aiSettings)) {
    throw new Error('Invalid AI interaction settings');
  }

  return user;
}

/**
 * Creates a test chat group with validated participants and AI agent configurations
 * @param participantCount Number of participants to create
 * @param agentTypes Array of AI agent types to include
 * @param groupDynamics Optional group dynamics configuration
 * @returns Created test chat group
 */
export async function createTestChatGroup(
  participantCount: number,
  agentTypes: string[],
  groupDynamics?: any
): Promise<any> {
  if (participantCount > MAX_GROUP_PARTICIPANTS) {
    throw new Error(`Participant count ${participantCount} exceeds maximum ${MAX_GROUP_PARTICIPANTS}`);
  }

  // Create test participants
  const participants = await Promise.all(
    Array(participantCount).fill(null).map(() => createTestUser())
  );

  // Configure AI agents
  const agents = agentTypes.map(type => ({
    id: type,
    type,
    capabilities: getAgentCapabilities(type),
    context: {}
  }));

  // Create and return group
  return {
    id: jest.fn().mockReturnValue('test-group-id'),
    participants,
    agents,
    dynamics: groupDynamics || {},
    messages: [],
    createdAt: new Date()
  };
}

/**
 * Enhanced utility to ensure database synchronization with consistency validation
 * @param options Consistency check options
 * @returns Promise that resolves when sync is complete
 */
export async function waitForDatabaseSync(
  options: ConsistencyCheckOptions = {}
): Promise<void> {
  const {
    timeout = DATABASE_SYNC_TIMEOUT,
    retries = 3,
    consistencyLevel = 'strong'
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (attempt < retries) {
    try {
      // Check database connection status
      const isConnected = await checkDatabaseConnection();
      if (!isConnected) {
        throw new Error('Database connection check failed');
      }

      // Verify replication status for strong consistency
      if (consistencyLevel === 'strong') {
        const replicationLag = await checkReplicationLag();
        if (replicationLag > 0) {
          throw new Error(`Replication lag detected: ${replicationLag}ms`);
        }
      }

      // Check if elapsed time exceeds timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Database sync timed out after ${timeout}ms`);
      }

      return;
    } catch (error) {
      attempt++;
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Helper function to check database connection status
 * @private
 */
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    // Implementation would depend on your database client
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Helper function to check database replication lag
 * @private
 */
async function checkReplicationLag(): Promise<number> {
  try {
    // Implementation would depend on your database client
    return 0;
  } catch (error) {
    return -1;
  }
}

/**
 * Helper function to get AI agent capabilities
 * @private
 */
function getAgentCapabilities(agentType: string): string[] {
  const capabilities = {
    '@explorer': ['location-search', 'activity-recommendations', 'route-planning'],
    '@foodie': ['restaurant-search', 'cuisine-recommendations', 'dietary-restrictions'],
    '@planner': ['scheduling', 'task-management', 'reminder-setting'],
    '@budget': ['cost-tracking', 'budget-planning', 'expense-analysis'],
    '@local': ['local-insights', 'cultural-tips', 'safety-information']
  };

  return capabilities[agentType] || [];
}