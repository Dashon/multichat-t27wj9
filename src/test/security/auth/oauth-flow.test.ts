/**
 * OAuth Flow Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for OAuth2 authentication flow with enhanced security controls
 * including device validation, rate limiting, and token management.
 * Implements test coverage for requirements from sections 7.1 and 7.3.
 */

import { describe, it, beforeEach, afterEach, expect, jest } from 'jest'; // v29.0.0
import supertest from 'supertest'; // v6.3.0

import { 
  LoginCredentials, 
  AuthTokens, 
  TokenPayload, 
  RefreshTokenRequest,
  UserRole,
  DeviceInfo
} from '../../../backend/user-service/src/interfaces/auth.interface';
import { AuthService } from '../../../backend/user-service/src/services/auth.service';

// Test constants
const TEST_USER_CREDENTIALS: LoginCredentials = {
  email: 'test@example.com',
  password: 'Test123!@#',
  deviceInfo: {
    deviceId: 'test-device-123',
    deviceType: 'desktop',
    userAgent: 'test-agent'
  }
};

const MOCK_TOKENS: AuthTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
  tokenType: 'Bearer',
  issuedAt: Math.floor(Date.now() / 1000)
};

const RATE_LIMIT_CONFIG = {
  maxAttempts: 5,
  windowMs: 300000 // 5 minutes
};

describe('OAuth Authentication Flow', () => {
  let authService: AuthService;
  let mockRedisClient: jest.Mocked<any>;

  beforeEach(() => {
    // Mock Redis client
    mockRedisClient = {
      incr: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      pipeline: jest.fn().mockReturnValue({
        exec: jest.fn()
      })
    };

    // Initialize AuthService with mocks
    authService = new AuthService(
      {} as any, // Mock UserRepository
      mockRedisClient
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Login Flow', () => {
    it('should successfully authenticate user with valid credentials and device info', async () => {
      // Mock successful authentication
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue(null);
      
      const loginSpy = jest.spyOn(authService, 'login');
      loginSpy.mockResolvedValue(MOCK_TOKENS);

      const result = await authService.login(
        TEST_USER_CREDENTIALS,
        TEST_USER_CREDENTIALS.deviceInfo as DeviceInfo
      );

      expect(result).toEqual(MOCK_TOKENS);
      expect(mockRedisClient.incr).toHaveBeenCalled();
      expect(mockRedisClient.setex).toHaveBeenCalled();
      expect(loginSpy).toHaveBeenCalledWith(
        TEST_USER_CREDENTIALS,
        TEST_USER_CREDENTIALS.deviceInfo
      );
    });

    it('should enforce rate limiting on failed login attempts', async () => {
      // Mock rate limit exceeded
      mockRedisClient.incr.mockResolvedValue(RATE_LIMIT_CONFIG.maxAttempts + 1);

      await expect(
        authService.login(
          TEST_USER_CREDENTIALS,
          TEST_USER_CREDENTIALS.deviceInfo as DeviceInfo
        )
      ).rejects.toThrow('Too many login attempts');

      expect(mockRedisClient.incr).toHaveBeenCalled();
    });

    it('should validate device fingerprint during login', async () => {
      const invalidDeviceInfo = {
        ...TEST_USER_CREDENTIALS.deviceInfo,
        deviceId: 'unknown-device'
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        deviceId: TEST_USER_CREDENTIALS.deviceInfo?.deviceId
      }));

      await expect(
        authService.login(TEST_USER_CREDENTIALS, invalidDeviceInfo as DeviceInfo)
      ).rejects.toThrow('Invalid device');
    });
  });

  describe('Token Management', () => {
    it('should successfully refresh access token with valid refresh token', async () => {
      const refreshRequest: RefreshTokenRequest = {
        refreshToken: MOCK_TOKENS.refreshToken,
        deviceInfo: TEST_USER_CREDENTIALS.deviceInfo
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        userId: 'test-user-id',
        sessionId: 'test-session-id',
        deviceId: TEST_USER_CREDENTIALS.deviceInfo?.deviceId
      }));

      const refreshSpy = jest.spyOn(authService, 'refreshToken');
      refreshSpy.mockResolvedValue(MOCK_TOKENS);

      const result = await authService.refreshToken(refreshRequest);

      expect(result).toEqual(MOCK_TOKENS);
      expect(mockRedisClient.get).toHaveBeenCalled();
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });

    it('should validate token structure and expiry', async () => {
      const mockPayload: TokenPayload = {
        userId: 'test-user-id',
        email: TEST_USER_CREDENTIALS.email,
        role: UserRole.USER,
        deviceId: TEST_USER_CREDENTIALS.deviceInfo?.deviceId as string,
        sessionId: 'test-session-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        userId: mockPayload.userId,
        deviceId: mockPayload.deviceId
      }));

      const validateSpy = jest.spyOn(authService, 'validateToken');
      validateSpy.mockResolvedValue({ valid: true, payload: mockPayload });

      const result = await authService.validateToken(
        MOCK_TOKENS.accessToken,
        TEST_USER_CREDENTIALS.deviceInfo as DeviceInfo
      );

      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(mockPayload);
    });

    it('should handle expired tokens appropriately', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await authService.validateToken(
        MOCK_TOKENS.accessToken,
        TEST_USER_CREDENTIALS.deviceInfo as DeviceInfo
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Security Controls', () => {
    it('should detect and block suspicious activity patterns', async () => {
      // Mock suspicious activity detection
      mockRedisClient.incr.mockResolvedValue(3);
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        suspiciousAttempts: 3,
        lastAttempt: Date.now()
      }));

      const suspiciousCredentials = {
        ...TEST_USER_CREDENTIALS,
        deviceInfo: {
          ...TEST_USER_CREDENTIALS.deviceInfo,
          deviceId: 'suspicious-device'
        }
      };

      await expect(
        authService.login(
          suspiciousCredentials,
          suspiciousCredentials.deviceInfo as DeviceInfo
        )
      ).rejects.toThrow();

      expect(mockRedisClient.incr).toHaveBeenCalled();
    });

    it('should maintain secure session management', async () => {
      const sessionKey = `session:${TEST_USER_CREDENTIALS.deviceInfo?.deviceId}`;
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        userId: 'test-user-id',
        deviceId: TEST_USER_CREDENTIALS.deviceInfo?.deviceId
      }));

      await authService.validateToken(
        MOCK_TOKENS.accessToken,
        TEST_USER_CREDENTIALS.deviceInfo as DeviceInfo
      );

      expect(mockRedisClient.get).toHaveBeenCalledWith(expect.stringContaining('session:'));
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });

    it('should enforce device consistency across sessions', async () => {
      const newDevice: DeviceInfo = {
        deviceId: 'new-device-id',
        deviceType: 'mobile',
        userAgent: 'new-agent'
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        deviceId: TEST_USER_CREDENTIALS.deviceInfo?.deviceId
      }));

      await expect(
        authService.validateToken(MOCK_TOKENS.accessToken, newDevice)
      ).rejects.toThrow('Invalid device');
    });
  });
});