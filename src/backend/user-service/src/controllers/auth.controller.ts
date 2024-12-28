/**
 * Authentication Controller
 * Version: 1.0.0
 * 
 * Implements secure REST endpoints for user authentication with enhanced security features
 * including device tracking, rate limiting, and comprehensive token management.
 * Addresses requirements from sections 7.1 and 7.3 of technical specifications.
 */

import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  Req, 
  Res, 
  HttpStatus, 
  UseInterceptors,
  UnauthorizedException,
  BadRequestException
} from '@nestjs/common'; // v10.0.0
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiSecurity 
} from '@nestjs/swagger'; // v7.0.0
import { Request, Response } from 'express'; // v4.18.0
import { RateLimit } from '@nestjs/throttler'; // v5.0.0

import { AuthService } from '../services/auth.service';
import { 
  LoginCredentials, 
  AuthTokens, 
  RefreshTokenRequest, 
  DeviceInfo 
} from '../interfaces/auth.interface';
import { AuditLogInterceptor } from '../interceptors/audit-log.interceptor';

@Controller('auth')
@ApiTags('Authentication')
@UseInterceptors(AuditLogInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Secure user login endpoint with device tracking and rate limiting
   * Implements requirements from section 7.1.1 Authentication Flow
   */
  @Post('login')
  @RateLimit({ points: 5, duration: 60 })
  @ApiOperation({ summary: 'Authenticate user and generate secure tokens' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Login successful',
    type: AuthTokens 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Invalid credentials' 
  })
  @ApiResponse({ 
    status: HttpStatus.TOO_MANY_REQUESTS, 
    description: 'Rate limit exceeded' 
  })
  async login(
    @Body() credentials: LoginCredentials,
    @Req() req: Request
  ): Promise<AuthTokens> {
    try {
      // Extract device information from request
      const deviceInfo: DeviceInfo = {
        deviceId: req.headers['x-device-id'] as string || 'unknown',
        deviceType: req.headers['x-device-type'] as string || 'web',
        userAgent: req.headers['user-agent'] || 'unknown'
      };

      // Validate required fields
      if (!credentials.email || !credentials.password) {
        throw new BadRequestException('Email and password are required');
      }

      // Attempt login with enhanced security
      const tokens = await this.authService.login(
        credentials,
        deviceInfo
      );

      return tokens;

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  /**
   * Secure token refresh endpoint with device validation
   * Implements requirements from section 7.1.3 Token Management
   */
  @Post('refresh')
  @RateLimit({ points: 10, duration: 60 })
  @ApiOperation({ summary: 'Refresh authentication tokens' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Tokens refreshed successfully',
    type: AuthTokens 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Invalid refresh token' 
  })
  @ApiResponse({ 
    status: HttpStatus.FORBIDDEN, 
    description: 'Device mismatch' 
  })
  async refreshToken(
    @Body() refreshTokenRequest: RefreshTokenRequest,
    @Req() req: Request
  ): Promise<AuthTokens> {
    try {
      // Extract device information
      const deviceInfo: DeviceInfo = {
        deviceId: req.headers['x-device-id'] as string || 'unknown',
        deviceType: req.headers['x-device-type'] as string || 'web',
        userAgent: req.headers['user-agent'] || 'unknown'
      };

      // Validate refresh token request
      if (!refreshTokenRequest.refreshToken) {
        throw new BadRequestException('Refresh token is required');
      }

      // Add device info to request
      refreshTokenRequest.deviceInfo = deviceInfo;

      // Attempt token refresh with security validation
      const tokens = await this.authService.refreshToken(refreshTokenRequest);

      return tokens;

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Secure logout endpoint with complete session termination
   * Implements requirements from section 7.3.1 Security Controls
   */
  @Post('logout')
  @ApiOperation({ summary: 'Securely terminate user session' })
  @ApiSecurity('bearer')
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Logout successful' 
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Invalid token' 
  })
  async logout(
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.['id'];
      const deviceId = req.headers['x-device-id'] as string;

      if (!userId) {
        throw new UnauthorizedException('Invalid session');
      }

      // Terminate session and invalidate tokens
      await this.authService.logout(userId, deviceId);

      // Clear secure cookies if used
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
      });

      res.status(HttpStatus.OK).send();

    } catch (error) {
      throw new UnauthorizedException('Logout failed');
    }
  }
}