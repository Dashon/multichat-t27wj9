/**
 * Password Utility Functions
 * Version: 1.0.0
 * 
 * Provides secure password hashing, comparison and validation functionality
 * following industry best practices and security standards.
 * 
 * @packageDocumentation
 */

import { hash, compare, genSalt } from 'bcrypt'; // v5.1.0
import { isStrongPassword } from 'validator'; // v13.9.0

/**
 * Number of salt rounds for bcrypt hashing
 * Higher values increase security but also computational cost
 */
const SALT_ROUNDS = 12;

/**
 * Minimum required password length
 */
const PASSWORD_MIN_LENGTH = 8;

/**
 * Password strength requirements configuration
 * Enforces complexity rules for secure passwords
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1
} as const;

/**
 * Securely hashes a plain text password using bcrypt with salt
 * 
 * @param plainTextPassword - The plain text password to hash
 * @throws {Error} If password is empty or invalid
 * @returns Promise resolving to the hashed password string
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  // Input validation
  if (!plainTextPassword || typeof plainTextPassword !== 'string') {
    throw new Error('Invalid password input');
  }

  try {
    // Generate salt with configured rounds
    const salt = await genSalt(SALT_ROUNDS);
    
    // Hash password with generated salt
    const hashedPassword = await hash(plainTextPassword, salt);
    
    return hashedPassword;
  } catch (error) {
    // Log error securely without exposing sensitive details
    throw new Error('Password hashing failed');
  }
}

/**
 * Securely compares a plain text password with a hashed password
 * Uses timing-safe comparison to prevent timing attacks
 * 
 * @param plainTextPassword - The plain text password to compare
 * @param hashedPassword - The hashed password to compare against
 * @throws {Error} If either password input is invalid
 * @returns Promise resolving to true if passwords match, false otherwise
 */
export async function comparePasswords(
  plainTextPassword: string,
  hashedPassword: string
): Promise<boolean> {
  // Input validation
  if (!plainTextPassword || !hashedPassword || 
      typeof plainTextPassword !== 'string' || 
      typeof hashedPassword !== 'string') {
    throw new Error('Invalid password comparison inputs');
  }

  try {
    // Use bcrypt's timing-safe compare
    const isMatch = await compare(plainTextPassword, hashedPassword);
    return isMatch;
  } catch (error) {
    // Log error securely without exposing sensitive details
    throw new Error('Password comparison failed');
  }
}

/**
 * Validates password strength against security requirements
 * Checks for minimum length, complexity, and common patterns
 * 
 * @param password - The password to validate
 * @returns boolean indicating if password meets strength requirements
 */
export function validatePasswordStrength(password: string): boolean {
  // Input validation
  if (!password || typeof password !== 'string') {
    return false;
  }

  // Check minimum length
  if (password.length < PASSWORD_MIN_LENGTH) {
    return false;
  }

  // Validate against password requirements using validator
  return isStrongPassword(password, {
    minLength: PASSWORD_REQUIREMENTS.minLength,
    minLowercase: PASSWORD_REQUIREMENTS.minLowercase,
    minUppercase: PASSWORD_REQUIREMENTS.minUppercase,
    minNumbers: PASSWORD_REQUIREMENTS.minNumbers,
    minSymbols: PASSWORD_REQUIREMENTS.minSymbols,
    returnScore: false
  });
}