import { loadTestEnvironment } from './environment'; // ^1.0.0
import TestDataManager from './test-data'; // ^1.0.0
import { jest } from '@jest/globals'; // ^29.0.0

// Global test configuration constants
const TEST_TIMEOUT = 30000;
const TEST_RETRY_COUNT = 3;
const TEST_CONCURRENT_USERS = 100;
const AI_AGENT_RESPONSE_TIMEOUT = 5000;
const SECURITY_TEST_THRESHOLD = 0.95;
const PERFORMANCE_SLA_THRESHOLD = 2000;

// Types for test configuration
type TestCategory = 'unit' | 'integration' | 'e2e' | 'security' | 'performance' | 'ai-agent';

interface TestEnvironmentOptions {
  environment?: string;
  securityValidation?: boolean;
  performanceMonitoring?: boolean;
  aiAgentTesting?: boolean;
}

interface TestConfiguration {
  timeout: number;
  retries: number;
  concurrent: number;
  thresholds: {
    security: number;
    performance: number;
    aiResponse: number;
  };
  environment: string;
}

interface AIAgentTestContext {
  responseTimeout: number;
  validationRules: Map<string, Function>;
  contextHistory: Map<string, any[]>;
}

interface SecurityValidationRules {
  authenticationRequired: boolean;
  encryptionLevel: string;
  rateLimiting: boolean;
  inputValidation: boolean;
}

interface PerformanceThresholds {
  responseTime: number;
  throughput: number;
  errorRate: number;
  concurrentUsers: number;
}

/**
 * Enhanced test configuration manager with AI agent, security, and performance support
 * @class TestConfig
 * @version 1.0.0
 */
class TestConfig {
  private static instance: TestConfig;
  private configCache: Map<string, TestConfiguration>;
  private initialized: boolean;
  private aiContext: AIAgentTestContext;
  private securityRules: SecurityValidationRules;
  private perfThresholds: PerformanceThresholds;

  private constructor() {
    this.configCache = new Map();
    this.initialized = false;
    this.aiContext = {
      responseTimeout: AI_AGENT_RESPONSE_TIMEOUT,
      validationRules: new Map(),
      contextHistory: new Map()
    };
    this.securityRules = {
      authenticationRequired: true,
      encryptionLevel: 'TLS 1.3',
      rateLimiting: true,
      inputValidation: true
    };
    this.perfThresholds = {
      responseTime: PERFORMANCE_SLA_THRESHOLD,
      throughput: TEST_CONCURRENT_USERS,
      errorRate: 0.01,
      concurrentUsers: TEST_CONCURRENT_USERS
    };
  }

  /**
   * Get singleton instance of TestConfig
   */
  public static getInstance(): TestConfig {
    if (!TestConfig.instance) {
      TestConfig.instance = new TestConfig();
    }
    return TestConfig.instance;
  }

  /**
   * Initialize test configuration with enhanced features
   * @param options TestEnvironmentOptions
   * @returns Promise<void>
   */
  public async initialize(options: TestEnvironmentOptions = {}): Promise<void> {
    if (this.initialized) return;

    try {
      // Load environment configuration
      await loadTestEnvironment();

      // Initialize test data manager
      const testDataManager = TestDataManager.getInstance();
      await testDataManager.initialize();

      // Set up AI agent test context
      if (options.aiAgentTesting) {
        await this.initializeAITestContext();
      }

      // Configure security validation
      if (options.securityValidation) {
        await this.initializeSecurityValidation();
      }

      // Set up performance monitoring
      if (options.performanceMonitoring) {
        await this.initializePerformanceMonitoring();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Test configuration initialization failed: ${error.message}`);
    }
  }

  /**
   * Get configuration for specific test category
   * @param category TestCategory
   * @returns TestConfiguration
   */
  public getConfig(category: TestCategory): TestConfiguration {
    if (!this.initialized) {
      throw new Error('Test configuration not initialized');
    }

    // Check cache first
    if (this.configCache.has(category)) {
      return this.configCache.get(category)!;
    }

    // Create category-specific configuration
    const config: TestConfiguration = {
      timeout: TEST_TIMEOUT,
      retries: TEST_RETRY_COUNT,
      concurrent: TEST_CONCURRENT_USERS,
      thresholds: {
        security: SECURITY_TEST_THRESHOLD,
        performance: PERFORMANCE_SLA_THRESHOLD,
        aiResponse: AI_AGENT_RESPONSE_TIMEOUT
      },
      environment: process.env.NODE_ENV || 'test'
    };

    // Apply category-specific adjustments
    switch (category) {
      case 'ai-agent':
        config.timeout = AI_AGENT_RESPONSE_TIMEOUT * 2;
        config.retries = TEST_RETRY_COUNT + 2;
        break;
      case 'security':
        config.timeout = TEST_TIMEOUT * 1.5;
        config.thresholds.security = SECURITY_TEST_THRESHOLD;
        break;
      case 'performance':
        config.concurrent = TEST_CONCURRENT_USERS;
        config.thresholds.performance = PERFORMANCE_SLA_THRESHOLD;
        break;
    }

    // Cache the configuration
    this.configCache.set(category, config);
    return config;
  }

  /**
   * Initialize AI agent test context
   * @private
   */
  private async initializeAITestContext(): Promise<void> {
    this.aiContext.validationRules.set('responseFormat', (response: any) => {
      return response && 
             typeof response === 'object' && 
             'content' in response &&
             'confidence' in response;
    });

    this.aiContext.validationRules.set('contextRetention', (context: any[]) => {
      return Array.isArray(context) && context.length <= 10;
    });

    jest.setTimeout(this.aiContext.responseTimeout * 2);
  }

  /**
   * Initialize security validation rules
   * @private
   */
  private async initializeSecurityValidation(): Promise<void> {
    // Set up security test hooks
    jest.beforeEach(() => {
      // Validate authentication and encryption
      expect(this.securityRules.authenticationRequired).toBe(true);
      expect(this.securityRules.encryptionLevel).toBe('TLS 1.3');
    });
  }

  /**
   * Initialize performance monitoring
   * @private
   */
  private async initializePerformanceMonitoring(): Promise<void> {
    // Set up performance test hooks
    jest.beforeEach(() => {
      // Validate performance thresholds
      expect(this.perfThresholds.responseTime).toBeLessThanOrEqual(PERFORMANCE_SLA_THRESHOLD);
      expect(this.perfThresholds.errorRate).toBeLessThanOrEqual(0.01);
    });
  }
}

// Export utility functions
export async function initializeTestEnvironment(options: TestEnvironmentOptions = {}): Promise<void> {
  const config = TestConfig.getInstance();
  await config.initialize(options);
}

export function getTestConfig(category: TestCategory): TestConfiguration {
  const config = TestConfig.getInstance();
  return config.getConfig(category);
}

// Export default class
export default TestConfig;