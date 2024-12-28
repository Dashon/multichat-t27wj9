/**
 * JWT Utility Functions
 * Version: 1.0.0
 * 
 * Provides secure JWT token generation, verification, and management utilities
 * for the API Gateway service with comprehensive validation and error handling.
 * 
 * @packageDocumentation
 */

import jwt from 'jsonwebtoken'; // v9.0.0
import { UnauthorizedError } from 'http-errors'; // v2.0.0
import { TokenPayload, UserRole } from '../../user-service/src/interfaces/auth.interface';

// Environment and configuration constants with strict validation
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  throw new Error('JWT_SECRET environment variable must be defined');
})();

const ACCESS_TOKEN_EXPIRY = 3600; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 604800; // 7 days in seconds
const TOKEN_ALGORITHM = 'HS256' as const;
const MIN_TOKEN_LENGTH = 100;
const MAX_TOKEN_LENGTH = 1000;

/**
 * Validates the token payload structure and content
 * @param payload - The token payload to validate
 * @throws Error if payload validation fails
 */
const validatePayload = (payload: Partial<TokenPayload>): void => {
  if (!payload.userId || typeof payload.userId !== 'string') {
    throw new Error('Invalid userId in payload');
  }
  if (!payload.email || typeof payload.email !== 'string' || !payload.email.includes('@')) {
    throw new Error('Invalid email in payload');
  }
  if (!payload.role || !Object.values(UserRole).includes(payload.role)) {
    throw new Error('Invalid role in payload');
  }
};

/**
 * Sanitizes string input to prevent injection attacks
 * @param input - String to sanitize
 * @returns Sanitized string
 */
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>{}]/g, '').trim();
};

/**
 * Generates a secure JWT access token with comprehensive validation
 * @param payload - Token payload containing user information
 * @returns Signed JWT access token
 * @throws Error if payload validation fails
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  try {
    validatePayload(payload);
    
    const sanitizedPayload = {
      userId: sanitizeInput(payload.userId),
      email: sanitizeInput(payload.email),
      role: payload.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY
    };

    const token = jwt.sign(sanitizedPayload, JWT_SECRET, {
      algorithm: TOKEN_ALGORITHM,
      noTimestamp: false
    });

    if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
      throw new Error('Generated token length is invalid');
    }

    return token;
  } catch (error) {
    throw new Error(`Access token generation failed: ${error.message}`);
  }
};

/**
 * Generates a secure JWT refresh token with extended expiry
 * @param payload - Token payload containing user information
 * @returns Signed JWT refresh token
 * @throws Error if payload validation fails
 */
export const generateRefreshToken = (payload: TokenPayload): string => {
  try {
    validatePayload(payload);
    
    const sanitizedPayload = {
      userId: sanitizeInput(payload.userId),
      email: sanitizeInput(payload.email),
      role: payload.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_EXPIRY,
      tokenType: 'refresh'
    };

    const token = jwt.sign(sanitizedPayload, JWT_SECRET, {
      algorithm: TOKEN_ALGORITHM,
      noTimestamp: false
    });

    if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
      throw new Error('Generated token length is invalid');
    }

    return token;
  } catch (error) {
    throw new Error(`Refresh token generation failed: ${error.message}`);
  }
};

/**
 * Verifies and decodes a JWT access token
 * @param token - JWT token string to verify
 * @returns Decoded token payload
 * @throws UnauthorizedError if token validation fails
 */
export const verifyAccessToken = async (token: string): Promise<TokenPayload> => {
  try {
    if (!token || token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
      throw new UnauthorizedError('Invalid token format');
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [TOKEN_ALGORITHM]
    }) as TokenPayload;

    validatePayload(decoded);

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedError('Token has expired');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token signature');
    }
    throw new UnauthorizedError(error.message);
  }
};

/**
 * Verifies and decodes a JWT refresh token
 * @param token - JWT refresh token string to verify
 * @returns Decoded token payload
 * @throws UnauthorizedError if token validation fails
 */
export const verifyRefreshToken = async (token: string): Promise<TokenPayload> => {
  try {
    if (!token || token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
      throw new UnauthorizedError('Invalid refresh token format');
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [TOKEN_ALGORITHM]
    }) as TokenPayload & { tokenType?: string };

    validatePayload(decoded);

    if (decoded.tokenType !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token signature');
    }
    throw new UnauthorizedError(error.message);
  }
};

/**
 * Extracts and validates JWT token from Authorization header
 * @param authHeader - Authorization header string
 * @returns Validated token string or null if invalid
 */
export const extractTokenFromHeader = (authHeader: string): string | null => {
  try {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const bearerMatch = authHeader.match(/^Bearer\s+([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)$/);
    if (!bearerMatch) {
      return null;
    }

    const token = sanitizeInput(bearerMatch[1]);
    if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
      return null;
    }

    return token;
  } catch (error) {
    return null;
  }
};