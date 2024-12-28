import { jest, describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals'; // ^29.x
import supertest from 'supertest'; // ^6.x
import Redis from 'ioredis'; // ^5.x
import { RedisStore } from 'rate-limit-redis'; // ^3.x

import { getTestConfig } from '../../../config/test-config';
import { createTestUser } from '../../../utils/test-helpers';
import { defaultRateLimitConfig, authRateLimitConfig, aiRateLimitConfig } from '../../../../backend/api-gateway/src/config/rate-limit.config';

// Constants
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_TIMEOUT = 30000;

describe('API Gateway Rate Limiting Integration Tests', () => {
  let request: supertest.SuperTest<supertest.Test>;
  let redisClient: Redis;
  let testUser: any;
  let authToken: string;

  // Helper function to make multiple requests in parallel
  const makeRequests = async (
    endpoint: string,
    count: number,
    token?: string
  ): Promise<supertest.Response[]> => {
    const requests = Array(count).fill(null).map(() => {
      const req = request.get(endpoint);
      if (token) {
        req.set('Authorization', `Bearer ${token}`);
      }
      return req;
    });
    return Promise.all(requests);
  };

  // Helper function to validate rate limit headers
  const validateRateLimitHeaders = (response: supertest.Response, config: any): void => {
    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
    expect(response.headers['ratelimit-reset']).toBeDefined();

    const limit = parseInt(response.headers['ratelimit-limit']);
    const remaining = parseInt(response.headers['ratelimit-remaining']);
    const reset = parseInt(response.headers['ratelimit-reset']);

    expect(limit).toBe(config.max);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(limit);
    expect(reset).toBeGreaterThan(Date.now() / 1000);
  };

  // Helper function to wait for rate limit window reset
  const waitForRateLimitReset = async (windowMs: number): Promise<void> => {
    const buffer = 1000; // Add 1 second buffer
    await new Promise(resolve => setTimeout(resolve, windowMs + buffer));
  };

  beforeAll(async () => {
    const config = getTestConfig('integration');
    jest.setTimeout(TEST_TIMEOUT);

    // Initialize supertest instance
    request = supertest(API_BASE_URL);

    // Initialize Redis client for store validation
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true
    });

    // Create test user and get auth token
    testUser = await createTestUser();
    const loginResponse = await request
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: 'testPassword123'
      });
    authToken = loginResponse.body.token;

    // Clear any existing rate limit data
    await redisClient.flushall();
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clear rate limit data before each test
    await redisClient.flushall();
  });

  describe('Default Rate Limiting', () => {
    it('should allow requests within default rate limit', async () => {
      const responses = await makeRequests('/api/test', 10);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        validateRateLimitHeaders(response, defaultRateLimitConfig);
      });
    });

    it('should block requests exceeding default rate limit', async () => {
      // Make max allowed requests
      const responses = await makeRequests('/api/test', defaultRateLimitConfig.max);
      
      // Verify all succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Make one more request that should fail
      const exceededResponse = await request.get('/api/test');
      expect(exceededResponse.status).toBe(429);
      expect(exceededResponse.body.error).toBeDefined();
      expect(exceededResponse.headers['retry-after']).toBeDefined();
    });

    it('should reset rate limit after window expires', async () => {
      // Max out the rate limit
      await makeRequests('/api/test', defaultRateLimitConfig.max);
      
      // Wait for window reset
      await waitForRateLimitReset(defaultRateLimitConfig.windowMs);
      
      // Verify new requests succeed
      const response = await request.get('/api/test');
      expect(response.status).toBe(200);
      validateRateLimitHeaders(response, defaultRateLimitConfig);
    });
  });

  describe('Authentication Rate Limiting', () => {
    it('should enforce stricter limits on auth endpoints', async () => {
      const endpoint = '/auth/login';
      const invalidCredentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      // Make max allowed auth requests
      const responses = await Promise.all(
        Array(authRateLimitConfig.max).fill(null).map(() =>
          request.post(endpoint).send(invalidCredentials)
        )
      );

      // Verify all requests were processed
      responses.forEach(response => {
        expect(response.status).toBe(401);
      });

      // Next request should be rate limited
      const exceededResponse = await request.post(endpoint).send(invalidCredentials);
      expect(exceededResponse.status).toBe(429);
      expect(exceededResponse.body.error).toContain('authentication attempts');
    });

    it('should store rate limit data in Redis', async () => {
      const endpoint = '/auth/login';
      const key = `rl:${testUser.id}-auth`;

      await request.post(endpoint).send({
        email: testUser.email,
        password: 'wrongpassword'
      });

      const stored = await redisClient.get(key);
      expect(stored).toBeDefined();
    });
  });

  describe('AI Service Rate Limiting', () => {
    it('should enforce AI-specific rate limits', async () => {
      const endpoint = '/api/ai/query';
      
      // Make max allowed AI requests
      const responses = await makeRequests(
        endpoint,
        aiRateLimitConfig.max,
        authToken
      );

      // Verify all succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        validateRateLimitHeaders(response, aiRateLimitConfig);
      });

      // Next request should be rate limited
      const exceededResponse = await request
        .get(endpoint)
        .set('Authorization', `Bearer ${authToken}`);
      expect(exceededResponse.status).toBe(429);
      expect(exceededResponse.body.error).toContain('AI service');
    });
  });

  describe('Distributed Rate Limiting', () => {
    it('should maintain rate limits across multiple instances', async () => {
      // Simulate requests from different API instances
      const endpoint = '/api/test';
      const instance1Requests = makeRequests(endpoint, 5);
      const instance2Requests = makeRequests(endpoint, 5);

      const allResponses = await Promise.all([
        ...instance1Requests,
        ...instance2Requests
      ]);

      // Verify shared rate limit counter
      const lastResponse = allResponses[allResponses.length - 1];
      const remaining = parseInt(lastResponse.headers['ratelimit-remaining']);
      expect(remaining).toBe(defaultRateLimitConfig.max - 10);

      // Verify Redis store state
      const keys = await redisClient.keys('rl:*');
      expect(keys.length).toBeGreaterThan(0);
    });
  });
});