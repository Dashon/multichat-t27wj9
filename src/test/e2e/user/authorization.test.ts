/**
 * End-to-end tests for user authorization in the AI-Enhanced Group Chat Platform
 * Tests role-based access control, token management, and security controls
 * @version 1.0.0
 */

import { jest, describe, beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals'; // v29.x
import supertest from 'supertest'; // v6.x
import { UserRole } from '../../../backend/user-service/src/interfaces/auth.interface';
import { createTestUser, waitForDatabaseSync } from '../../utils/test-helpers';

// Test timeouts
jest.setTimeout(TEST_TIMEOUT);

// Test API endpoint
const API_URL = process.env.API_URL || 'http://localhost:3000';
const request = supertest(API_URL);

// Test data
let testUsers: Record<UserRole, any> = {} as Record<UserRole, any>;
let testTokens: Record<UserRole, string> = {} as Record<UserRole, string>;

describe('User Authorization E2E Tests', () => {
  beforeAll(async () => {
    // Create test users for each role
    for (const role of Object.values(UserRole)) {
      testUsers[role] = await createTestUser(role);
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: testUsers[role].email,
          password: 'testPassword123!'
        });
      testTokens[role] = response.body.accessToken;
    }
    await waitForDatabaseSync();
  });

  beforeEach(async () => {
    // Ensure database is in sync before each test
    await waitForDatabaseSync();
  });

  describe('Regular User Authorization', () => {
    test('should allow access to own chat resources', async () => {
      const response = await request
        .get(`/api/v1/chats/${testUsers[UserRole.USER].id}`)
        .set('Authorization', `Bearer ${testTokens[UserRole.USER]}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chatId');
    });

    test('should allow access to basic AI agents', async () => {
      const response = await request
        .post('/api/v1/ai/query')
        .set('Authorization', `Bearer ${testTokens[UserRole.USER]}`)
        .send({
          agentType: '@foodie',
          query: 'Restaurant recommendation'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('response');
    });

    test('should deny access to premium features', async () => {
      const response = await request
        .post('/api/v1/polls/create')
        .set('Authorization', `Bearer ${testTokens[UserRole.USER]}`)
        .send({
          question: 'Test poll',
          options: ['Option 1', 'Option 2']
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'Premium feature access denied');
    });

    test('should enforce rate limiting', async () => {
      const requests = Array(105).fill(null).map(() => 
        request
          .get('/api/v1/chats')
          .set('Authorization', `Bearer ${testTokens[UserRole.USER]}`)
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Premium User Authorization', () => {
    test('should allow access to all public chats', async () => {
      const response = await request
        .get('/api/v1/chats/public')
        .set('Authorization', `Bearer ${testTokens[UserRole.PREMIUM_USER]}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should allow access to all AI agents', async () => {
      const agents = ['@foodie', '@explorer', '@planner', '@budget', '@local'];
      const requests = agents.map(agent =>
        request
          .post('/api/v1/ai/query')
          .set('Authorization', `Bearer ${testTokens[UserRole.PREMIUM_USER]}`)
          .send({
            agentType: agent,
            query: 'Test query'
          })
      );

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('response');
      });
    });

    test('should allow access to premium features', async () => {
      const response = await request
        .post('/api/v1/recommendations/create')
        .set('Authorization', `Bearer ${testTokens[UserRole.PREMIUM_USER]}`)
        .send({
          type: 'restaurant',
          content: 'Test recommendation'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });

  describe('Moderator Authorization', () => {
    test('should allow access to moderation dashboard', async () => {
      const response = await request
        .get('/api/v1/moderation/dashboard')
        .set('Authorization', `Bearer ${testTokens[UserRole.MODERATOR]}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('reports');
    });

    test('should allow content moderation actions', async () => {
      const response = await request
        .post('/api/v1/moderation/actions/remove')
        .set('Authorization', `Bearer ${testTokens[UserRole.MODERATOR]}`)
        .send({
          messageId: 'test-message-id',
          reason: 'Inappropriate content'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('should deny access to admin features', async () => {
      const response = await request
        .get('/api/v1/admin/system-config')
        .set('Authorization', `Bearer ${testTokens[UserRole.MODERATOR]}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Admin Authorization', () => {
    test('should allow full system configuration access', async () => {
      const response = await request
        .put('/api/v1/admin/system-config')
        .set('Authorization', `Bearer ${testTokens[UserRole.ADMIN]}`)
        .send({
          aiAgentSettings: {
            responseTimeout: 5000
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('updated', true);
    });

    test('should allow user management operations', async () => {
      const response = await request
        .post('/api/v1/admin/users/manage')
        .set('Authorization', `Bearer ${testTokens[UserRole.ADMIN]}`)
        .send({
          userId: testUsers[UserRole.USER].id,
          action: 'updateRole',
          newRole: UserRole.PREMIUM_USER
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('should allow access to audit logs', async () => {
      const response = await request
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${testTokens[UserRole.ADMIN]}`)
        .query({
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date().toISOString()
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Token Management', () => {
    test('should handle token expiration correctly', async () => {
      // Wait for access token to expire
      await new Promise(resolve => setTimeout(resolve, 3600000));

      const response = await request
        .get('/api/v1/chats')
        .set('Authorization', `Bearer ${testTokens[UserRole.USER]}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Token expired');
    });

    test('should allow token refresh', async () => {
      const response = await request
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: testTokens[UserRole.USER]
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });
  });
});