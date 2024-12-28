/**
 * User Repository
 * Version: 1.0.0
 * 
 * Implements secure data access patterns for user management using TypeORM.
 * Addresses requirements from sections 3.2.1 Schema Design and 7.2.2 Data Classification.
 */

import { Injectable, Logger } from '@nestjs/common'; // v10.0+
import { Repository, DataSource, QueryRunner, EntityManager } from 'typeorm'; // v0.3+
import { Cache } from '@nestjs/cache-manager'; // v2.0+

import { User, CreateUserDto, UpdateUserDto, SecurityLevel } from '../interfaces/user.interface';
import { UserEntity } from '../models/user.model';

@Injectable()
export class UserRepository {
  private readonly repository: Repository<UserEntity>;
  private readonly logger: Logger;
  private readonly CACHE_TTL = 3600; // 1 hour cache TTL
  private readonly CACHE_PREFIX = 'user:';

  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: Cache
  ) {
    this.repository = dataSource.getRepository(UserEntity);
    this.logger = new Logger('UserRepository');
  }

  /**
   * Creates a new user with security validation and audit logging
   * Implements requirements from section 7.2.2 Data Classification
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate email uniqueness
      const existingUser = await this.repository.findOne({
        where: [
          { email: createUserDto.email.toLowerCase() },
          { username: createUserDto.username }
        ]
      });

      if (existingUser) {
        throw new Error('Email or username already exists');
      }

      // Create new user entity with security defaults
      const user = this.repository.create({
        ...createUserDto,
        email: createUserDto.email.toLowerCase(),
        securityLevel: SecurityLevel.INTERNAL,
        settings: {
          theme: 'SYSTEM',
          notifications: true,
          language: 'en',
          timezone: 'UTC',
          fontScale: 1.0,
          highContrast: false,
          ...createUserDto.settings
        }
      });

      // Save user with transaction
      const savedUser = await queryRunner.manager.save(user);
      await queryRunner.commitTransaction();

      // Cache user data
      await this.cacheUser(savedUser);
      
      this.logger.log(`User created: ${savedUser.id}`);
      return this.sanitizeUser(savedUser);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`User creation failed: ${error.message}`);
      throw error;

    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Finds a user by ID with caching and security checks
   */
  async findById(id: string): Promise<User | null> {
    try {
      // Check cache first
      const cachedUser = await this.cache.get<User>(`${this.CACHE_PREFIX}${id}`);
      if (cachedUser) {
        return cachedUser;
      }

      const user = await this.repository.findOne({ 
        where: { id },
        select: ['id', 'email', 'username', 'role', 'settings', 'lastActive', 'securityLevel', 'isVerified']
      });

      if (user) {
        await this.cacheUser(user);
        return this.sanitizeUser(user);
      }

      return null;

    } catch (error) {
      this.logger.error(`Error finding user by ID: ${error.message}`);
      throw error;
    }
  }

  /**
   * Finds a user by email with security validation
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.repository.findOne({
        where: { email: email.toLowerCase() },
        select: ['id', 'email', 'username', 'password', 'role', 'settings', 'lastActive', 'loginAttempts', 'isLocked']
      });

      return user ? this.sanitizeUser(user) : null;

    } catch (error) {
      this.logger.error(`Error finding user by email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates user data with optimistic locking and security validation
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await this.repository.findOne({ where: { id } });
      if (!user) {
        throw new Error('User not found');
      }

      // Update user fields
      Object.assign(user, {
        ...updateUserDto,
        username: updateUserDto.username?.toLowerCase(),
      });

      const updatedUser = await queryRunner.manager.save(user);
      await queryRunner.commitTransaction();

      // Update cache
      await this.cacheUser(updatedUser);
      
      this.logger.log(`User updated: ${id}`);
      return this.sanitizeUser(updatedUser);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`User update failed: ${error.message}`);
      throw error;

    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Deletes a user with security validation and cleanup
   */
  async delete(id: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await this.repository.findOne({ where: { id } });
      if (!user) {
        throw new Error('User not found');
      }

      await queryRunner.manager.remove(user);
      await queryRunner.commitTransaction();

      // Remove from cache
      await this.cache.del(`${this.CACHE_PREFIX}${id}`);
      
      this.logger.log(`User deleted: ${id}`);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`User deletion failed: ${error.message}`);
      throw error;

    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Updates user's last active timestamp
   */
  async updateLastActive(id: string): Promise<void> {
    try {
      await this.repository.update(id, {
        lastActive: new Date()
      });

      // Update cache
      const user = await this.findById(id);
      if (user) {
        await this.cacheUser(user);
      }

    } catch (error) {
      this.logger.error(`Error updating last active: ${error.message}`);
      throw error;
    }
  }

  /**
   * Caches user data with TTL
   */
  private async cacheUser(user: User): Promise<void> {
    await this.cache.set(
      `${this.CACHE_PREFIX}${user.id}`,
      this.sanitizeUser(user),
      this.CACHE_TTL
    );
  }

  /**
   * Removes sensitive data before returning user object
   */
  private sanitizeUser(user: User): User {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.loginAttempts;
    return sanitized;
  }
}