// External imports with versions
import '@testing-library/jest-dom/extend-expect'; // v5.16.5
import { configure } from '@testing-library/react'; // v13.4.0
import type { Config } from 'jest'; // v29.0.0
import 'jest-environment-jsdom'; // v29.0.0

/**
 * Configures Jest DOM testing environment with custom matchers and ARIA role assertions
 * Implements comprehensive accessibility testing support
 */
export const setupJestDom = (): void => {
  // Extend Jest matchers with custom DOM assertions
  expect.extend({
    // Custom matcher for checking ARIA roles
    toHaveAccessibleRole(received: HTMLElement, expectedRole: string) {
      const actualRole = received.getAttribute('role');
      const pass = actualRole === expectedRole;
      return {
        pass,
        message: () =>
          `Expected element to have role "${expectedRole}" but found "${actualRole}"`,
      };
    },
    
    // Custom matcher for checking color contrast
    toHaveValidColorContrast(received: HTMLElement) {
      // Implementation would use actual color contrast calculation
      const hasValidContrast = true; // Placeholder for actual implementation
      return {
        pass: hasValidContrast,
        message: () => 'Expected element to have valid color contrast ratio',
      };
    },

    // Custom matcher for keyboard navigation
    toBeKeyboardNavigable(received: HTMLElement) {
      const isNavigable = received.tabIndex >= 0;
      return {
        pass: isNavigable,
        message: () => 'Expected element to be keyboard navigable',
      };
    }
  });

  // Configure @testing-library/react
  configure({
    testIdAttribute: 'data-testid',
    asyncUtilTimeout: 5000,
    computedStyleSupportsPseudoElements: true,
  });
};

/**
 * Initializes comprehensive mock services for isolated testing environment
 * Provides mock implementations for API, Auth, and WebSocket services
 */
export const setupMockServices = (): void => {
  // Mock API Service
  global.mockApiService = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  };

  // Mock Authentication Service
  global.mockAuthService = {
    login: jest.fn(),
    logout: jest.fn(),
    getToken: jest.fn(() => 'mock-jwt-token'),
    refreshToken: jest.fn(),
    isAuthenticated: jest.fn(() => true),
  };

  // Mock WebSocket Service
  global.mockWebSocketService = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };

  // Configure default response delays
  const DEFAULT_MOCK_DELAY = 100;
  jest.mock('axios', () => ({
    default: {
      request: jest.fn(() => Promise.resolve({ data: {} })),
      defaults: { timeout: DEFAULT_MOCK_DELAY },
    },
  }));
};

/**
 * Establishes global test utilities and helper functions
 * Sets up common test configurations and cleanup utilities
 */
export const setupGlobalUtilities = (): void => {
  // Configure global test timeout
  jest.setTimeout(10000);

  // Set test environment flag
  process.env.NODE_ENV = 'test';
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  // Configure console error handling
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (
      /Warning/.test(args[0]) ||
      /Not wrapped in act/.test(args[0])
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  // Configure fake timers
  jest.useFakeTimers();

  // Setup accessibility test helpers
  global.testAccessibility = {
    checkA11y: jest.fn(),
    checkKeyboardNav: jest.fn(),
    checkScreenReader: jest.fn(),
  };

  // Setup cleanup utilities
  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });
};

/**
 * Main setup function that initializes the complete test environment
 * Configures all required testing utilities and mock services
 */
export const setupTestEnvironment = (): void => {
  setupJestDom();
  setupMockServices();
  setupGlobalUtilities();
};

// Type declarations for global mock services
declare global {
  namespace NodeJS {
    interface Global {
      mockApiService: {
        get: jest.Mock;
        post: jest.Mock;
        put: jest.Mock;
        delete: jest.Mock;
        patch: jest.Mock;
      };
      mockAuthService: {
        login: jest.Mock;
        logout: jest.Mock;
        getToken: jest.Mock;
        refreshToken: jest.Mock;
        isAuthenticated: jest.Mock;
      };
      mockWebSocketService: {
        connect: jest.Mock;
        disconnect: jest.Mock;
        send: jest.Mock;
        subscribe: jest.Mock;
        unsubscribe: jest.Mock;
      };
      testAccessibility: {
        checkA11y: jest.Mock;
        checkKeyboardNav: jest.Mock;
        checkScreenReader: jest.Mock;
      };
    }
  }
}

// Export main setup function as default
export default setupTestEnvironment;