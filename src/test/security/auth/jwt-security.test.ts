/**
 * JWT Security Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for JWT token security, validation, and token management.
 * Implements security requirements from sections 7.1 and 7.3 of technical specifications.
 */

// External imports with versions for production stability
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'; // v29.x
import { decode, verify } from 'jsonwebtoken'; // v9.0.0

// Internal imports
import { AuthService } from '../../../backend/user-service/src/services/auth.service';
import { createTestUser, waitForDatabaseSync } from '../../utils/test-helpers';
import { UserRole } from '../../../backend/user-service/src/interfaces/auth.interface';

// Test constants
const TEST_TIMEOUT = 30000;
const TOKEN_EXPIRY_BUFFER = 1000;
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour in ms

describe('JWT Security Tests', () => {
  let authService: AuthService;
  let testUser: any;
  let mockTokens: any;

  // Setup before each test
  beforeEach(async () => {
    // Initialize test environment
    await waitForDatabaseSync();
    
    // Create test user
    testUser = await createTestUser(UserRole.USER, {
      securityLevel: 2,
      isVerified: true
    });

    // Initialize auth service
    authService = new AuthService(
      jest.fn() as any, // Mock user repository
      jest.fn() as any  // Mock Redis client
    );

    // Generate test tokens
    mockTokens = await authService.login(
      {
        email: testUser.email,
        password: 'TestPassword123!',
        deviceInfo: {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      },
      {
        deviceId: 'test-device',
        deviceType: 'browser',
        userAgent: 'jest-test'
      }
    );
  }, TEST_TIMEOUT);

  // Cleanup after each test
  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('Token Generation and Structure', () => {
    it('should generate valid JWT tokens with correct structure', async () => {
      // Verify access token structure
      const decodedAccess = decode(mockTokens.accessToken, { complete: true });
      expect(decodedAccess).toBeTruthy();
      expect(decodedAccess?.header.alg).toBe('HS256');
      expect(decodedAccess?.payload).toHaveProperty('userId');
      expect(decodedAccess?.payload).toHaveProperty('email');
      expect(decodedAccess?.payload).toHaveProperty('role');
      expect(decodedAccess?.payload).toHaveProperty('deviceId');
      expect(decodedAccess?.payload).toHaveProperty('sessionId');
      expect(decodedAccess?.payload).toHaveProperty('exp');
      expect(decodedAccess?.payload).toHaveProperty('iat');

      // Verify refresh token format
      expect(mockTokens.refreshToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should enforce token expiration times', async () => {
      const decodedAccess = decode(mockTokens.accessToken) as any;
      const expiryTime = decodedAccess.exp * 1000 - decodedAccess.iat * 1000;
      
      expect(expiryTime).toBe(ACCESS_TOKEN_EXPIRY);
      expect(mockTokens.expiresIn).toBe(3600); // 1 hour in seconds
    });
  });

  describe('Token Validation', () => {
    it('should validate tokens with proper signature verification', async () => {
      const result = await authService.validateToken(
        mockTokens.accessToken,
        {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      );

      expect(result.valid).toBe(true);
      expect(result.payload).toBeTruthy();
      expect(result.payload?.userId).toBe(testUser.id);
    });

    it('should reject tampered tokens', async () => {
      // Tamper with the token by changing a character
      const tamperedToken = mockTokens.accessToken.slice(0, -1) + 'X';

      const result = await authService.validateToken(
        tamperedToken,
        {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should enforce device binding', async () => {
      const result = await authService.validateToken(
        mockTokens.accessToken,
        {
          deviceId: 'different-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid device');
    });
  });

  describe('Token Refresh Mechanism', () => {
    it('should successfully refresh tokens', async () => {
      const newTokens = await authService.refreshToken({
        refreshToken: mockTokens.refreshToken,
        deviceInfo: {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      });

      expect(newTokens.accessToken).not.toBe(mockTokens.accessToken);
      expect(newTokens.refreshToken).not.toBe(mockTokens.refreshToken);
      expect(newTokens.expiresIn).toBe(3600);
    });

    it('should invalidate old refresh tokens after use', async () => {
      // First refresh
      await authService.refreshToken({
        refreshToken: mockTokens.refreshToken,
        deviceInfo: {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      });

      // Attempt to reuse the same refresh token
      await expect(authService.refreshToken({
        refreshToken: mockTokens.refreshToken,
        deviceInfo: {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      })).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('Security Controls', () => {
    it('should handle concurrent token usage', async () => {
      const validations = await Promise.all([
        authService.validateToken(mockTokens.accessToken, {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }),
        authService.validateToken(mockTokens.accessToken, {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        })
      ]);

      expect(validations[0].valid).toBe(true);
      expect(validations[1].valid).toBe(true);
    });

    it('should properly revoke tokens on logout', async () => {
      // Logout the user
      await authService.logout(testUser.id, 'test-device');

      // Attempt to validate the token after logout
      const result = await authService.validateToken(
        mockTokens.accessToken,
        {
          deviceId: 'test-device',
          deviceType: 'browser',
          userAgent: 'jest-test'
        }
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Session expired');
    });
  });
});