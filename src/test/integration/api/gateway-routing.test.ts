/**
 * Integration Tests for API Gateway Routing
 * Version: 1.0.0
 * 
 * Tests API Gateway routing functionality including security controls,
 * rate limiting, and performance metrics.
 */

import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals'; // ^29.5.0
import supertest from 'supertest'; // ^6.3.3
import { Redis } from 'redis'; // ^4.6.7
import { app } from '../../../backend/api-gateway/src/app';
import { createTestUser, waitForDatabaseSync, generateTestToken } from '../../utils/test-helpers';
import { UserRole } from '../../../backend/user-service/src/interfaces/auth.interface';

// Constants
const API_VERSION = '/api/v1';
const TEST_TIMEOUT = 30000;
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;

// Test data types
interface TestUser {
  id: string;
  email: string;
  role: UserRole;
  token: string;
}

interface SecurityEvent {
  type: string;
  timestamp: Date;
  details: Record<string, any>;
}

describe('API Gateway Routing Integration Tests', () => {
  let request: supertest.SuperTest<supertest.Test>;
  let testUsers: Map<UserRole, TestUser>;
  let redisClient: Redis;
  let securityEvents: SecurityEvent[];

  beforeAll(async () => {
    // Initialize test environment
    request = supertest(app);
    testUsers = new Map();
    securityEvents = [];

    // Initialize Redis client for rate limit testing
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });

    // Create test users for each role
    for (const role of Object.values(UserRole)) {
      const user = await createTestUser(role);
      const token = await generateTestToken(user);
      testUsers.set(role, { ...user, token });
    }

    // Wait for database sync
    await waitForDatabaseSync();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup
    await redisClient.quit();
    await Promise.all([...testUsers.values()].map(user => 
      request.delete(`${API_VERSION}/users/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
    ));
  });

  describe('Public Routes', () => {
    it('should allow access to login endpoint with correct CORS headers', async () => {
      const response = await request
        .post(`${API_VERSION}/auth/login`)
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.status).toBe(401); // Unauthorized but accessible
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });

    it('should enforce rate limiting on public endpoints', async () => {
      const requests = Array(RATE_LIMIT_MAX_REQUESTS + 1).fill(null).map(() =>
        request.post(`${API_VERSION}/auth/login`)
          .send({ email: 'test@example.com', password: 'password' })
      );

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);
      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Protected Routes', () => {
    it('should require valid JWT token for protected endpoints', async () => {
      const response = await request
        .get(`${API_VERSION}/messages`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('AUTH_FAILED');
    });

    it('should enforce role-based access control', async () => {
      const regularUser = testUsers.get(UserRole.USER)!;
      const adminEndpoint = `${API_VERSION}/admin/users`;

      const response = await request
        .get(adminEndpoint)
        .set('Authorization', `Bearer ${regularUser.token}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });

    it('should track security events for unauthorized access', async () => {
      const suspiciousEndpoint = `${API_VERSION}/users/sensitive-data`;
      const malformedToken = 'Bearer malformed-token';

      await request
        .get(suspiciousEndpoint)
        .set('Authorization', malformedToken);

      const securityEvent = securityEvents.find(e => 
        e.type === 'UNAUTHORIZED_ACCESS' && 
        e.details.endpoint === suspiciousEndpoint
      );
      expect(securityEvent).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce per-user rate limits on protected endpoints', async () => {
      const user = testUsers.get(UserRole.USER)!;
      const requests = Array(RATE_LIMIT_MAX_REQUESTS + 1).fill(null).map(() =>
        request.get(`${API_VERSION}/messages`)
          .set('Authorization', `Bearer ${user.token}`)
      );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should provide rate limit headers in responses', async () => {
      const user = testUsers.get(UserRole.USER)!;
      const response = await request
        .get(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Service Integration', () => {
    it('should route message service requests correctly', async () => {
      const user = testUsers.get(UserRole.USER)!;
      const response = await request
        .post(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          content: 'Test message',
          chatId: 'test-chat-id'
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
    });

    it('should handle AI service integration with context', async () => {
      const user = testUsers.get(UserRole.USER)!;
      const response = await request
        .post(`${API_VERSION}/ai/query`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          query: 'Test query',
          context: { previousMessages: [] }
        });

      expect(response.status).toBe(200);
      expect(response.body.response).toBeDefined();
      expect(response.body.confidence).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes with proper 404 response', async () => {
      const response = await request.get(`${API_VERSION}/invalid-route`);
      
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should handle malformed requests with proper validation errors', async () => {
      const user = testUsers.get(UserRole.USER)!;
      const response = await request
        .post(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Performance Metrics', () => {
    it('should respond within SLA timeframe', async () => {
      const startTime = Date.now();
      const user = testUsers.get(UserRole.USER)!;
      
      await request
        .get(`${API_VERSION}/messages`)
        .set('Authorization', `Bearer ${user.token}`);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(2000); // 2s SLA requirement
    });

    it('should handle concurrent requests efficiently', async () => {
      const user = testUsers.get(UserRole.USER)!;
      const concurrentRequests = 10;
      
      const startTime = Date.now();
      const requests = Array(concurrentRequests).fill(null).map(() =>
        request.get(`${API_VERSION}/messages`)
          .set('Authorization', `Bearer ${user.token}`)
      );

      const responses = await Promise.all(requests);
      const responseTime = Date.now() - startTime;

      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(responseTime / concurrentRequests).toBeLessThan(100); // 100ms per request average
    });
  });
});