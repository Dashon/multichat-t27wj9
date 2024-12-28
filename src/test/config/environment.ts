import dotenv from 'dotenv'; // ^16.0.0
import path from 'path'; // ^1.7.0
import { promises as fs } from 'fs';

// Types for environment variables
type EnvironmentVariable<T> = T | undefined;
type ValidationRule = (value: string) => boolean;

// Custom errors
class EnvironmentError extends Error {
  constructor(message: string) {
    super(`Environment Error: ${message}`);
    this.name = 'EnvironmentError';
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(`Validation Error: ${message}`);
    this.name = 'ValidationError';
  }
}

/**
 * Singleton class for managing test environment configuration with enhanced security and caching
 * @class EnvironmentManager
 * @decorator @singleton
 * @decorator @audit('env-manager')
 */
class EnvironmentManager {
  private static instance: EnvironmentManager;
  private initialized: boolean = false;
  private cachedVariables: Map<string, any> = new Map();
  private sensitiveKeys: Set<string> = new Set([
    'DB_PASSWORD',
    'API_KEY',
    'JWT_SECRET',
    'AUTH_TOKEN'
  ]);
  private validators: Map<string, ValidationRule> = new Map();

  private constructor() {
    this.initializeValidators();
  }

  /**
   * Get singleton instance of EnvironmentManager
   */
  public static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  /**
   * Initialize validators for different types of environment variables
   * @private
   */
  private initializeValidators(): void {
    this.validators.set('url', (value: string) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });

    this.validators.set('port', (value: string) => {
      const port = parseInt(value);
      return !isNaN(port) && port > 0 && port <= 65535;
    });

    this.validators.set('boolean', (value: string) => {
      return ['true', 'false', '1', '0'].includes(value.toLowerCase());
    });
  }

  /**
   * Initialize the environment manager and load configuration
   * @throws {EnvironmentError}
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadEnvironment();
      await this.validateEnvironment();
      this.initialized = true;
    } catch (error) {
      throw new EnvironmentError(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * Load environment variables from file
   * @private
   * @throws {EnvironmentError}
   */
  private async loadEnvironment(): Promise<void> {
    const envPath = path.resolve(__dirname, process.env.ENV_FILE_PATH || '../.env.test');

    try {
      // Check file existence and permissions
      await fs.access(envPath, fs.constants.R_OK);
      
      // Load environment file
      const result = dotenv.config({ path: envPath });
      
      if (result.error) {
        throw new EnvironmentError(`Failed to load environment file: ${result.error.message}`);
      }
    } catch (error) {
      throw new EnvironmentError(`Environment file access error: ${error.message}`);
    }
  }

  /**
   * Get environment variable with type safety and caching
   * @template T
   * @param {string} key - Environment variable key
   * @param {T} defaultValue - Optional default value
   * @returns {T}
   * @throws {EnvironmentError}
   */
  public getVariable<T>(key: string, defaultValue?: T): T {
    if (!this.initialized) {
      throw new EnvironmentError('Environment manager not initialized');
    }

    // Check cache first
    if (this.cachedVariables.has(key)) {
      return this.cachedVariables.get(key) as T;
    }

    const value = process.env[key];

    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new EnvironmentError(`Required environment variable ${key} not found`);
    }

    // Apply type conversion and validation
    const result = this.convertValue<T>(value);
    
    // Cache the result if not sensitive
    if (!this.sensitiveKeys.has(key)) {
      this.cachedVariables.set(key, result);
    }

    return result;
  }

  /**
   * Convert and validate environment variable value
   * @private
   * @template T
   * @param {string} value - Raw environment variable value
   * @returns {T}
   */
  private convertValue<T>(value: string): T {
    // Type conversion based on expected type
    if (typeof value === 'string') {
      if (this.validators.get('boolean')!(value)) {
        return (value.toLowerCase() === 'true' || value === '1') as unknown as T;
      }
      if (this.validators.get('port')!(value)) {
        return parseInt(value) as unknown as T;
      }
    }
    return value as unknown as T;
  }
}

/**
 * Load and validate test environment configuration
 * @throws {EnvironmentError}
 * @returns {Promise<void>}
 */
export async function loadTestEnvironment(): Promise<void> {
  const manager = EnvironmentManager.getInstance();
  await manager.initialize();
}

/**
 * Get environment variable with type safety
 * @template T
 * @param {string} key - Environment variable key
 * @param {T} defaultValue - Optional default value
 * @returns {T}
 */
export function getEnvironmentVariable<T>(key: string, defaultValue?: T): T {
  const manager = EnvironmentManager.getInstance();
  return manager.getVariable<T>(key, defaultValue);
}

/**
 * Validate all required environment variables
 * @returns {Promise<boolean>}
 * @throws {ValidationError}
 */
export async function validateEnvironment(): Promise<boolean> {
  const requiredVars = [
    'NODE_ENV',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'API_URL',
    'LOG_LEVEL'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new ValidationError(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate specific variable formats
  const manager = EnvironmentManager.getInstance();
  const urlValidator = manager['validators'].get('url');
  const portValidator = manager['validators'].get('port');

  if (!urlValidator!(process.env.API_URL!)) {
    throw new ValidationError('Invalid API_URL format');
  }

  if (!portValidator!(process.env.DB_PORT!)) {
    throw new ValidationError('Invalid DB_PORT format');
  }

  return true;
}

// Export default EnvironmentManager class
export default EnvironmentManager;