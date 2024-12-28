/**
 * Integration Tests for API Gateway Service
 * Version: 1.0.0
 * 
 * Tests routing, authentication, rate limiting, error handling, and performance
 * across different microservices with comprehensive validation.
 */

import { jest, describe, beforeAll, afterAll, beforeEach, afterEach, it, expect } from '@jest/globals'; // ^29.0.0
import supertest from 'supertest'; // ^6.3.0
import nock from 'nock'; // ^13.0.0
import { faker } from '@faker-js/faker'; // ^8.0.0
import app from '../../src/app';
import { setupTestEnvironment, teardownTestEnvironment, TestContext, createTestUser } from '../../../../test/utils/test-helpers';
import { UserRole } from '../../user-service/src/interfaces/auth.interface';
import { handleError } from '../../src/middleware/error.middleware';

// Test context and request setup
let testContext: TestContext;
const request = supertest(app);

// Test constants
const API_VERSION = '/api/v1';
const TEST_TIMEOUT = 30000;
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 100;

describe('API Gateway Integration Tests', () => {
  beforeAll(async () => {
    // Initialize test environment
    testContext = await setupTestEnvironment({
      aiAgentTesting: true,
      securityValidation: true,
      performanceMonitoring: true
    });

    // Mock external services
    nock('http://message-service')
      .persist()
      .post('/messages')
      .reply(200, { id: faker.string.uuid() });

    nock('http://user-service')
      .persist()
      .get('/users/profile')
      .reply(200, { id: faker.string.uuid() });

    // Create test users with different roles
    await Promise.all([
      createTestUser(UserRole.USER),
      createTestUser(UserRole.PREMIUM_USER),
      createTestUser(UserRole.ADMIN)
    ]);
  });

  afterAll(async () => {
    await teardownTestEnvironment();
    nock.cleanAll();
  });

  describe('Authentication Flow', () => {
    it('should successfully authenticate with valid credentials', async () => {
      const credentials = {
        email: faker.internet.email(),
        password: faker.internet.password()
      };

      const response = await request
        .post(`${API_VERSION}/auth/login`)
        .send(credentials)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should handle invalid credentials correctly', async () => {
      const response = await request
        .post(`${API_VERSION}/auth/login`)
        .send({
          email: 'invalid@email.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTH_FAILED');
    });

    it('should refresh token successfully', async () => {
      const validRefreshToken = testContext.getValidRefreshToken();

      const response = await request
        .post(`${API_VERSION}/auth/refresh`)
        .send({ refreshToken: validRefreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      const requests = Array(6).fill(null).map(() => 
        request
          .post(`${API_VERSION}/auth/login`)
          .send({
            email: faker.internet.email(),
            password: faker.internet.password()
          })
      );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
    });

    it('should enforce different rate limits for AI endpoints', async () => {
      const token = testContext.getValidAccessToken();
      const requests = Array(101).fill(null).map(() => 
        request
          .post(`${API_VERSION}/ai/query`)
          .set('Authorization', `Bearer ${token}`)
          .send({ query: 'test query' })
      );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body).toHaveProperty('code', 'AI_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Service Routing', () => {
    let validToken: string;

    beforeEach(() => {
      validToken = testContext.getValidAccessToken();
    });

    it('should route message service requests correctly', async () => {
      const response = await request
        .post(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          content: faker.lorem.sentence(),
          chatId: faker.string.uuid()
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
    });

    it('should handle WebSocket connections for real-time messages', async () => {
      const wsClient = testContext.createWebSocketClient(validToken);
      const connected = await new Promise(resolve => {
        wsClient.on('connect', () => resolve(true));
        wsClient.on('error', () => resolve(false));
      });

      expect(connected).toBe(true);
      wsClient.close();
    });

    it('should route AI service requests with context', async () => {
      const response = await request
        .post(`${API_VERSION}/ai/query`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          query: 'restaurant recommendation',
          context: { location: 'downtown' }
        })
        .expect(200);

      expect(response.body).toHaveProperty('response');
      expect(response.body).toHaveProperty('confidence');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors correctly', async () => {
      const response = await request
        .get(`${API_VERSION}/nonexistent`)
        .expect(404);

      expect(response.body).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should handle validation errors with details', async () => {
      const response = await request
        .post(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${testContext.getValidAccessToken()}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(response.body).toHaveProperty('details');
    });

    it('should handle service unavailability gracefully', async () => {
      nock('http://message-service')
        .post('/messages')
        .replyWithError('Service unavailable');

      const response = await request
        .post(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${testContext.getValidAccessToken()}`)
        .send({
          content: faker.lorem.sentence(),
          chatId: faker.string.uuid()
        })
        .expect(503);

      expect(response.body).toHaveProperty('code', 'SERVICE_UNAVAILABLE');
    });
  });

  describe('Performance', () => {
    it('should meet response time SLA for API requests', async () => {
      const startTime = Date.now();
      
      await request
        .get(`${API_VERSION}/users/profile`)
        .set('Authorization', `Bearer ${testContext.getValidAccessToken()}`)
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(2000); // 2s SLA
    });

    it('should handle concurrent requests efficiently', async () => {
      const token = testContext.getValidAccessToken();
      const concurrentRequests = 50;
      
      const requests = Array(concurrentRequests).fill(null).map(() => 
        request
          .get(`${API_VERSION}/users/profile`)
          .set('Authorization', `Bearer ${token}`)
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(totalTime).toBeLessThan(5000); // 5s total for 50 requests
    });

    it('should maintain performance under rate limiting', async () => {
      const token = testContext.getValidAccessToken();
      const requests = Array(RATE_LIMIT_MAX).fill(null).map(() => 
        request
          .get(`${API_VERSION}/users/profile`)
          .set('Authorization', `Bearer ${token}`)
      );

      const startTime = Date.now();
      await Promise.all(requests);
      const averageTime = (Date.now() - startTime) / RATE_LIMIT_MAX;

      expect(averageTime).toBeLessThan(100); // 100ms average per request
    });
  });
});