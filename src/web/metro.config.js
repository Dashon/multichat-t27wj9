// @ts-check
// metro.config.js - Metro bundler configuration for React Native web application
// Version: 0.72.0 (aligned with React Native version)

const path = require('path'); // v18.2.0
const { getDefaultConfig } = require('@react-native/metro-config'); // v0.72.0

/**
 * Metro configuration for React Native with web support
 * Enhanced with production optimizations and cross-platform capabilities
 * @returns {import('metro-config').MetroConfig} Metro configuration object
 */
module.exports = (async () => {
  const defaultConfig = await getDefaultConfig(__dirname);

  return {
    ...defaultConfig,
    
    // Module resolution configuration
    resolver: {
      // Support for different platform-specific file extensions
      sourceExts: [
        // JavaScript/TypeScript extensions
        'js', 'jsx', 'ts', 'tsx',
        // Platform-specific extensions
        'native.js', 'native.jsx', 'native.ts', 'native.tsx',
        'web.js', 'web.jsx', 'web.ts', 'web.tsx',
        // Data files
        'json'
      ],
      
      // Asset file extensions
      assetExts: [
        // Images
        'png', 'jpg', 'jpeg', 'gif', 'webp',
        // Fonts
        'ttf', 'otf', 'woff', 'woff2',
        // Vector
        'svg',
        // Media
        'mp4', 'webm', 'wav', 'mp3'
      ],
      
      // Platform support
      platforms: ['ios', 'android', 'web'],
      
      // Module resolution fields in package.json
      resolverMainFields: ['browser', 'react-native', 'main', 'module'],
      
      // Exclude test files from bundling
      blockList: [/\.test\./, /\.spec\./, /__tests__/],
      
      // Optimization settings
      disableHierarchicalLookup: true,
      nodeModulesPaths: ['node_modules']
    },
    
    // Code transformation configuration
    transformer: {
      // Babel configuration
      babelTransformerPath: require.resolve('metro-react-native-babel-preset'),
      enableBabelRuntimeConfig: true,
      enableBabelRuntime: true,
      
      // Production optimization settings
      minifierConfig: {
        compress: {
          // Remove console statements in production
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          // Code optimization
          dead_code: true,
          conditionals: true,
          evaluate: true,
          unused: true,
          if_return: true,
          join_vars: true
        },
        mangle: {
          toplevel: true,
          keep_classnames: false,
          keep_fnames: false
        },
        output: {
          ascii_only: true,
          comments: false,
          beautify: false
        }
      },
      
      // Enable production optimizations
      optimizationEnabled: true,
      
      // Disable experimental features for stability
      experimentalImportSupport: false,
      unstable_disableES6Transforms: false
    },
    
    // Server configuration
    server: {
      port: 8081,
      useGlobalHotkey: true,
      runInspectorProxy: true
    },
    
    // Project configuration
    watchFolders: [path.resolve(__dirname, 'node_modules')],
    resetCache: false,
    maxWorkers: 4,
    cacheVersion: '1.0.0',
    projectRoot: path.resolve(__dirname),
    
    // Serializer configuration
    serializer: {
      // Preserve default serializer settings
      createModuleIdFactory: defaultConfig.serializer?.createModuleIdFactory,
      getModulesRunBeforeMainModule: defaultConfig.serializer?.getModulesRunBeforeMainModule,
      getPolyfills: defaultConfig.serializer?.getPolyfills,
      postProcessBundleSourcemap: defaultConfig.serializer?.postProcessBundleSourcemap
    }
  };
})();