/**
 * Integration Tests for User Management
 * Version: 1.0.0
 * 
 * Comprehensive test suite for user management functionality including
 * user creation, updates, role management, and security validation.
 * Implements requirements from sections 2.2.1, 7.1.2, and 7.2.2.
 */

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals'; // v29.x
import supertest from 'supertest'; // v6.x

import { 
  User, 
  CreateUserDto, 
  UpdateUserDto, 
  UserSettings, 
  SecurityLevel 
} from '../../../backend/user-service/src/interfaces/user.interface';
import { UserRole } from '../../../backend/user-service/src/interfaces/auth.interface';
import { UserService } from '../../../backend/user-service/src/services/user.service';
import { 
  createTestUser, 
  waitForDatabaseSync, 
  generateMockAuditLog, 
  validateDataEncryption 
} from '../../utils/test-helpers';

// Test timeouts
const TEST_TIMEOUT = 30000;
const SECURITY_VALIDATION_TIMEOUT = 5000;

describe('User Management Integration Tests', () => {
  let userService: UserService;
  let testUsers: User[] = [];

  beforeEach(async () => {
    // Initialize test environment with security context
    userService = new UserService();
    await waitForDatabaseSync();

    // Create test users with different roles
    testUsers = await Promise.all([
      createTestUser(UserRole.USER),
      createTestUser(UserRole.PREMIUM_USER),
      createTestUser(UserRole.ADMIN)
    ]);
  });

  afterEach(async () => {
    // Clean up test data and verify secure deletion
    for (const user of testUsers) {
      await userService.deleteUser(user.id);
    }
    await waitForDatabaseSync();
  });

  describe('User Creation', () => {
    it('should create a new user with valid data and verify encryption', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'Test@123456',
        settings: {
          theme: 'SYSTEM',
          notifications: true,
          language: 'en',
          timezone: 'UTC',
          fontScale: 1.0,
          highContrast: false
        }
      };

      const createdUser = await userService.createUser(createUserDto);

      expect(createdUser).toBeDefined();
      expect(createdUser.email).toBe(createUserDto.email);
      expect(createdUser.username).toBe(createUserDto.username);
      expect(createdUser.role).toBe(UserRole.USER);

      // Verify data encryption
      const isEncrypted = await validateDataEncryption(createdUser);
      expect(isEncrypted).toBe(true);
    }, TEST_TIMEOUT);

    it('should reject duplicate email addresses with proper error handling', async () => {
      const existingUser = testUsers[0];
      const duplicateUserDto: CreateUserDto = {
        email: existingUser.email,
        username: 'uniqueusername',
        password: 'Test@123456'
      };

      await expect(userService.createUser(duplicateUserDto))
        .rejects
        .toThrow('Email already registered');
    });

    it('should enforce password complexity requirements', async () => {
      const weakPasswordDto: CreateUserDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'weak'
      };

      await expect(userService.createUser(weakPasswordDto))
        .rejects
        .toThrow('Password does not meet security requirements');
    });
  });

  describe('User Updates', () => {
    it('should update user settings with proper validation', async () => {
      const user = testUsers[0];
      const updateDto: UpdateUserDto = {
        settings: {
          theme: 'DARK',
          fontScale: 1.2,
          highContrast: true
        }
      };

      const updatedUser = await userService.updateUser(user.id, updateDto);

      expect(updatedUser.settings.theme).toBe('DARK');
      expect(updatedUser.settings.fontScale).toBe(1.2);
      expect(updatedUser.settings.highContrast).toBe(true);
    });

    it('should prevent unauthorized email updates', async () => {
      const user = testUsers[0];
      const updateDto: UpdateUserDto = {
        username: 'newusername',
        // @ts-expect-error - Testing invalid update
        email: 'newemail@example.com'
      };

      await expect(userService.updateUser(user.id, updateDto))
        .rejects
        .toThrow();
    });

    it('should validate setting changes against security policies', async () => {
      const user = testUsers[0];
      const invalidSettingsDto: UpdateUserDto = {
        settings: {
          fontScale: 2.0 // Invalid value
        }
      };

      await expect(userService.updateUser(user.id, invalidSettingsDto))
        .rejects
        .toThrow('Invalid font scale value');
    });
  });

  describe('Role Management', () => {
    it('should upgrade user to premium with proper validation', async () => {
      const regularUser = testUsers[0];
      const upgradedUser = await userService.upgradeUserToPremium(regularUser.id);

      expect(upgradedUser.role).toBe(UserRole.PREMIUM_USER);
      expect(upgradedUser.securityLevel).toBe(SecurityLevel.CONFIDENTIAL);
    });

    it('should prevent unauthorized role changes', async () => {
      const regularUser = testUsers[0];
      const updateDto: UpdateUserDto = {
        // @ts-expect-error - Testing invalid update
        role: UserRole.ADMIN
      };

      await expect(userService.updateUser(regularUser.id, updateDto))
        .rejects
        .toThrow();
    });

    it('should enforce role-based permissions hierarchy', async () => {
      const premiumUser = testUsers[1];
      
      // Attempt to upgrade already premium user
      await expect(userService.upgradeUserToPremium(premiumUser.id))
        .rejects
        .toThrow('User is not eligible for premium upgrade');
    });
  });

  describe('User Deletion', () => {
    it('should delete user and associated data securely', async () => {
      const userToDelete = testUsers[0];
      await userService.deleteUser(userToDelete.id);

      // Verify user is deleted
      await expect(userService.findUserById(userToDelete.id))
        .resolves
        .toBeNull();
    });

    it('should prevent unauthorized deletions', async () => {
      const adminUser = testUsers[2];
      const regularUser = testUsers[0];

      // Mock unauthorized deletion attempt
      await expect(userService.deleteUser(adminUser.id, regularUser.id))
        .rejects
        .toThrow('Unauthorized deletion attempt');
    });

    it('should verify complete data removal', async () => {
      const userToDelete = testUsers[0];
      await userService.deleteUser(userToDelete.id);

      // Verify all associated data is removed
      const userExists = await userService.checkUserDataExists(userToDelete.id);
      expect(userExists).toBe(false);
    });
  });
});