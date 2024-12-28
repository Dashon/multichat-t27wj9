/**
 * @fileoverview Central Redux store configuration implementing type-safe state management
 * with comprehensive middleware support for the AI-Enhanced Group Chat Platform web client.
 * @version 1.0.0
 */

import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'; // v1.9.7
import { createLogger } from 'redux-logger'; // v3.0.6

// Import reducers
import authReducer from './slices/authSlice';
import chatReducer from './slices/chatSlice';
import messageReducer from './slices/messageSlice';
import pollReducer from './slices/pollSlice';
import preferenceReducer from './slices/preferenceSlice';
import themeReducer from './slices/themeSlice';

// Constants for store configuration
const ENABLE_REDUX_LOGGER = process.env.NODE_ENV === 'development';
const ENABLE_REDUX_DEVTOOLS = process.env.NODE_ENV === 'development';

/**
 * Configure middleware based on environment
 */
const getMiddleware = () => {
  const middleware = [...getDefaultMiddleware({
    // Middleware configuration for performance
    serializableCheck: {
      // Ignore certain action types for WebSocket messages
      ignoredActions: ['chat/messageReceived', 'chat/messageSent'],
      // Ignore date instances in certain paths
      ignoredPaths: [
        'polls.polls.*.deadline',
        'messages.messages.*.timestamp',
        'preferences.lastSyncTimestamp'
      ]
    },
    immutableCheck: {
      // Ignore certain paths for performance
      ignoredPaths: ['chat.messages', 'messages.messageCache']
    },
    thunk: {
      extraArgument: undefined
    }
  })];

  // Add logger in development
  if (ENABLE_REDUX_LOGGER) {
    middleware.push(createLogger({
      collapsed: true,
      duration: true,
      timestamp: false,
      // Ignore frequent actions in logging
      predicate: (_, action) => !action.type.includes('chat/typing')
    }));
  }

  return middleware;
};

/**
 * Configure Redux store with all reducers and middleware
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
    messages: messageReducer,
    polls: pollReducer,
    preferences: preferenceReducer,
    theme: themeReducer
  },
  middleware: getMiddleware(),
  devTools: ENABLE_REDUX_DEVTOOLS,
  // Enhance store configuration for production
  enhancers: (defaultEnhancers) => {
    if (process.env.NODE_ENV === 'production') {
      return defaultEnhancers.filter(enhancer => 
        !enhancer.toString().includes('DevTools')
      );
    }
    return defaultEnhancers;
  }
});

// Enable hot module replacement for reducers in development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./slices/authSlice', () => store.replaceReducer(authReducer));
  module.hot.accept('./slices/chatSlice', () => store.replaceReducer(chatReducer));
  module.hot.accept('./slices/messageSlice', () => store.replaceReducer(messageReducer));
  module.hot.accept('./slices/pollSlice', () => store.replaceReducer(pollReducer));
  module.hot.accept('./slices/preferenceSlice', () => store.replaceReducer(preferenceReducer));
  module.hot.accept('./slices/themeSlice', () => store.replaceReducer(themeReducer));
}

// Export types for TypeScript support
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/**
 * Type-safe hooks for accessing store state and dispatch
 */
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Error boundary for store operations
store.subscribe(() => {
  try {
    // Persist certain state slices to local storage
    const state = store.getState();
    localStorage.setItem('theme', JSON.stringify(state.theme));
    localStorage.setItem('preferences', JSON.stringify(state.preferences));
  } catch (error) {
    console.error('Store persistence failed:', error);
  }
});

// Initialize store with persisted state if available
try {
  const persistedTheme = localStorage.getItem('theme');
  const persistedPreferences = localStorage.getItem('preferences');

  if (persistedTheme) {
    store.dispatch({ type: 'theme/HYDRATE', payload: JSON.parse(persistedTheme) });
  }
  if (persistedPreferences) {
    store.dispatch({ type: 'preferences/HYDRATE', payload: JSON.parse(persistedPreferences) });
  }
} catch (error) {
  console.error('Store hydration failed:', error);
}