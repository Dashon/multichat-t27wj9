import path from 'path'; // ^1.7.0
import fs from 'fs-extra'; // ^11.1.0
import { getEnvironmentVariable } from './environment';

// Constants
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures');
const TEST_DATA_VERSION = '1.0.0';
const CACHE_TIMEOUT = 300000; // 5 minutes in milliseconds

// Types
type ValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  version: string;
};

type LoadOptions = {
  cache?: boolean;
  validate?: boolean;
  timeout?: number;
};

type ManagerOptions = {
  cacheDuration?: number;
  strictValidation?: boolean;
  monitoringEnabled?: boolean;
};

interface ValidationSchema {
  type: string;
  required?: string[];
  properties?: Record<string, ValidationSchema>;
  items?: ValidationSchema;
  pattern?: RegExp;
}

/**
 * Singleton class for managing test data with enhanced validation and caching
 * @class TestDataManager
 * @version 1.0.0
 */
@singleton
class TestDataManager {
  private static instance: TestDataManager;
  private loadedFixtures: Map<string, CacheEntry<any>> = new Map();
  private initialized: boolean = false;
  private validationRules: Map<string, ValidationSchema> = new Map();

  private constructor(private options: ManagerOptions = {}) {
    this.options = {
      cacheDuration: CACHE_TIMEOUT,
      strictValidation: true,
      monitoringEnabled: true,
      ...options
    };
  }

  /**
   * Get singleton instance of TestDataManager
   */
  public static getInstance(options?: ManagerOptions): TestDataManager {
    if (!TestDataManager.instance) {
      TestDataManager.instance = new TestDataManager(options);
    }
    return TestDataManager.instance;
  }

  /**
   * Initialize test data manager with configuration
   * @throws {Error} If initialization fails
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize validation rules for different data types
      this.initializeValidationRules();
      
      // Verify fixtures directory exists
      await fs.ensureDir(FIXTURES_PATH);
      
      // Load environment-specific configuration
      const testEnv = getEnvironmentVariable<string>('NODE_ENV', 'test');
      
      this.initialized = true;
    } catch (error) {
      throw new Error(`TestDataManager initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize validation rules for different test data types
   * @private
   */
  private initializeValidationRules(): void {
    // AI Agent validation schema
    this.validationRules.set('aiAgent', {
      type: 'object',
      required: ['id', 'name', 'specialization', 'capabilities'],
      properties: {
        id: { type: 'string', pattern: /^[a-zA-Z0-9-]+$/ },
        name: { type: 'string' },
        specialization: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } }
      }
    });

    // Chat Group validation schema
    this.validationRules.set('chatGroup', {
      type: 'object',
      required: ['id', 'name', 'members', 'createdAt'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        members: { type: 'array', items: { type: 'string' } },
        settings: { type: 'object' }
      }
    });
  }

  /**
   * Load test data from fixture file with validation and caching
   * @template T
   * @param {string} fixtureName - Name of the fixture file
   * @param {LoadOptions} options - Loading options
   * @returns {Promise<T>} Loaded and validated test data
   */
  @validateInput
  @cacheResult
  public async loadTestData<T>(
    fixtureName: string,
    options: LoadOptions = {}
  ): Promise<T> {
    const {
      cache = true,
      validate = true,
      timeout = this.options.cacheDuration
    } = options;

    // Check cache if enabled
    if (cache) {
      const cachedData = this.getCachedData<T>(fixtureName);
      if (cachedData) return cachedData;
    }

    try {
      // Construct fixture path
      const fixturePath = path.join(FIXTURES_PATH, `${fixtureName}.json`);
      
      // Load and parse fixture data
      const rawData = await fs.readJson(fixturePath);
      
      // Validate data if enabled
      if (validate) {
        const validationResult = await this.validateTestData(
          rawData,
          this.validationRules.get(fixtureName)
        );
        
        if (!validationResult.isValid && this.options.strictValidation) {
          throw new Error(
            `Test data validation failed: ${validationResult.errors.join(', ')}`
          );
        }
      }

      // Cache the loaded data if caching is enabled
      if (cache) {
        this.cacheData(fixtureName, rawData, timeout);
      }

      return rawData as T;
    } catch (error) {
      throw new Error(`Failed to load test data ${fixtureName}: ${error.message}`);
    }
  }

  /**
   * Validate test data against schema
   * @private
   * @param {any} data - Data to validate
   * @param {ValidationSchema} schema - Validation schema
   * @returns {Promise<ValidationResult>} Validation result
   */
  @logValidation
  private async validateTestData(
    data: any,
    schema?: ValidationSchema
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!schema) {
      result.warnings.push('No validation schema provided');
      return result;
    }

    try {
      // Validate data type
      if (typeof data !== schema.type) {
        result.errors.push(`Invalid data type: expected ${schema.type}`);
      }

      // Validate required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in data)) {
            result.errors.push(`Missing required field: ${field}`);
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in data) {
            const propResult = await this.validateTestData(data[key], propSchema);
            result.errors.push(...propResult.errors);
            result.warnings.push(...propResult.warnings);
          }
        }
      }

      // Validate array items
      if (schema.items && Array.isArray(data)) {
        for (const item of data) {
          const itemResult = await this.validateTestData(item, schema.items);
          result.errors.push(...itemResult.errors);
          result.warnings.push(...itemResult.warnings);
        }
      }

      result.isValid = result.errors.length === 0;
    } catch (error) {
      result.errors.push(`Validation error: ${error.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Get cached test data if valid
   * @private
   * @template T
   * @param {string} key - Cache key
   * @returns {T | null} Cached data or null
   */
  private getCachedData<T>(key: string): T | null {
    const cached = this.loadedFixtures.get(key);
    
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > this.options.cacheDuration!;
    const isVersionMatch = cached.version === TEST_DATA_VERSION;
    
    if (isExpired || !isVersionMatch) {
      this.loadedFixtures.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Cache test data with timestamp and version
   * @private
   * @param {string} key - Cache key
   * @param {T} data - Data to cache
   * @param {number} timeout - Cache timeout
   */
  private cacheData<T>(key: string, data: T, timeout: number): void {
    this.loadedFixtures.set(key, {
      data,
      timestamp: Date.now(),
      version: TEST_DATA_VERSION
    });
  }
}

// Export main class and utility functions
export default TestDataManager;

export const loadTestData = async <T>(
  fixtureName: string,
  options?: LoadOptions
): Promise<T> => {
  const manager = TestDataManager.getInstance();
  await manager.initialize();
  return manager.loadTestData<T>(fixtureName, options);
};

export const validateTestData = async (
  data: any,
  schema: ValidationSchema
): Promise<ValidationResult> => {
  const manager = TestDataManager.getInstance();
  return manager['validateTestData'](data, schema);
};