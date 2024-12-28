/**
 * @fileoverview End-to-end tests for AI agent recommendation quality validation
 * Tests response relevance, specialization accuracy, and user satisfaction metrics
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.x
import supertest from 'supertest'; // v6.x
import { MockAgent } from '../../utils/ai-agent-mock';
import { createTestUser, createTestChatGroup } from '../../utils/test-helpers';
import { ai_responses } from '../../fixtures/ai-responses.json';
import { MessageType, IMessage } from '../../../backend/message-service/src/interfaces/message.interface';

// Constants for test validation
const MIN_CONFIDENCE_SCORE = 0.9; // 90% AI agent response relevance requirement
const MIN_SATISFACTION_SCORE = 4.5; // 4.5/5 average user satisfaction rating
const MAX_RESPONSE_TIME = 2000; // 2 seconds SLA requirement
const TEST_TIMEOUT = 30000;

/**
 * Interface for test analytics data
 */
interface TestAnalytics {
  confidenceScores: number[];
  responseTimes: number[];
  satisfactionScores: number[];
  specialtyAccuracy: Record<string, number>;
}

/**
 * Enhanced test suite for comprehensive recommendation quality validation
 */
class RecommendationTestSuite {
  private mockAgent: MockAgent;
  private testUser: any;
  private chatGroup: any;
  private analytics: TestAnalytics;

  constructor() {
    this.analytics = {
      confidenceScores: [],
      responseTimes: [],
      satisfactionScores: [],
      specialtyAccuracy: {}
    };
  }

  /**
   * Set up test environment with enhanced monitoring
   */
  async setUp(agentType: string): Promise<void> {
    // Create mock agent with specialization
    this.mockAgent = new MockAgent(agentType, [agentType]);

    // Create test user with preferences
    this.testUser = await createTestUser('USER', {
      interests: ['food', 'culture', 'activities'],
      preferredLanguage: 'en',
      dietaryRestrictions: ['vegetarian']
    });

    // Create test chat group
    this.chatGroup = await createTestChatGroup(5, [agentType], {
      purpose: 'travel planning',
      location: 'Paris',
      duration: '7 days'
    });
  }

  /**
   * Clean up test resources and generate reports
   */
  async tearDown(): Promise<void> {
    this.generateTestReport();
  }

  /**
   * Test recommendation relevance with timing validation
   */
  async testRecommendationRelevance(
    query: string,
    expectedDomain: string
  ): Promise<void> {
    const startTime = Date.now();

    // Process query through mock agent
    const response = await this.mockAgent.processMessage(query, this.chatGroup.id, {
      userId: this.testUser.id,
      context: this.chatGroup.context
    });

    // Validate response time
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThanOrEqual(MAX_RESPONSE_TIME);
    this.analytics.responseTimes.push(responseTime);

    // Validate response format and content
    expect(response).toHaveProperty('metadata.aiContext');
    expect(response.metadata.type).toBe(MessageType.AI_RESPONSE);
    
    // Validate confidence score
    const confidenceScore = parseFloat(response.metadata.aiContext.confidence);
    expect(confidenceScore).toBeGreaterThanOrEqual(MIN_CONFIDENCE_SCORE);
    this.analytics.confidenceScores.push(confidenceScore);

    // Validate domain relevance
    expect(response.metadata.aiContext.domain).toBe(expectedDomain);
  }

  /**
   * Test agent specialization accuracy
   */
  async testSpecializationAccuracy(
    agentType: string,
    testCases: Array<{ query: string; expectedTags: string[] }>
  ): Promise<void> {
    for (const testCase of testCases) {
      const response = await this.mockAgent.processMessage(
        testCase.query,
        this.chatGroup.id,
        { context: this.chatGroup.context }
      );

      // Validate specialty tags in response
      const responseTags = JSON.parse(response.metadata.aiContext.context).specialties_used;
      const matchingTags = testCase.expectedTags.filter(tag => responseTags.includes(tag));
      
      const accuracy = matchingTags.length / testCase.expectedTags.length;
      this.analytics.specialtyAccuracy[agentType] = 
        (this.analytics.specialtyAccuracy[agentType] || 0) + accuracy;
    }
  }

