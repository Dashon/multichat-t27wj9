/**
 * User Entity Model
 * Version: 1.0.0
 * 
 * Implements comprehensive user data structure with enhanced security features,
 * strict validation rules, and role-based access control using TypeORM.
 * Addresses requirements from sections 3.2.1 Schema Design and 7.2.2 Data Classification.
 */

import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn, 
  BeforeInsert, 
  BeforeUpdate, 
  Index 
} from 'typeorm'; // v0.3+

import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsObject,
  Matches,
  IsOptional,
  ValidateNested
} from 'class-validator'; // v0.14+

import { Exclude, Transform } from 'class-transformer'; // v0.5+
import { hash, compare } from 'bcrypt'; // v5.1+

import { User, UserSettings } from '../interfaces/user.interface';
import { UserRole } from '../interfaces/auth.interface';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
export class UserEntity implements User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  @Transform(({ value }) => value.toLowerCase())
  email: string;

  @Column({ type: 'varchar', length: 50 })
  @IsNotEmpty()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'Username can only contain letters, numbers, underscores and hyphens' })
  username: string;

  @Column({ type: 'varchar', length: 255 })
  @IsNotEmpty()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    { message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number and 1 special character' }
  )
  @Exclude({ toPlainOnly: true })
  password: string;

  @Column({ 
    type: 'enum', 
    enum: UserRole, 
    default: UserRole.USER 
  })
  @IsEnum(UserRole)
  role: UserRole;

  @Column({ type: 'jsonb', default: {
    theme: 'SYSTEM',
    notifications: true,
    language: 'en',
    timezone: 'UTC',
    fontScale: 1.0,
    highContrast: false
  }})
  @IsObject()
  @ValidateNested()
  settings: UserSettings;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  lastActive: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastPasswordChange: Date;

  @Column({ type: 'int', default: 0 })
  loginAttempts: number;

  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'int', default: 1 })
  securityLevel: number;

  /**
   * Lifecycle hook to hash password before insert/update
   * Uses bcrypt with configurable salt rounds for enhanced security
   */
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.password) {
      // Only hash if password is being set/updated
      const SALT_ROUNDS = 12;
      this.password = await hash(this.password, SALT_ROUNDS);
      this.lastPasswordChange = new Date();
      this.loginAttempts = 0;
    }
  }

  /**
   * Securely compare provided password with stored hash
   * Implements login attempt tracking and account locking
   */
  async comparePassword(password: string): Promise<boolean> {
    const MAX_LOGIN_ATTEMPTS = 5;
    
    // Increment login attempts
    this.loginAttempts += 1;

    // Check if account is locked
    if (this.isLocked) {
      throw new Error('Account is locked due to too many failed attempts');
    }

    // Compare passwords
    const isMatch = await compare(password, this.password);

    if (isMatch) {
      // Reset login attempts on successful login
      this.loginAttempts = 0;
      return true;
    }

    // Lock account if max attempts exceeded
    if (this.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      this.isLocked = true;
      throw new Error('Account locked due to too many failed attempts');
    }

    return false;
  }

  /**
   * Custom email validation with enhanced security rules
   */
  validateEmail(email: string): boolean {
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const MAX_EMAIL_LENGTH = 255;

    if (!email || email.length > MAX_EMAIL_LENGTH) {
      return false;
    }

    return EMAIL_REGEX.test(email);
  }

  /**
   * Update last active timestamp
   */
  updateLastActive(): void {
    this.lastActive = new Date();
  }
}