/**
 * Authentication and Authorization Unit Tests
 * Version: 1.0.0
 * 
 * Comprehensive test suite for authentication middleware, authorization controls,
 * and JWT utilities in the API Gateway service.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'; // v29.0.0
import { Request, Response, NextFunction } from 'express'; // v4.18.0
import request from 'supertest'; // v6.3.0

import { authenticate, authorize } from '../../src/middleware/auth.middleware';
import { generateAccessToken, verifyAccessToken, extractTokenFromHeader } from '../../src/utils/jwt.utils';
import { TokenPayload, UserRole } from '../../../user-service/src/interfaces/auth.interface';
import { HttpError } from '../../src/middleware/error.middleware';

// Mock setup
const mockRequest = jest.fn().mockImplementation(() => ({
  headers: {},
  user: null,
  ip: '127.0.0.1',
  path: '/test'
}));

const mockResponse = jest.fn().mockImplementation(() => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
}));

const mockNext = jest.fn();

// Test data
const validUserPayload: TokenPayload = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: UserRole.USER,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  sessionId: '987fde65-43c2-1a2b-9876-543210987654'
};

describe('Authentication Middleware Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockClear();
    mockResponse.mockClear();
    mockNext.mockClear();
  });

  describe('authenticate middleware', () => {
    it('should allow access to public routes without token', async () => {
      const req = mockRequest();
      req.path = '/auth/login';
      
      await authenticate(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject requests without authorization header', async () => {
      const req = mockRequest();
      req.path = '/api/protected';
      
      await authenticate(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'No authentication token provided'
        })
      );
    });

    it('should reject malformed authorization headers', async () => {
      const req = mockRequest();
      req.path = '/api/protected';
      req.headers.authorization = 'Invalid Token Format';
      
      await authenticate(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'No authentication token provided'
        })
      );
    });

    it('should reject expired tokens', async () => {
      const expiredPayload = {
        ...validUserPayload,
        exp: Math.floor(Date.now() / 1000) - 3600
      };
      const expiredToken = await generateAccessToken(expiredPayload);
      
      const req = mockRequest();
      req.path = '/api/protected';
      req.headers.authorization = `Bearer ${expiredToken}`;
      
      await authenticate(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Token has expired'
        })
      );
    });

    it('should accept valid tokens and attach user context', async () => {
      const token = await generateAccessToken(validUserPayload);
      
      const req = mockRequest();
      req.path = '/api/protected';
      req.headers.authorization = `Bearer ${token}`;
      
      await authenticate(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
      expect(req.user).toEqual(expect.objectContaining({
        userId: validUserPayload.userId,
        email: validUserPayload.email,
        role: validUserPayload.role
      }));
    });

    it('should handle rate limiting correctly', async () => {
      const req = mockRequest();
      req.path = '/api/protected';
      
      // Simulate multiple rapid requests
      for (let i = 0; i < 6; i++) {
        await authenticate(req as Request, mockResponse() as Response, mockNext);
      }
      
      expect(mockNext).toHaveBeenLastCalledWith(
        expect.objectContaining({
          statusCode: 429,
          message: 'Too many authentication attempts'
        })
      );
    });
  });

  describe('authorize middleware', () => {
    it('should reject requests without user context', async () => {
      const req = mockRequest();
      const authMiddleware = authorize([UserRole.USER]);
      
      await authMiddleware(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'User role not found'
        })
      );
    });

    it('should allow access for users with correct role', async () => {
      const req = mockRequest();
      req.user = {
        ...validUserPayload,
        role: UserRole.ADMIN
      };
      
      const authMiddleware = authorize([UserRole.ADMIN]);
      await authMiddleware(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject access for insufficient permissions', async () => {
      const req = mockRequest();
      req.user = {
        ...validUserPayload,
        role: UserRole.USER
      };
      
      const authMiddleware = authorize([UserRole.ADMIN]);
      await authMiddleware(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'Insufficient permissions'
        })
      );
    });

    it('should handle multiple allowed roles correctly', async () => {
      const req = mockRequest();
      req.user = {
        ...validUserPayload,
        role: UserRole.MODERATOR
      };
      
      const authMiddleware = authorize([UserRole.ADMIN, UserRole.MODERATOR]);
      await authMiddleware(req as Request, mockResponse() as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('JWT utilities', () => {
    it('should generate valid access tokens', async () => {
      const token = await generateAccessToken(validUserPayload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should verify valid access tokens', async () => {
      const token = await generateAccessToken(validUserPayload);
      const decoded = await verifyAccessToken(token);
      
      expect(decoded).toEqual(expect.objectContaining({
        userId: validUserPayload.userId,
        email: validUserPayload.email,
        role: validUserPayload.role
      }));
    });

    it('should reject tokens with invalid signatures', async () => {
      const token = await generateAccessToken(validUserPayload);
      const tamperedToken = token.slice(0, -1) + 'X';
      
      await expect(verifyAccessToken(tamperedToken)).rejects.toThrow('Invalid token signature');
    });

    it('should extract tokens from valid authorization headers', () => {
      const token = 'valid.jwt.token';
      const header = `Bearer ${token}`;
      
      const extracted = extractTokenFromHeader(header);
      
      expect(extracted).toBe(token);
    });

    it('should handle malformed authorization headers', () => {
      const malformedHeaders = [
        'Bearer',
        'bearer token',
        'Basic auth',
        undefined
      ];
      
      malformedHeaders.forEach(header => {
        const extracted = extractTokenFromHeader(header);
        expect(extracted).toBeNull();
      });
    });
  });
});