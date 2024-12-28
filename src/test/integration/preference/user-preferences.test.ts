/**
 * @fileoverview Integration tests for user preference management and learning system
 * Tests preference tracking, updates, learning capabilities, and AI agent interactions
 * @version 1.0.0
 */

import { jest, describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals'; // ^29.x
import supertest from 'supertest'; // ^6.x
import { createTestUser, waitForDatabaseSync } from '../../utils/test-helpers';
import { UserRole } from '../../utils/mock-data';

// Constants for test configuration
const TEST_TIMEOUT = 30000;
const PREFERENCE_TYPES = [
  'chat',
  'ai_agent',
  'ui',
  'notification',
  'learning_pattern',
  'interaction_history'
];
const PERFORMANCE_THRESHOLDS = {
  preferenceUpdate: 100, // ms
  patternRecognition: 2000, // ms
  cacheHitRate: 90 // percentage
};

/**
 * Interface for user preference test data
 */
interface PreferenceTestData {
  userId: string;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    aiAgents: {
      enabled: boolean;
      preferredAgents: string[];
      confidenceThreshold: number;
    };
    notifications: {
      enabled: boolean;
      types: string[];
    };
    learning: {
      enabled: boolean;
      patterns: Record<string, any>;
    };
  };
  performanceMetrics: {
    updateLatency: number[];
    learningAccuracy: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

describe('User Preferences Integration Tests', () => {
  let testData: PreferenceTestData;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    // Create test user with AI interaction preferences
    const testUser = await createTestUser(UserRole.USER, {
      theme: 'system',
      aiAgents: {
        enabled: true,
        preferredAgents: ['@explorer', '@foodie'],
        confidenceThreshold: 0.85
      }
    });

    testData = {
      userId: testUser.id,
      preferences: {
        theme: 'system',
        aiAgents: {
          enabled: true,
          preferredAgents: ['@explorer', '@foodie'],
          confidenceThreshold: 0.85
        },
        notifications: {
          enabled: true,
          types: ['ai_mention', 'pattern_detected']
        },
        learning: {
          enabled: true,
          patterns: {}
        }
      },
      performanceMetrics: {
        updateLatency: [],
        learningAccuracy: 0,
        cacheHits: 0,
        cacheMisses: 0
      }
    };

    // Initialize API test client
    request = supertest(process.env.API_URL);

    // Ensure database is ready
    await waitForDatabaseSync();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Clean up test data
    await request.delete(`/api/v1/users/${testData.userId}/preferences`)
      .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`);
    
    // Wait for cleanup to complete
    await waitForDatabaseSync();
  });

  beforeEach(async () => {
    // Reset performance metrics for each test
    testData.performanceMetrics = {
      updateLatency: [],
      learningAccuracy: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  });

  test('should create and validate initial user preferences', async () => {
    const startTime = Date.now();
    
    const response = await request
      .post(`/api/v1/users/${testData.userId}/preferences`)
      .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`)
      .send(testData.preferences);

    const latency = Date.now() - startTime;
    testData.performanceMetrics.updateLatency.push(latency);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: testData.userId,
      preferences: expect.objectContaining({
        theme: testData.preferences.theme,
        aiAgents: expect.objectContaining({
          enabled: true,
          preferredAgents: expect.arrayContaining(['@explorer', '@foodie'])
        })
      })
    });

    expect(latency).toBeLessThan(PERFORMANCE_THRESHOLDS.preferenceUpdate);
  });

  test('should update existing preferences with history tracking', async () => {
    const updatedPreferences = {
      ...testData.preferences,
      theme: 'dark',
      aiAgents: {
        ...testData.preferences.aiAgents,
        preferredAgents: ['@explorer', '@foodie', '@planner']
      }
    };

    const startTime = Date.now();
    
    const response = await request
      .put(`/api/v1/users/${testData.userId}/preferences`)
      .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`)
      .send(updatedPreferences);

    const latency = Date.now() - startTime;
    testData.performanceMetrics.updateLatency.push(latency);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      preferences: updatedPreferences,
      history: expect.arrayContaining([
        expect.objectContaining({
          timestamp: expect.any(String),
          changes: expect.arrayContaining(['theme', 'aiAgents.preferredAgents'])
        })
      ])
    });

    expect(latency).toBeLessThan(PERFORMANCE_THRESHOLDS.preferenceUpdate);
  });

  test('should learn and adapt from user preference patterns', async () => {
    const startTime = Date.now();
    
    // Simulate a series of preference updates to establish patterns
    const preferenceUpdates = [
      { theme: 'dark', timestamp: '08:00' },
      { theme: 'light', timestamp: '16:00' },
      { aiAgents: { preferredAgents: ['@foodie'] }, timestamp: '12:00' }
    ];

    for (const update of preferenceUpdates) {
      await request
        .put(`/api/v1/users/${testData.userId}/preferences`)
        .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`)
        .send({ ...testData.preferences, ...update });
    }

    // Trigger pattern learning analysis
    const learningResponse = await request
      .post(`/api/v1/users/${testData.userId}/preferences/analyze`)
      .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`);

    const processingTime = Date.now() - startTime;

    expect(learningResponse.status).toBe(200);
    expect(learningResponse.body).toMatchObject({
      patterns: expect.objectContaining({
        theme: expect.objectContaining({
          timeBasedPatterns: expect.any(Array),
          confidence: expect.any(Number)
        }),
        aiAgents: expect.objectContaining({
          contextualPatterns: expect.any(Array),
          confidence: expect.any(Number)
        })
      }),
      recommendations: expect.any(Array)
    });

    expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.patternRecognition);
    expect(learningResponse.body.patterns.theme.confidence).toBeGreaterThan(0.7);
  });

  test('should handle concurrent preference updates correctly', async () => {
    const updates = Array(5).fill(null).map((_, index) => ({
      theme: index % 2 === 0 ? 'light' : 'dark',
      timestamp: Date.now() + index
    }));

    const updatePromises = updates.map(update =>
      request
        .put(`/api/v1/users/${testData.userId}/preferences`)
        .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`)
        .send({ ...testData.preferences, ...update })
    );

    const results = await Promise.all(updatePromises);
    
    // Verify all updates were processed
    expect(results.every(r => r.status === 200)).toBe(true);
    
    // Verify final state is consistent
    const finalState = await request
      .get(`/api/v1/users/${testData.userId}/preferences`)
      .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`);

    expect(finalState.status).toBe(200);
    expect(finalState.body.history.length).toBe(updates.length);
  });

  test('should maintain cache performance within thresholds', async () => {
    // Perform multiple preference reads to test caching
    for (let i = 0; i < 10; i++) {
      const response = await request
        .get(`/api/v1/users/${testData.userId}/preferences`)
        .set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`);

      if (response.headers['x-cache-hit'] === 'true') {
        testData.performanceMetrics.cacheHits++;
      } else {
        testData.performanceMetrics.cacheMisses++;
      }
    }

    const cacheHitRate = (testData.performanceMetrics.cacheHits /
      (testData.performanceMetrics.cacheHits + testData.performanceMetrics.cacheMisses)) * 100;

    expect(cacheHitRate).toBeGreaterThanOrEqual(PERFORMANCE_THRESHOLDS.cacheHitRate);
  });
});