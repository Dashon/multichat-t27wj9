// ESLint configuration for AI-Enhanced Group Chat Platform Web Application
// Dependencies:
// eslint: ^8.0.0
// @typescript-eslint/parser: ^6.0.0
// @typescript-eslint/eslint-plugin: ^6.0.0
// eslint-plugin-react: ^7.33.0
// eslint-plugin-react-hooks: ^4.6.0
// eslint-config-prettier: ^9.0.0

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    },
    project: './tsconfig.json'
  },

  settings: {
    react: {
      version: 'detect'
    }
  },

  env: {
    browser: true,
    es2020: true,
    node: true,
    jest: true
  },

  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks'
  ],

  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],

  rules: {
    // TypeScript specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      'argsIgnorePattern': '^_'
    }],
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',

    // React specific rules
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // General code quality rules
    'no-console': ['warn', {
      allow: ['warn', 'error']
    }],
    'no-debugger': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'prefer-const': 'error',
    'no-var': 'error'
  },

  // Test file specific overrides
  overrides: [
    {
      files: ['*.test.ts', '*.test.tsx'],
      env: {
        jest: true
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off' // Allow any in test files for flexibility
      }
    }
  ],

  // Files to ignore
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    '*.js'
  ]
};