/**
 * @fileoverview Integration tests for the preference learning system
 * Validates user preference tracking, pattern recognition, personalization features,
 * and AI agent interactions with comprehensive test coverage.
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.x
import supertest from 'supertest'; // v6.x

// Internal imports
import { PreferenceLearningService } from '../../../backend/preference-engine/src/services/learning_service';
import { createTestUser, waitForDatabaseSync } from '../../utils/test-helpers';
import { TestConfig } from '../../config/test-config';

// Constants
const TEST_TIMEOUT = 30000;
const DATABASE_SYNC_TIMEOUT = 10000;
const AI_INTERACTION_TIMEOUT = 15000;
const MIN_CONFIDENCE_SCORE = 0.85;

// Types
interface AIInteractionHistory {
  agentId: string;
  interactions: Array<{
    timestamp: Date;
    context: Record<string, any>;
    confidence: number;
  }>;
}

/**
 * Helper function to set up test preferences with AI interaction history
 */
async function setupTestPreferences(
  userId: string,
  preferenceType: string,
  aiInteractionHistory: AIInteractionHistory[]
): Promise<void> {
  // Create test user with initial preferences
  const user = await createTestUser('USER', {
    theme: 'dark',
    fontSize: 'medium',
    notifications: true,
    language: 'en'
  });

  // Generate AI interaction history
  for (const agentHistory of aiInteractionHistory) {
    for (const interaction of agentHistory.interactions) {
      await PreferenceLearningService.prototype.update_preference(
        userId,
        preferenceType,
        {
          aiAgent: agentHistory.agentId,
          context: interaction.context,
          confidence: interaction.confidence,
          timestamp: interaction.timestamp
        }
      );
    }
  }

  // Wait for database sync
  await waitForDatabaseSync({ timeout: DATABASE_SYNC_TIMEOUT });
}

/**
 * Integration test suite for preference learning system
 */
describe('Preference Learning System Integration Tests', () => {
  let learningService: PreferenceLearningService;
  let testConfig: TestConfig;

  beforeAll(async () => {
    // Initialize test configuration
    testConfig = await TestConfig.getInstance();
    await testConfig.initialize({ aiAgentTesting: true });

    // Initialize learning service with test configuration
    const config = testConfig.getConfig('ai-agent');
    learningService = new PreferenceLearningService(
      config.cache,
      config.model
    );

    // Set test timeouts
    jest.setTimeout(TEST_TIMEOUT);
  });

  beforeEach(async () => {
    // Clear test data before each test
    await waitForDatabaseSync();
  });

  /**
   * Test preference learning with AI agent interactions
   */
  test('should learn user preferences correctly with AI interactions', async () => {
    const userId = 'test-user-1';
    const preferenceType = 'ai_agent';

    // Setup test data with AI interaction history
    const aiHistory: AIInteractionHistory[] = [
      {
        agentId: '@foodie',
        interactions: [
          {
            timestamp: new Date(),
            context: { cuisine: 'italian', price: 'moderate' },
            confidence: 0.9
          },
          {
            timestamp: new Date(),
            context: { cuisine: 'italian', price: 'expensive' },
            confidence: 0.85
          }
        ]
      }
    ];

    await setupTestPreferences(userId, preferenceType, aiHistory);

    // Trigger preference learning
    const result = await learningService.learn_preferences(
      userId,
      preferenceType,
      { includeAIInteractions: true }
    );

    // Verify learning results
    expect(result.user_id).toBe(userId);
    expect(result.preference_type).toBe(preferenceType);
    expect(result.confidence_score).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
    expect(result.learning_results).toHaveLength(1);
    expect(result.learning_results[0].pattern_score).toBeGreaterThan(0);
  });

  /**
   * Test preference prediction with AI recommendations
   */
  test('should predict user preferences accurately with AI recommendations', async () => {
    const userId = 'test-user-2';
    const preferenceType = 'ai_agent';

    // Setup test data
    const aiHistory: AIInteractionHistory[] = [
      {
        agentId: '@explorer',
        interactions: [
          {
            timestamp: new Date(),
            context: { activity: 'museum', time: 'morning' },
            confidence: 0.95
          }
        ]
      }
    ];

    await setupTestPreferences(userId, preferenceType, aiHistory);

    // Get preference predictions
    const predictions = await learningService.get_preference_predictions(
      userId,
      preferenceType,
      { includeAIRecommendations: true }
    );

    // Verify predictions
    expect(predictions.user_id).toBe(userId);
    expect(predictions.predictions).toHaveLength(1);
    expect(predictions.confidence_score).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
    expect(predictions.predictions[0].pattern_type).toBe('temporal_patterns');
  });

  /**
   * Test learning model updates with new data
   */
  test('should update learning model with new preferences and AI interactions', async () => {
    const userId = 'test-user-3';
    const preferenceType = 'ai_agent';

    // Initial preferences
    const initialHistory: AIInteractionHistory[] = [
      {
        agentId: '@planner',
        interactions: [
          {
            timestamp: new Date(),
            context: { task: 'meeting', priority: 'high' },
            confidence: 0.88
          }
        ]
      }
    ];

    await setupTestPreferences(userId, preferenceType, initialHistory);

    // Get initial predictions
    const initialPredictions = await learningService.get_preference_predictions(
      userId,
      preferenceType,
      { includeAIRecommendations: true }
    );

    // Add new preference data
    const newInteraction = {
      agentId: '@planner',
      interactions: [
        {
          timestamp: new Date(),
          context: { task: 'meeting', priority: 'medium' },
          confidence: 0.92
        }
      ]
    };

    await learningService.update_learning_model(
      userId,
      preferenceType,
      newInteraction
    );

    // Get updated predictions
    const updatedPredictions = await learningService.get_preference_predictions(
      userId,
      preferenceType,
      { includeAIRecommendations: true }
    );

    // Verify model updates
    expect(updatedPredictions.confidence_score)
      .toBeGreaterThan(initialPredictions.confidence_score);
    expect(updatedPredictions.predictions)
      .toHaveLength(initialPredictions.predictions.length + 1);
  });

  afterAll(async () => {
    // Cleanup
    await waitForDatabaseSync();
  });
});