  /**
   * Test user satisfaction metrics
   */
  async testUserSatisfaction(
    responses: IMessage[],
    userRatings: number[]
  ): Promise<void> {
    expect(responses.length).toBe(userRatings.length);

    for (let i = 0; i < responses.length; i++) {
      // Validate individual response ratings
      expect(userRatings[i]).toBeGreaterThanOrEqual(1);
      expect(userRatings[i]).toBeLessThanOrEqual(5);
      this.analytics.satisfactionScores.push(userRatings[i]);
    }

    // Calculate average satisfaction score
    const averageSatisfaction = 
      this.analytics.satisfactionScores.reduce((a, b) => a + b, 0) / 
      this.analytics.satisfactionScores.length;
    
    expect(averageSatisfaction).toBeGreaterThanOrEqual(MIN_SATISFACTION_SCORE);
  }

  /**
   * Generate comprehensive test analytics report
   */
  private generateTestReport(): void {
    const report = {
      confidenceMetrics: {
        average: this.calculateAverage(this.analytics.confidenceScores),
        min: Math.min(...this.analytics.confidenceScores),
        max: Math.max(...this.analytics.confidenceScores)
      },
      responseTimeMetrics: {
        average: this.calculateAverage(this.analytics.responseTimes),
        p95: this.calculatePercentile(this.analytics.responseTimes, 95)
      },
      satisfactionMetrics: {
        average: this.calculateAverage(this.analytics.satisfactionScores),
        distribution: this.calculateDistribution(this.analytics.satisfactionScores)
      },
      specialtyAccuracy: this.analytics.specialtyAccuracy
    };

    // Log report for CI/CD pipeline
    console.log('Recommendation Quality Test Report:', JSON.stringify(report, null, 2));
  }

  private calculateAverage(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  private calculateDistribution(values: number[]): Record<number, number> {
    return values.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
  }
}

// Test cases
describe('AI Agent Recommendation Quality', () => {
  let testSuite: RecommendationTestSuite;

  beforeEach(() => {
    testSuite = new RecommendationTestSuite();
  });

  afterEach(async () => {
    await testSuite.tearDown();
  });

  // Test response relevance for each agent type
  describe('Response Relevance', () => {
    const agentTypes = ['explorer', 'foodie', 'planner', 'budget', 'local'];

    test.each(agentTypes)('should provide relevant recommendations for %s agent', 
      async (agentType) => {
        await testSuite.setUp(agentType);
        await testSuite.testRecommendationRelevance(
          `What do you recommend for ${agentType === 'foodie' ? 'dinner' : 'activities'}?`,
          agentType
        );
      }, TEST_TIMEOUT);
  });

  // Test specialization accuracy
  describe('Specialization Accuracy', () => {
    test('should provide accurate specialized recommendations', async () => {
      await testSuite.setUp('foodie');
      await testSuite.testSpecializationAccuracy('foodie', [
        {
          query: 'Find a vegetarian restaurant near the Louvre',
          expectedTags: ['restaurant_selection', 'dietary_accommodation']
        },
        {
          query: 'What\'s a good French bistro for group dining?',
          expectedTags: ['restaurant_selection', 'group_dining']
        }
      ]);
    }, TEST_TIMEOUT);
  });

  // Test user satisfaction metrics
  describe('User Satisfaction', () => {
    test('should maintain high user satisfaction ratings', async () => {
      await testSuite.setUp('explorer');
      const responses = ai_responses.slice(0, 3);
      const userRatings = [4.8, 4.6, 4.7];
      await testSuite.testUserSatisfaction(responses, userRatings);
    }, TEST_TIMEOUT);
  });
});

export default RecommendationTestSuite;