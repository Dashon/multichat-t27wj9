/**
 * End-to-end tests for user authentication flows
 * Version: 1.0.0
 * 
 * Validates complete authentication lifecycle including:
 * - User registration
 * - Login/logout flows
 * - Token management
 * - Security controls
 * - Rate limiting
 */

import { describe, it, beforeAll, afterAll, expect, jest } from '@jest/globals'; // v29.x
import request from 'supertest'; // v6.x
import { LoginCredentials, AuthTokens, TokenPayload, UserRole } from '../../backend/user-service/src/interfaces/auth.interface';
import { createTestUser, waitForDatabaseSync, cleanupTestUser, validateTokenStructure } from '../../utils/test-helpers';

// Constants
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000;
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 300000; // 5 minutes in milliseconds

// Test data
let testUser: { email: string; password: string; id?: string };
let testTokens: AuthTokens;

describe('Authentication E2E Tests', () => {
  beforeAll(async () => {
    // Initialize test environment and create test user
    await waitForDatabaseSync();
    testUser = {
      email: `test.user.${Date.now()}@example.com`,
      password: 'Test@123!Password'
    };
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test data
    if (testUser.id) {
      await cleanupTestUser(testUser.id);
    }
    await waitForDatabaseSync();
  }, TEST_TIMEOUT);

  it('should successfully register a new user', async () => {
    const response = await request(API_BASE_URL)
      .post('/api/v1/auth/register')
      .send({
        email: testUser.email,
        password: testUser.password,
        role: UserRole.USER
      })
      .expect(201);

    // Validate response structure
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('email', testUser.email);
    expect(response.body).toHaveProperty('role', UserRole.USER);

    // Validate security headers
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');

    // Store user ID for cleanup
    testUser.id = response.body.id;

    // Verify response time SLA
    expect(response.duration).toBeLessThan(2000);
  }, TEST_TIMEOUT);

  it('should successfully login and receive tokens', async () => {
    const response = await request(API_BASE_URL)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      } as LoginCredentials)
      .expect(200);

    // Validate token structure
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(response.body).toHaveProperty('expiresIn');
    expect(response.body).toHaveProperty('tokenType', 'Bearer');

    // Validate token format and expiry
    const tokenValidation = await validateTokenStructure(response.body.accessToken);
    expect(tokenValidation.valid).toBe(true);
    expect(tokenValidation.payload).toHaveProperty('userId', testUser.id);

    // Store tokens for subsequent tests
    testTokens = response.body;

    // Verify security headers
    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  }, TEST_TIMEOUT);

  it('should refresh access token with valid refresh token', async () => {
    // Wait briefly to ensure tokens are different
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await request(API_BASE_URL)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: testTokens.refreshToken
      })
      .expect(200);

    // Validate new tokens
    expect(response.body.accessToken).not.toBe(testTokens.accessToken);
    expect(response.body).toHaveProperty('refreshToken');
    expect(response.body).toHaveProperty('expiresIn');

    // Validate token structure
    const tokenValidation = await validateTokenStructure(response.body.accessToken);
    expect(tokenValidation.valid).toBe(true);
    expect(tokenValidation.payload).toHaveProperty('userId', testUser.id);

    // Update stored tokens
    testTokens = response.body;
  }, TEST_TIMEOUT);

  it('should successfully logout and invalidate tokens', async () => {
    const response = await request(API_BASE_URL)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${testTokens.accessToken}`)
      .expect(200);

    // Verify tokens are invalidated
    const verifyResponse = await request(API_BASE_URL)
      .get('/api/v1/auth/verify')
      .set('Authorization', `Bearer ${testTokens.accessToken}`)
      .expect(401);

    expect(verifyResponse.body).toHaveProperty('error');
    expect(response.headers['clear-site-data']).toBeDefined();
  }, TEST_TIMEOUT);

  it('should enforce rate limiting on failed login attempts', async () => {
    const invalidCredentials = {
      email: testUser.email,
      password: 'wrong_password'
    };

    // Attempt multiple failed logins
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      const response = await request(API_BASE_URL)
        .post('/api/v1/auth/login')
        .send(invalidCredentials)
        .expect(i < MAX_LOGIN_ATTEMPTS - 1 ? 401 : 429);

      // Verify rate limit headers on last attempt
      if (i === MAX_LOGIN_ATTEMPTS - 1) {
        expect(response.headers['retry-after']).toBeDefined();
        expect(response.headers['x-ratelimit-reset']).toBeDefined();
      }
    }

    // Verify account is temporarily locked
    const validLoginResponse = await request(API_BASE_URL)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      })
      .expect(429);

    expect(validLoginResponse.body).toHaveProperty('error');
    expect(validLoginResponse.body.error).toContain('Too many login attempts');
  }, TEST_TIMEOUT);

  it('should prevent login with invalid credentials', async () => {
    const response = await request(API_BASE_URL)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'invalid_password'
      } as LoginCredentials)
      .expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.headers['www-authenticate']).toBeDefined();
  });

  it('should validate refresh token format and expiry', async () => {
    const response = await request(API_BASE_URL)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: 'invalid_token'
      })
      .expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid refresh token');
  });
});