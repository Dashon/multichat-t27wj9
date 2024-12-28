import type { Config } from '@jest/types';

/**
 * Comprehensive Jest configuration for the AI-Enhanced Group Chat Platform
 * Configures test environment, coverage reporting, module resolution and more
 * @version Jest 29.0.0
 */
const config: Config.InitialOptions = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Set Node.js as the test environment
  testEnvironment: 'node',

  // Define test file locations
  roots: ['<rootDir>/src/test'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/?(*.)+(spec|test).+(ts|tsx)'
  ],

  // Configure TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },

  // Module path aliases for better imports
  moduleNameMapper: {
    '@test/(.*)': '<rootDir>/src/test/$1',
    '@fixtures/(.*)': '<rootDir>/src/test/fixtures/$1',
    '@utils/(.*)': '<rootDir>/src/test/utils/$1',
    '@e2e/(.*)': '<rootDir>/src/test/e2e/$1',
    '@integration/(.*)': '<rootDir>/src/test/integration/$1',
    '@performance/(.*)': '<rootDir>/src/test/performance/$1',
    '@security/(.*)': '<rootDir>/src/test/security/$1',
    '@unit/(.*)': '<rootDir>/src/test/unit/$1'
  },

  // Test setup files for different test types
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup.ts',
    '<rootDir>/src/test/e2e/setup.ts',
    '<rootDir>/src/test/integration/setup.ts',
    '<rootDir>/src/test/performance/setup.ts',
    '<rootDir>/src/test/security/setup.ts'
  ],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'json',
    'html',
    'cobertura'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/core/**/*.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Test execution configuration
  testTimeout: 30000,
  maxWorkers: '50%',
  verbose: true,

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/docs/'
  ],

  // File extensions to consider
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json'
  ],

  // TypeScript configuration
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/src/test/tsconfig.json',
      diagnostics: true
    }
  },

  // Additional settings
  errorOnDeprecated: true,
  detectOpenHandles: true,
  forceExit: true
};

export default config;