/**
 * User Service Unit Tests
 * Version: 1.0.0
 * 
 * Comprehensive test suite for UserService validating user management functionality,
 * security features, and data handling with extensive mocking of repository layer.
 */

import { Test, TestingModule } from '@nestjs/testing'; // v10.0+
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'; // v10.0+
import { mock, MockType } from 'jest-mock'; // v29.0+

import { UserService } from '../../src/services/user.service';
import { UserRepository } from '../../src/repositories/user.repository';
import { User, CreateUserDto, UpdateUserDto, UserSettings, SecurityLevel } from '../../src/interfaces/user.interface';
import { UserRole } from '../../src/interfaces/auth.interface';

describe('UserService', () => {
  let userService: UserService;
  let userRepositoryMock: MockType<UserRepository>;

  // Test data constants
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockEmail = 'test@example.com';
  const mockUsername = 'testuser';
  const mockPassword = 'Test@123456';

  const mockUser: User = {
    id: mockUserId,
    email: mockEmail,
    username: mockUsername,
    password: 'hashedPassword',
    role: UserRole.USER,
    settings: {
      theme: 'SYSTEM',
      notifications: true,
      language: 'en',
      timezone: 'UTC',
      fontScale: 1.0,
      highContrast: false
    },
    createdAt: new Date(),
    lastActive: new Date(),
    securityLevel: SecurityLevel.INTERNAL,
    isVerified: false
  };

  beforeEach(async () => {
    // Create repository mock
    userRepositoryMock = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateSettings: jest.fn()
    };

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: userRepositoryMock
        }
      ]
    }).compile();

    userService = module.get<UserService>(UserService);
  });

  describe('createUser', () => {
    const createUserDto: CreateUserDto = {
      email: mockEmail,
      username: mockUsername,
      password: mockPassword
    };

    it('should create a new user with hashed password', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(null);
      userRepositoryMock.create.mockResolvedValue(mockUser);

      const result = await userService.createUser(createUserDto);

      expect(result).toBeDefined();
      expect(result.password).toBeUndefined(); // Password should be removed from response
      expect(userRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: mockEmail,
          username: mockUsername,
          role: UserRole.USER
        })
      );
    });

    it('should throw ConflictException for duplicate email', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(mockUser);

      await expect(userService.createUser(createUserDto))
        .rejects
        .toThrow(ConflictException);
    });

    it('should validate password strength', async () => {
      const weakPasswordDto = { ...createUserDto, password: 'weak' };

      await expect(userService.createUser(weakPasswordDto))
        .rejects
        .toThrow(ConflictException);
    });

    it('should create default user settings', async () => {
      userRepositoryMock.findByEmail.mockResolvedValue(null);
      userRepositoryMock.create.mockResolvedValue(mockUser);

      const result = await userService.createUser(createUserDto);

      expect(result.settings).toEqual(expect.objectContaining({
        theme: 'SYSTEM',
        notifications: true,
        language: 'en'
      }));
    });
  });

  describe('getUserById', () => {
    it('should return user without password field', async () => {
      userRepositoryMock.findById.mockResolvedValue(mockUser);

      const result = await userService.getUserById(mockUserId);

      expect(result).toBeDefined();
      expect(result.password).toBeUndefined();
      expect(result.id).toBe(mockUserId);
    });

    it('should throw NotFoundException for invalid ID', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);

      await expect(userService.getUserById('invalid-id'))
        .rejects
        .toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    const updateUserDto: UpdateUserDto = {
      username: 'newusername',
      settings: {
        theme: 'DARK',
        notifications: false
      }
    };

    it('should update allowed user fields', async () => {
      userRepositoryMock.findById.mockResolvedValue(mockUser);
      userRepositoryMock.update.mockResolvedValue({
        ...mockUser,
        ...updateUserDto
      });

      const result = await userService.updateUser(mockUserId, updateUserDto);

      expect(result.username).toBe(updateUserDto.username);
      expect(result.settings.theme).toBe(updateUserDto.settings.theme);
    });

    it('should throw NotFoundException for invalid user', async () => {
      userRepositoryMock.findById.mockResolvedValue(null);

      await expect(userService.updateUser(mockUserId, updateUserDto))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should validate username format', async () => {
      const invalidUsernameDto = { ...updateUserDto, username: '@invalid!' };

      await expect(userService.updateUser(mockUserId, invalidUsernameDto))
        .rejects
        .toThrow(ConflictException);
    });
  });

  describe('upgradeUserToPremium', () => {
    it('should upgrade user role to PREMIUM_USER', async () => {
      userRepositoryMock.findById.mockResolvedValue(mockUser);
      userRepositoryMock.update.mockResolvedValue({
        ...mockUser,
        role: UserRole.PREMIUM_USER
      });

      const result = await userService.upgradeUserToPremium(mockUserId);

      expect(result.role).toBe(UserRole.PREMIUM_USER);
      expect(result.securityLevel).toBe(SecurityLevel.CONFIDENTIAL);
    });

    it('should throw UnauthorizedException if already premium', async () => {
      userRepositoryMock.findById.mockResolvedValue({
        ...mockUser,
        role: UserRole.PREMIUM_USER
      });

      await expect(userService.upgradeUserToPremium(mockUserId))
        .rejects
        .toThrow(ConflictException);
    });
  });

  describe('updateUserSettings', () => {
    const newSettings: Partial<UserSettings> = {
      theme: 'DARK',
      fontScale: 1.2,
      notifications: false
    };

    it('should merge with existing settings', async () => {
      userRepositoryMock.findById.mockResolvedValue(mockUser);
      userRepositoryMock.update.mockResolvedValue({
        ...mockUser,
        settings: {
          ...mockUser.settings,
          ...newSettings
        }
      });

      const result = await userService.updateUserSettings(mockUserId, newSettings);

      expect(result.settings).toEqual(expect.objectContaining(newSettings));
      expect(result.settings.language).toBe(mockUser.settings.language);
    });

    it('should validate settings schema', async () => {
      const invalidSettings = {
        ...newSettings,
        fontScale: 2.0 // Invalid value
      };

      await expect(userService.updateUserSettings(mockUserId, invalidSettings))
        .rejects
        .toThrow(ConflictException);
    });
  });
});