// @babel/preset-env v7.22.0
// @babel/preset-typescript v7.22.0
// @babel/preset-react v7.22.0
// metro-react-native-babel-preset v0.76.0

module.exports = {
  // Base presets configuration for React Native web application
  presets: [
    // Core React Native preset for cross-platform compatibility
    'metro-react-native-babel-preset',

    // Modern JavaScript features with automatic polyfill injection
    ['@babel/preset-env', {
      targets: {
        node: 'current',
        browsers: [
          '>0.2%',  // Browser market share > 0.2%
          'not dead', // Exclude browsers without official support/updates
          'not op_mini all' // Exclude Opera Mini
        ]
      },
      modules: 'auto', // Automatic module format detection
      useBuiltIns: 'usage', // Inject polyfills based on actual usage
      corejs: 3 // Use core-js v3 for polyfills
    }],

    // TypeScript support with full extension coverage
    ['@babel/preset-typescript', {
      isTSX: true, // Enable TSX support
      allExtensions: true // Process all file extensions
    }],

    // React preset with optimized configuration
    ['@babel/preset-react', {
      runtime: 'automatic', // Use new JSX transform
      development: process.env.NODE_ENV === 'development' // Development mode features
    }]
  ],

  // Environment-specific configurations
  env: {
    production: {
      plugins: [
        // Production-specific optimizations
      ]
    },
    development: {
      plugins: [
        // Development-specific features
      ]
    },
    test: {
      plugins: [
        // Testing environment configurations
      ]
    }
  },

  // Shared plugins across all environments
  plugins: []
};