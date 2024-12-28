/**
 * End-to-end tests for user profile management functionality
 * Version: 1.0.0
 * 
 * Tests comprehensive user profile management including:
 * - Profile updates with security validation
 * - Settings synchronization across devices
 * - Role-based access control
 * - Data validation and security measures
 */

import { describe, beforeAll, afterAll, it, expect } from '@jest/globals'; // ^29.0.0
import supertest from 'supertest'; // ^6.0.0
import { createTestUser, waitForWebSocketEvent } from '../../utils/test-helpers';
import { setupTestEnvironment } from '../../utils/test-setup';
import { User, SecurityLevel, UserSettings, isValidUserSettings } from '../../../backend/user-service/src/interfaces/user.interface';
import { UserRole, DeviceInfo } from '../../../backend/user-service/src/interfaces/auth.interface';

// Constants for test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000;
const WEBSOCKET_TIMEOUT = 5000;

// Initialize API client
const request = supertest(API_BASE_URL);

// Test device configurations
const testDevices: DeviceInfo[] = [
  {
    deviceId: 'test-device-1',
    deviceType: 'desktop',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124'
  },
  {
    deviceId: 'test-device-2',
    deviceType: 'mobile',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
  }
];

describe('User Profile Management E2E Tests', () => {
  let testUser: User;
  let adminUser: User;
  let authToken: string;

  beforeAll(async () => {
    // Initialize test environment with security and device tracking
    await setupTestEnvironment({
      securityChecks: true,
      performanceMonitoring: true,
      databases: {
        mongo: true,
        redis: true
      }
    });

    // Create test users with different roles
    testUser = await createTestUser(UserRole.USER, {
      theme: 'LIGHT',
      notifications: true,
      language: 'en',
      timezone: 'UTC',
      fontScale: 1.0,
      highContrast: false
    });

    adminUser = await createTestUser(UserRole.ADMIN);

    // Get auth token for test user
    const loginResponse = await request
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'testPassword123',
        deviceInfo: testDevices[0]
      });

    authToken = loginResponse.body.accessToken;
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test data and close connections
    await request
      .delete(`/api/v1/users/${testUser.id}`)
      .set('Authorization', `Bearer ${authToken}`);
  });

  describe('Profile Update Tests', () => {
    it('should successfully update user profile with valid data', async () => {
      const updatedProfile = {
        username: 'newTestUsername',
        settings: {
          theme: 'DARK',
          notifications: false,
          language: 'es',
          timezone: 'America/New_York',
          fontScale: 1.2,
          highContrast: true
        }
      };

      const response = await request
        .put(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedProfile);

      expect(response.status).toBe(200);
      expect(response.body.username).toBe(updatedProfile.username);
      expect(isValidUserSettings(response.body.settings)).toBe(true);
      expect(response.body.settings).toMatchObject(updatedProfile.settings);
    });

    it('should reject profile update with invalid security level', async () => {
      const invalidUpdate = {
        securityLevel: SecurityLevel.CRITICAL // Attempting to escalate security level
      };

      const response = await request
        .put(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdate);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('security level');
    });

    it('should validate username format and uniqueness', async () => {
      const invalidUsername = {
        username: '!invalid@username'
      };

      const response = await request
        .put(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUsername);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('username format');
    });
  });

  describe('Settings Synchronization Tests', () => {
    it('should synchronize settings across multiple devices', async () => {
      const newSettings: UserSettings = {
        theme: 'DARK',
        notifications: true,
        language: 'en',
        timezone: 'UTC',
        fontScale: 1.1,
        highContrast: true
      };

      // Update settings from first device
      await request
        .put(`/api/v1/users/${testUser.id}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Device-Id', testDevices[0].deviceId)
        .send(newSettings);

      // Wait for settings sync event
      const syncEvent = await waitForWebSocketEvent('settings-sync', WEBSOCKET_TIMEOUT);

      expect(syncEvent.type).toBe('settings-update');
      expect(syncEvent.payload.settings).toMatchObject(newSettings);
    });

    it('should handle settings conflict resolution', async () => {
      const device1Settings = { theme: 'LIGHT' };
      const device2Settings = { theme: 'DARK' };

      // Update from device 1
      await request
        .put(`/api/v1/users/${testUser.id}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Device-Id', testDevices[0].deviceId)
        .send(device1Settings);

      // Update from device 2
      await request
        .put(`/api/v1/users/${testUser.id}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Device-Id', testDevices[1].deviceId)
        .send(device2Settings);

      // Get final settings state
      const response = await request
        .get(`/api/v1/users/${testUser.id}/settings`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.settings.theme).toBe('DARK'); // Last write wins
    });
  });

  describe('Security Validation Tests', () => {
    it('should enforce role-based access control', async () => {
      const adminOnlyUpdate = {
        securityLevel: SecurityLevel.SENSITIVE
      };

      const response = await request
        .put(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(adminOnlyUpdate);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('insufficient permissions');
    });

    it('should validate device authentication', async () => {
      const response = await request
        .put(`/api/v1/users/${testUser.id}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Device-Id', 'unknown-device-id')
        .send({ theme: 'LIGHT' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('device not authorized');
    });

    it('should track and log security-sensitive changes', async () => {
      const securityUpdate = {
        email: 'newemail@test.com' // Security-sensitive field
      };

      const response = await request
        .put(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(securityUpdate);

      expect(response.status).toBe(200);
      expect(response.headers['x-audit-log']).toBeTruthy();
    });
  });
});