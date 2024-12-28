/**
 * User Controller Implementation
 * Version: 1.0.0
 * 
 * Implements secure REST endpoints for user management operations with comprehensive
 * validation, authorization, and audit logging. Addresses requirements from sections
 * 2.2.1, 7.1.2, and 7.2.2 of technical specifications.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  UseInterceptors,
  Logger,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  HttpStatus,
  ValidationPipe
} from '@nestjs/common'; // v10.0+

import { User, CreateUserDto, UpdateUserDto, UserSettings } from '../interfaces/user.interface';
import { UserService } from '../services/user.service';
import { authenticateToken, authorizeRoles } from '../middleware/auth.middleware';
import { UserRole } from '../interfaces/auth.interface';
import { ResponseFilterInterceptor } from '../interceptors/response-filter.interceptor';
import { RateLimit } from '../decorators/rate-limit.decorator';
import { ValidateInput } from '../decorators/validate-input.decorator';
import { AuditLog } from '../decorators/audit-log.decorator';

@Controller('users')
@UseInterceptors(ResponseFilterInterceptor)
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  /**
   * Creates a new user account with validation
   * Requires admin privileges as per section 7.1.2
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(authenticateToken, authorizeRoles([UserRole.ADMIN]))
  @ValidateInput('createUserSchema')
  @RateLimit({ windowMs: 60000, maxRequests: 5 })
  @AuditLog('User creation')
  async createUser(@Body() createUserDto: CreateUserDto): Promise<User> {
    try {
      this.logger.log(`Creating new user: ${createUserDto.email}`);
      return await this.userService.createUser(createUserDto);
    } catch (error) {
      this.logger.error(`User creation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieves user by ID with security validation
   * Implements role-based access control from section 7.1.2
   */
  @Get(':id')
  @UseGuards(authenticateToken)
  @RateLimit({ windowMs: 60000, maxRequests: 100 })
  @AuditLog('User retrieval')
  async getUserById(@Param('id') id: string): Promise<User> {
    try {
      const user = await this.userService.getUserById(id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates user data with comprehensive validation
   * Implements security requirements from section 7.2.2
   */
  @Put(':id')
  @UseGuards(authenticateToken)
  @ValidateInput('updateUserSchema')
  @RateLimit({ windowMs: 60000, maxRequests: 20 })
  @AuditLog('User update')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<User> {
    try {
      const user = await this.userService.updateUser(id, updateUserDto);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error) {
      this.logger.error(`User update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletes user account with security validation
   * Requires admin privileges as per section 7.1.2
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(authenticateToken, authorizeRoles([UserRole.ADMIN]))
  @RateLimit({ windowMs: 60000, maxRequests: 10 })
  @AuditLog('User deletion')
  async deleteUser(@Param('id') id: string): Promise<void> {
    try {
      await this.userService.deleteUser(id);
    } catch (error) {
      this.logger.error(`User deletion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upgrades user to premium status
   * Implements role-based access control from section 7.1.2
   */
  @Put(':id/upgrade')
  @UseGuards(authenticateToken, authorizeRoles([UserRole.ADMIN]))
  @RateLimit({ windowMs: 60000, maxRequests: 10 })
  @AuditLog('User upgrade')
  async upgradeUserToPremium(@Param('id') id: string): Promise<User> {
    try {
      return await this.userService.upgradeUserToPremium(id);
    } catch (error) {
      this.logger.error(`User upgrade failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates user settings with validation
   * Implements security requirements from section 7.2.2
   */
  @Put(':id/settings')
  @UseGuards(authenticateToken)
  @ValidateInput('userSettingsSchema')
  @RateLimit({ windowMs: 60000, maxRequests: 20 })
  @AuditLog('Settings update')
  async updateUserSettings(
    @Param('id') id: string,
    @Body() settings: Partial<UserSettings>
  ): Promise<User> {
    try {
      const user = await this.userService.updateUserSettings(id, settings);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return user;
    } catch (error) {
      this.logger.error(`Settings update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates user access token
   * Implements security requirements from section 7.1
   */
  @Get('validate/token')
  @UseGuards(authenticateToken)
  @RateLimit({ windowMs: 60000, maxRequests: 100 })
  async validateToken(): Promise<{ valid: boolean }> {
    return { valid: true };
  }
}