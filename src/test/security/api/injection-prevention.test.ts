/**
 * @fileoverview Comprehensive test suite for API Gateway security controls against injection attacks
 * Tests SQL injection, NoSQL injection, XSS, and command injection with enhanced monitoring
 * @version 1.0.0
 */

import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals'; // v29.5.0
import supertest from 'supertest'; // v6.3.3
import { 
  validateRequest, 
  validateQueryParams, 
  sanitizeInput, 
  detectSecurityPattern 
} from '../../../backend/api-gateway/src/middleware/validation.middleware';
import { 
  createTestUser, 
  waitForDatabaseSync, 
  setupSecurityMonitoring 
} from '../../utils/test-helpers';

// Test configuration constants
const TEST_TIMEOUT = 15000;

// Common injection patterns for testing
const INJECTION_PATTERNS = [
  "'; DROP TABLE users; --",
  "<script>alert('xss')</script>",
  "{ $ne: 1 }",
  "../../../etc/passwd",
  "'; WAITFOR DELAY '0:0:10'--",
  "<img src=x onerror=alert(1)>",
  "{ $where: function() { return true } }",
  "|ls -la"
];

// Security monitoring thresholds
const SECURITY_THRESHOLDS = {
  maxRequestRate: '100/minute',
  maxFailedAttempts: '5/minute',
  alertThreshold: '3',
  monitoringInterval: '60000'
};

describe('API Security - Injection Prevention Tests', () => {
  let app;
  let testUser;
  let securityMetrics;

  beforeEach(async () => {
    // Initialize test environment with enhanced security monitoring
    testUser = await createTestUser('USER', {
      securityLevel: 'high',
      monitoringEnabled: true
    });

    // Setup security monitoring and metrics collection
    securityMetrics = await setupSecurityMonitoring({
      thresholds: SECURITY_THRESHOLDS,
      alerting: true
    });

    // Ensure database is in sync before tests
    await waitForDatabaseSync({
      timeout: 5000,
      consistencyLevel: 'strong'
    });
  });

  afterEach(async () => {
    // Clean up test data and reset metrics
    await securityMetrics.reset();
    jest.clearAllMocks();
  });

  describe('SQL Injection Prevention', () => {
    test('should prevent SQL injection in login credentials', async () => {
      const loginAttempts = INJECTION_PATTERNS.map(pattern => ({
        username: `admin${pattern}`,
        password: `password${pattern}`
      }));

      for (const attempt of loginAttempts) {
        const response = await supertest(app)
          .post('/api/v1/auth/login')
          .send(attempt)
          .expect(400);

        expect(response.body).toMatchObject({
          status: 'error',
          code: 'SECURITY_VALIDATION_FAILED'
        });

        // Verify security metrics were updated
        expect(securityMetrics.getFailedAttempts()).toBeGreaterThan(0);
        expect(securityMetrics.getLastAlert()).toMatchObject({
          type: 'SQL_INJECTION_ATTEMPT',
          severity: 'high'
        });
      }
    });

    test('should prevent SQL injection in query parameters', async () => {
      const queryPatterns = INJECTION_PATTERNS.map(pattern => ({
        search: pattern,
        filter: `user_id = 1 ${pattern}`
      }));

      for (const query of queryPatterns) {
        const response = await supertest(app)
          .get('/api/v1/users/search')
          .query(query)
          .set('Authorization', `Bearer ${testUser.token}`)
          .expect(400);

        expect(response.body.code).toBe('QUERY_SECURITY_VALIDATION_FAILED');
        expect(securityMetrics.getSecurityPatternMatches()).toContain('SQL_INJECTION');
      }
    });
  });

  describe('XSS Prevention', () => {
    test('should prevent XSS in message content', async () => {
      const xssPayloads = INJECTION_PATTERNS.filter(pattern => 
        pattern.includes('<script>') || pattern.includes('onerror=')
      );

      for (const payload of xssPayloads) {
        const message = {
          chatId: 'test-chat',
          content: payload,
          metadata: {
            type: 'TEXT',
            formatting: {}
          }
        };

        const response = await supertest(app)
          .post('/api/v1/messages')
          .set('Authorization', `Bearer ${testUser.token}`)
          .send(message)
          .expect(400);

        expect(response.body.details.issues).toContain('Suspicious XSS pattern detected');
        expect(securityMetrics.getXSSAttempts()).toBeGreaterThan(0);
      }
    });

    test('should validate and sanitize HTML content', async () => {
      const htmlContent = '<p>Hello</p><script>alert(1)</script>';
      const sanitizedContent = await sanitizeInput({
        body: { content: htmlContent }
      });

      expect(sanitizedContent.body.content).toBe('<p>Hello</p>');
      expect(sanitizedContent.body.content).not.toContain('<script>');
    });
  });

  describe('NoSQL Injection Prevention', () => {
    test('should prevent NoSQL operator injection', async () => {
      const noSQLPatterns = INJECTION_PATTERNS.filter(pattern => 
        pattern.includes('$') || pattern.includes('function')
      );

      for (const pattern of noSQLPatterns) {
        const query = {
          filter: pattern,
          collection: 'users'
        };

        const response = await supertest(app)
          .get('/api/v1/data/query')
          .query(query)
          .set('Authorization', `Bearer ${testUser.token}`)
          .expect(400);

        expect(response.body.code).toBe('SECURITY_VALIDATION_FAILED');
        expect(securityMetrics.getNoSQLInjectionAttempts()).toBeGreaterThan(0);
      }
    });

    test('should validate MongoDB query structure', async () => {
      const invalidQuery = {
        $where: 'function() { return true }',
        $lookup: { from: 'users' }
      };

      const response = await supertest(app)
        .post('/api/v1/data/aggregate')
        .send(invalidQuery)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(400);

      expect(response.body.details.issues).toContain('Invalid query structure detected');
    });
  });

  describe('Command Injection Prevention', () => {
    test('should prevent command injection in file paths', async () => {
      const pathPatterns = INJECTION_PATTERNS.filter(pattern => 
        pattern.includes('/') || pattern.includes('|')
      );

      for (const pattern of pathPatterns) {
        const response = await supertest(app)
          .get(`/api/v1/files/${pattern}`)
          .set('Authorization', `Bearer ${testUser.token}`)
          .expect(400);

        expect(response.body.code).toBe('SECURITY_VALIDATION_FAILED');
        expect(securityMetrics.getCommandInjectionAttempts()).toBeGreaterThan(0);
      }
    });

    test('should validate file path traversal attempts', async () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\windows\\system32',
        '%2e%2e%2f%2e%2e%2f'
      ];

      for (const path of traversalPaths) {
        const response = await supertest(app)
          .get(`/api/v1/files/download`)
          .query({ path })
          .set('Authorization', `Bearer ${testUser.token}`)
          .expect(400);

        expect(response.body.details.issues).toContain('Path traversal attempt detected');
      }
    });
  });
});