/**
 * User Service Implementation
 * Version: 1.0.0
 * 
 * Implements secure user management operations with enhanced security features,
 * role-based access control, and comprehensive user profile management.
 * Addresses requirements from sections 2.2.1, 7.1.2, and 7.2.2.
 */

import { Injectable, UnauthorizedException, NotFoundException, ConflictException, Logger } from '@nestjs/common'; // v10.0+
import { hash, compare } from 'bcrypt'; // v5.1+

import { User, CreateUserDto, UpdateUserDto, UserSettings, SecurityLevel } from '../interfaces/user.interface';
import { UserRepository } from '../repositories/user.repository';
import { UserRole } from '../interfaces/auth.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger('UserService');
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly PASSWORD_SALT_ROUNDS = 12;
  private readonly EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  constructor(
    private readonly userRepository: UserRepository
  ) {}

  /**
   * Creates a new user with enhanced security validation
   * Implements data classification requirements from section 7.2.2
   */
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    try {
      // Validate email format
      if (!this.EMAIL_REGEX.test(createUserDto.email)) {
        throw new ConflictException('Invalid email format');
      }

      // Check for existing user
      const existingUser = await this.userRepository.findByEmail(createUserDto.email);
      if (existingUser) {
        throw new ConflictException('Email already registered');
      }

      // Validate password complexity
      if (!this.validatePasswordComplexity(createUserDto.password)) {
        throw new ConflictException('Password does not meet security requirements');
      }

      // Hash password
      const hashedPassword = await hash(createUserDto.password, this.PASSWORD_SALT_ROUNDS);

      // Prepare user data with security defaults
      const userData = {
        ...createUserDto,
        password: hashedPassword,
        role: UserRole.USER,
        securityLevel: SecurityLevel.INTERNAL,
        settings: this.getDefaultUserSettings(createUserDto.settings),
        isVerified: false,
        lastActive: new Date(),
        loginAttempts: 0
      };

      // Create user
      const user = await this.userRepository.create(userData);
      
      this.logger.log(`User created successfully: ${user.id}`);
      return this.sanitizeUserData(user);

    } catch (error) {
      this.logger.error(`User creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates user data with security validation and role-based access control
   * Implements authorization matrix from section 7.1.2
   */
  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      // Verify user exists
      const existingUser = await this.userRepository.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      // Validate username if provided
      if (updateUserDto.username) {
        await this.validateUsername(updateUserDto.username, id);
      }

      // Validate settings if provided
      if (updateUserDto.settings) {
        this.validateUserSettings(updateUserDto.settings);
      }

      // Update user
      const updatedUser = await this.userRepository.update(id, updateUserDto);
      
      this.logger.log(`User updated successfully: ${id}`);
      return this.sanitizeUserData(updatedUser);

    } catch (error) {
      this.logger.error(`User update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upgrades user to premium role with security validation
   * Implements role-based access control from section 7.1.2
   */
  async upgradeUserToPremium(id: string): Promise<User> {
    try {
      const user = await this.userRepository.findById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.role !== UserRole.USER) {
        throw new ConflictException('User is not eligible for premium upgrade');
      }

      const updatedUser = await this.userRepository.update(id, {
        role: UserRole.PREMIUM_USER,
        securityLevel: SecurityLevel.CONFIDENTIAL
      });

      this.logger.log(`User upgraded to premium: ${id}`);
      return this.sanitizeUserData(updatedUser);

    } catch (error) {
      this.logger.error(`Premium upgrade failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates password complexity requirements
   * Implements security requirements from section 7.2.2
   */
  private validatePasswordComplexity(password: string): boolean {
    const passwordRules = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRules.test(password);
  }

  /**
   * Validates username format and uniqueness
   */
  private async validateUsername(username: string, userId: string): Promise<void> {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
    if (!usernameRegex.test(username)) {
      throw new ConflictException('Invalid username format');
    }

    const existingUser = await this.userRepository.findByUsername(username);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Username already taken');
    }
  }

  /**
   * Validates user settings
   */
  private validateUserSettings(settings: Partial<UserSettings>): void {
    if (settings.fontScale && (settings.fontScale < 0.8 || settings.fontScale > 1.5)) {
      throw new ConflictException('Invalid font scale value');
    }

    if (settings.theme && !['LIGHT', 'DARK', 'SYSTEM'].includes(settings.theme)) {
      throw new ConflictException('Invalid theme selection');
    }
  }

  /**
   * Returns default user settings merged with provided settings
   */
  private getDefaultUserSettings(settings?: Partial<UserSettings>): UserSettings {
    return {
      theme: 'SYSTEM',
      notifications: true,
      language: 'en',
      timezone: 'UTC',
      fontScale: 1.0,
      highContrast: false,
      ...settings
    };
  }

  /**
   * Removes sensitive data from user object
   */
  private sanitizeUserData(user: User): User {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.loginAttempts;
    delete sanitized.securityLevel;
    return sanitized;
  }
}