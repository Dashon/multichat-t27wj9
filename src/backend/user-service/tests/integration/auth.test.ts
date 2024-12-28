/**
 * Authentication Integration Tests
 * Version: 1.0.0
 * 
 * Comprehensive integration tests for authentication flows, token management,
 * and security controls as specified in section 7.1 and 7.3 of the technical specification.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'; // v29.0.0
import request from 'supertest'; // v6.3.0
import { sign } from 'jsonwebtoken'; // v9.0.0

import { AuthService } from '../../src/services/auth.service';
import { 
  LoginCredentials, 
  DeviceInfo, 
  AuthTokens, 
  RefreshTokenRequest,
  UserRole 
} from '../../src/interfaces/auth.interface';
import { getTestConfig } from '../../../test/config/test-config';
import { SecurityLevel } from '../../src/interfaces/user.interface';

// Test configuration and constants
const TEST_CONFIG = getTestConfig('integration');
const API_BASE_URL = '/api/v1/auth';
const TEST_USER: LoginCredentials = {
  email: 'test@example.com',
  password: 'Test123!@#',
};
const TEST_DEVICE: DeviceInfo = {
  deviceId: 'test-device-001',
  deviceType: 'desktop',
  userAgent: 'test-agent/1.0'
};

describe('Authentication Integration Tests', () => {
  let app: any;
  let authService: AuthService;
  let testAccessToken: string;
  let testRefreshToken: string;

  beforeAll(async () => {
    // Initialize test environment
    const config = await getTestConfig('integration');
    app = config.app;
    authService = new AuthService(config.userRepository, config.redisClient);

    // Create test user
    await config.userRepository.create({
      email: TEST_USER.email,
      password: TEST_USER.password,
      username: 'testuser',
      role: UserRole.USER,
      securityLevel: SecurityLevel.INTERNAL,
      isVerified: true
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await config.userRepository.delete(TEST_USER.email);
    await config.redisClient.flushall();
    await app.close();
  });

  beforeEach(() => {
    jest.setTimeout(TEST_CONFIG.timeout);
  });

  describe('Login Flow Tests', () => {
    test('should successfully login with valid credentials', async () => {
      const response = await request(app)
        .post(`${API_BASE_URL}/login`)
        .send({ ...TEST_USER, deviceInfo: TEST_DEVICE })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('tokenType', 'Bearer');
      expect(response.body).toHaveProperty('issuedAt');

      // Verify security headers
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');

      // Store tokens for subsequent tests
      testAccessToken = response.body.accessToken;
      testRefreshToken = response.body.refreshToken;
    });

    test('should fail login with invalid credentials', async () => {
      const response = await request(app)
        .post(`${API_BASE_URL}/login`)
        .send({
          email: TEST_USER.email,
          password: 'wrongpassword',
          deviceInfo: TEST_DEVICE
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid credentials');
    });

    test('should enforce rate limiting on failed attempts', async () => {
      const attempts = Array(6).fill(null);
      
      for (const [index] of attempts.entries()) {
        const response = await request(app)
          .post(`${API_BASE_URL}/login`)
          .send({
            email: TEST_USER.email,
            password: 'wrongpassword',
            deviceInfo: TEST_DEVICE
          });

        if (index < 5) {
          expect(response.status).toBe(401);
        } else {
          expect(response.status).toBe(429);
          expect(response.body.error).toContain('Too many login attempts');
        }
      }
    });
  });

  describe('Token Management Tests', () => {
    test('should successfully refresh token', async () => {
      const response = await request(app)
        .post(`${API_BASE_URL}/refresh`)
        .send({
          refreshToken: testRefreshToken,
          deviceInfo: TEST_DEVICE
        } as RefreshTokenRequest)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.accessToken).not.toBe(testAccessToken);
      expect(response.body.refreshToken).not.toBe(testRefreshToken);

      // Update tokens for subsequent tests
      testAccessToken = response.body.accessToken;
      testRefreshToken = response.body.refreshToken;
    });

    test('should fail with invalid refresh token', async () => {
      await request(app)
        .post(`${API_BASE_URL}/refresh`)
        .send({
          refreshToken: 'invalid-refresh-token',
          deviceInfo: TEST_DEVICE
        } as RefreshTokenRequest)
        .expect(401);
    });

    test('should fail with mismatched device info', async () => {
      await request(app)
        .post(`${API_BASE_URL}/refresh`)
        .send({
          refreshToken: testRefreshToken,
          deviceInfo: { ...TEST_DEVICE, deviceId: 'different-device' }
        } as RefreshTokenRequest)
        .expect(401);
    });
  });

  describe('Token Validation Tests', () => {
    test('should successfully validate valid token', async () => {
      const response = await request(app)
        .post(`${API_BASE_URL}/validate`)
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({ deviceInfo: TEST_DEVICE })
        .expect(200);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('payload');
      expect(response.body.payload).toHaveProperty('userId');
      expect(response.body.payload).toHaveProperty('email', TEST_USER.email);
    });

    test('should fail validation with expired token', async () => {
      // Create expired token
      const expiredToken = sign(
        { 
          userId: 'test-user',
          exp: Math.floor(Date.now() / 1000) - 3600 
        },
        process.env.JWT_SECRET || 'test-secret'
      );

      await request(app)
        .post(`${API_BASE_URL}/validate`)
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ deviceInfo: TEST_DEVICE })
        .expect(401);
    });
  });

  describe('Logout Tests', () => {
    test('should successfully logout and invalidate tokens', async () => {
      await request(app)
        .post(`${API_BASE_URL}/logout`)
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({ deviceInfo: TEST_DEVICE })
        .expect(200);

      // Verify token is invalidated
      await request(app)
        .post(`${API_BASE_URL}/validate`)
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({ deviceInfo: TEST_DEVICE })
        .expect(401);

      // Verify refresh token is invalidated
      await request(app)
        .post(`${API_BASE_URL}/refresh`)
        .send({
          refreshToken: testRefreshToken,
          deviceInfo: TEST_DEVICE
        } as RefreshTokenRequest)
        .expect(401);
    });
  });

  describe('Security Controls Tests', () => {
    test('should require CSRF token for mutations', async () => {
      await request(app)
        .post(`${API_BASE_URL}/login`)
        .send(TEST_USER)
        .expect(403); // Missing CSRF token
    });

    test('should validate content-type headers', async () => {
      await request(app)
        .post(`${API_BASE_URL}/login`)
        .send('invalid-json')
        .set('Content-Type', 'text/plain')
        .expect(415); // Unsupported media type
    });

    test('should sanitize error messages', async () => {
      const response = await request(app)
        .post(`${API_BASE_URL}/login`)
        .send({
          email: 'sql-injection@test.com\' OR \'1\'=\'1',
          password: TEST_USER.password
        })
        .expect(400);

      expect(response.body.error).not.toContain('SQL');
      expect(response.body.error).toBe('Invalid input format');
    });
  });
});