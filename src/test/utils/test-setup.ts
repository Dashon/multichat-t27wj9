/**
 * @fileoverview Centralized test environment setup and initialization for AI-Enhanced Group Chat Platform
 * Handles test configuration, database connections, AI agent validation, and performance monitoring
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // ^29.0.0
import mongoose from 'mongoose'; // ^7.0.0
import { Pool } from 'pg'; // ^8.0.0
import Redis from 'ioredis'; // ^5.0.0

import { getTestConfig, initializeTestEnvironment } from '../config/test-config';
import DatabaseCleaner from './db-cleanup';
import { 
  createTestUser, 
  createTestChatGroup, 
  waitForDatabaseSync,
  validateAIAgentResponse,
  monitorTestPerformance 
} from './test-helpers';

// Global test environment constants
export const TEST_ENV = process.env.TEST_ENV || 'test';
export const GLOBAL_SETUP_TIMEOUT = 60000;
export const AI_RESPONSE_TIMEOUT = 5000;
export const SECURITY_VALIDATION_TIMEOUT = 3000;

/**
 * Interface for test environment setup options
 */
interface SetupOptions {
  databases?: {
    mongo?: boolean;
    postgres?: boolean;
    redis?: boolean;
  };
  aiValidation?: boolean;
  securityChecks?: boolean;
  performanceMonitoring?: boolean;
  cleanupOnComplete?: boolean;
}

/**
 * Interface for AI agent validation results
 */
interface AIValidationResult {
  isValid: boolean;
  confidence: number;
  errors: string[];
  context: Record<string, any>;
}

/**
 * Enhanced test environment manager with AI and security support
 */
@MonitorPerformance
@SecurityValidation
class TestEnvironment {
  private config: any;
  private dbCleaner: DatabaseCleaner;
  private initialized: boolean = false;
  private aiValidator: any;
  private securityMonitor: any;
  private performanceTracker: any;

  constructor(private options: SetupOptions = {}) {
    this.config = getTestConfig('unit');
    this.dbCleaner = new DatabaseCleaner(this.config);
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring components
   * @private
   */
  private initializeMonitoring(): void {
    if (this.options.performanceMonitoring) {
      this.performanceTracker = {
        startTime: Date.now(),
        metrics: new Map()
      };
    }

    if (this.options.securityChecks) {
      this.securityMonitor = {
        validations: new Set(),
        failures: new Map()
      };
    }
  }

  /**
   * Initialize the test environment with enhanced validation
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize test configuration
      await initializeTestEnvironment({
        securityValidation: this.options.securityChecks,
        performanceMonitoring: this.options.performanceMonitoring,
        aiAgentTesting: this.options.aiValidation
      });

      // Set up database connections if required
      if (this.options.databases) {
        await this.initializeDatabases();
      }

      // Set up AI validation if enabled
      if (this.options.aiValidation) {
        await this.initializeAIValidation();
      }

      // Configure security monitoring
      if (this.options.securityChecks) {
        await this.initializeSecurityMonitoring();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Test environment initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize required database connections
   * @private
   */
  private async initializeDatabases(): Promise<void> {
    const { mongo, postgres, redis } = this.options.databases!;

    if (mongo) {
      await mongoose.connect(this.config.mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
    }

    if (postgres) {
      const pool = new Pool(this.config.postgres);
      await pool.connect();
    }

    if (redis) {
      const redis = new Redis(this.config.redis);
      await redis.ping();
    }
  }

  /**
   * Initialize AI validation components
   * @private
   */
  private async initializeAIValidation(): Promise<void> {
    this.aiValidator = {
      validateResponse: async (response: any): Promise<AIValidationResult> => {
        const result = await validateAIAgentResponse(response);
        if (this.performanceTracker) {
          this.performanceTracker.metrics.set('aiValidation', Date.now() - this.performanceTracker.startTime);
        }
        return result;
      }
    };
  }

  /**
   * Initialize security monitoring
   * @private
   */
  private async initializeSecurityMonitoring(): Promise<void> {
    // Set up security validation hooks
    jest.beforeEach(() => {
      this.securityMonitor.validations.clear();
      this.securityMonitor.failures.clear();
    });

    jest.afterEach(() => {
      if (this.securityMonitor.failures.size > 0) {
        throw new Error(`Security validations failed: ${Array.from(this.securityMonitor.failures.keys()).join(', ')}`);
      }
    });
  }

  /**
   * Clean up test environment
   */
  public async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      if (this.options.cleanupOnComplete) {
        await this.dbCleaner.cleanup();
      }

      // Close database connections
      if (this.options.databases?.mongo) {
        await mongoose.disconnect();
      }

      // Log performance metrics if enabled
      if (this.performanceTracker) {
        console.log('Test Performance Metrics:', Object.fromEntries(this.performanceTracker.metrics));
      }

      this.initialized = false;
    } catch (error) {
      throw new Error(`Test environment cleanup failed: ${error.message}`);
    }
  }
}

/**
 * Utility function to set up test environment
 */
export async function setupTestEnvironment(options: SetupOptions = {}): Promise<void> {
  const env = new TestEnvironment(options);
  await env.initialize();
  
  // Set global teardown
  jest.afterAll(async () => {
    await env.cleanup();
  });
}

/**
 * Utility function to validate AI agent configurations
 */
export async function validateAIAgents(agentConfigs: any[]): Promise<AIValidationResult> {
  const env = new TestEnvironment({ aiValidation: true });
  await env.initialize();
  
  const results = await Promise.all(
    agentConfigs.map(config => env['aiValidator'].validateResponse(config))
  );

  return {
    isValid: results.every(r => r.isValid),
    confidence: results.reduce((acc, r) => acc + r.confidence, 0) / results.length,
    errors: results.flatMap(r => r.errors),
    context: results.reduce((acc, r) => ({ ...acc, ...r.context }), {})
  };
}

export default TestEnvironment;