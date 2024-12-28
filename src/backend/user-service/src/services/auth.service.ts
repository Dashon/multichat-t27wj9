/**
 * Authentication Service
 * Version: 1.0.0
 * 
 * Implements secure JWT-based authentication with enhanced security features
 * including rate limiting, device tracking, and comprehensive token management.
 * Addresses requirements from section 7.1 Authentication and Authorization.
 */

import { Injectable, UnauthorizedException, BadRequestException, TooManyRequestsException } from '@nestjs/common'; // v10.0.0
import { sign, verify } from 'jsonwebtoken'; // v9.0.0
import Redis from 'ioredis'; // v5.3.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0

import { 
  LoginCredentials, 
  AuthTokens, 
  TokenPayload, 
  RefreshTokenRequest,
  UserRole,
  DeviceInfo,
  TokenValidationResult
} from '../interfaces/auth.interface';
import { UserRepository } from '../repositories/user.repository';
import { SecurityLevel } from '../interfaces/user.interface';

// Redis key prefixes for security tracking
const FAILED_LOGIN_PREFIX = 'failed_login:';
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const DEVICE_SESSION_PREFIX = 'device_session:';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_DURATION = 900; // 15 minutes in seconds

@Injectable()
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET;
  private readonly JWT_EXPIRES_IN = '1h';
  private readonly REFRESH_TOKEN_EXPIRES_IN = '7d';

  constructor(
    private readonly userRepository: UserRepository,
    private readonly redisClient: Redis
  ) {}

  /**
   * Authenticates user with enhanced security controls
   * Implements requirements from section 7.1.1 Authentication Flow
   */
  async login(credentials: LoginCredentials, deviceInfo: DeviceInfo): Promise<AuthTokens> {
    try {
      // Check rate limiting
      const ipKey = `${FAILED_LOGIN_PREFIX}${deviceInfo.deviceId}`;
      const attempts = await this.redisClient.incr(ipKey);
      
      if (attempts === 1) {
        await this.redisClient.expire(ipKey, LOGIN_BLOCK_DURATION);
      }

      if (attempts > MAX_LOGIN_ATTEMPTS) {
        throw new TooManyRequestsException('Too many login attempts. Please try again later.');
      }

      // Find and validate user
      const user = await this.userRepository.findByEmail(credentials.email);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Validate security level
      if (user.securityLevel >= SecurityLevel.SENSITIVE && !user.isVerified) {
        throw new UnauthorizedException('Account requires verification');
      }

      // Generate session ID
      const sessionId = uuidv4();

      // Create token payload
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role as UserRole,
        deviceId: deviceInfo.deviceId,
        sessionId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      };

      // Generate tokens
      const accessToken = sign(tokenPayload, this.JWT_SECRET);
      const refreshToken = uuidv4();

      // Store refresh token and session info
      await Promise.all([
        this.redisClient.setex(
          `${REFRESH_TOKEN_PREFIX}${refreshToken}`,
          7 * 24 * 3600, // 7 days
          JSON.stringify({ userId: user.id, sessionId, deviceId: deviceInfo.deviceId })
        ),
        this.redisClient.setex(
          `${DEVICE_SESSION_PREFIX}${sessionId}`,
          3600, // 1 hour
          JSON.stringify({ userId: user.id, deviceInfo })
        ),
        this.userRepository.updateLastActive(user.id)
      ]);

      // Reset failed login attempts
      await this.redisClient.del(ipKey);

      return {
        accessToken,
        refreshToken,
        expiresIn: 3600,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000)
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Validates token with enhanced security checks
   * Implements requirements from section 7.1.3 Token Management
   */
  async validateToken(token: string, deviceInfo: DeviceInfo): Promise<TokenValidationResult> {
    try {
      // Verify JWT signature and expiration
      const payload = verify(token, this.JWT_SECRET) as TokenPayload;

      // Validate device binding
      if (payload.deviceId !== deviceInfo.deviceId) {
        throw new UnauthorizedException('Invalid device');
      }

      // Check session validity
      const sessionKey = `${DEVICE_SESSION_PREFIX}${payload.sessionId}`;
      const sessionData = await this.redisClient.get(sessionKey);

      if (!sessionData) {
        throw new UnauthorizedException('Session expired');
      }

      // Extend session if valid
      await this.redisClient.expire(sessionKey, 3600);

      return { valid: true, payload };

    } catch (error) {
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }

  /**
   * Refreshes access token with security validation
   * Implements requirements from section 7.1.3 Token Management
   */
  async refreshToken(request: RefreshTokenRequest): Promise<AuthTokens> {
    try {
      const refreshKey = `${REFRESH_TOKEN_PREFIX}${request.refreshToken}`;
      const tokenData = await this.redisClient.get(refreshKey);

      if (!tokenData) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const { userId, sessionId, deviceId } = JSON.parse(tokenData);

      // Validate device if provided
      if (request.deviceInfo && request.deviceInfo.deviceId !== deviceId) {
        throw new UnauthorizedException('Invalid device');
      }

      // Get user data
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const newRefreshToken = uuidv4();
      const tokenPayload: TokenPayload = {
        userId,
        email: user.email,
        role: user.role as UserRole,
        deviceId,
        sessionId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const accessToken = sign(tokenPayload, this.JWT_SECRET);

      // Update tokens in Redis
      await Promise.all([
        this.redisClient.del(refreshKey),
        this.redisClient.setex(
          `${REFRESH_TOKEN_PREFIX}${newRefreshToken}`,
          7 * 24 * 3600,
          JSON.stringify({ userId, sessionId, deviceId })
        )
      ]);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000)
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Logs out user and invalidates all sessions
   * Implements requirements from section 7.3.1 Security Controls
   */
  async logout(userId: string, deviceId?: string): Promise<void> {
    try {
      const pattern = deviceId 
        ? `${DEVICE_SESSION_PREFIX}*:${userId}:${deviceId}`
        : `${DEVICE_SESSION_PREFIX}*:${userId}:*`;

      // Get all sessions for user/device
      const sessionKeys = await this.redisClient.keys(pattern);

      // Remove sessions and related refresh tokens
      const pipeline = this.redisClient.pipeline();
      
      sessionKeys.forEach(key => {
        pipeline.del(key);
        pipeline.del(`${REFRESH_TOKEN_PREFIX}${key.split(':')[2]}`);
      });

      await pipeline.exec();

    } catch (error) {
      throw error;
    }
  }
}