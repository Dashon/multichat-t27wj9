/**
 * @fileoverview Main entry point for the web version of the AI-Enhanced Group Chat Platform.
 * Implements Material Design 3 principles with comprehensive error handling and monitoring.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import ReactDOM from 'react-dom/client'; // v18.2.0
import { Provider } from 'react-redux'; // v8.1.0
import { ThemeProvider, CssBaseline } from '@mui/material'; // v5.14.0
import { Workbox } from 'workbox-window'; // v7.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0
import { AnalyticsProvider } from '@analytics/react'; // v0.1.0

// Internal imports
import { store } from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { themeConfig } from './src/config/theme.config';

// Constants
const ROOT_ELEMENT_ID = 'root';
const ENV = process.env.NODE_ENV;
const API_URL = process.env.REACT_APP_API_URL;
const WS_URL = process.env.REACT_APP_WS_URL;
const ANALYTICS_KEY = process.env.REACT_APP_ANALYTICS_KEY;

/**
 * Initializes core application services and configurations
 */
const initializeApp = async (): Promise<void> => {
  // Register service worker for PWA support
  if ('serviceWorker' in navigator && ENV === 'production') {
    const wb = new Workbox('/service-worker.js');
    try {
      await wb.register();
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  }

  // Initialize analytics
  if (ANALYTICS_KEY) {
    window.analytics?.load(ANALYTICS_KEY);
  }

  // Set up CSP headers for security
  if (ENV === 'production') {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = `
      default-src 'self';
      script-src 'self' ${API_URL};
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      connect-src 'self' ${API_URL} ${WS_URL};
      font-src 'self';
    `;
    document.head.appendChild(meta);
  }

  // Configure error reporting
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    window.analytics?.track('Error', {
      message: event.error.message,
      stack: event.error.stack,
      timestamp: new Date().toISOString()
    });
  });
};

/**
 * Error fallback component with Material Design styling
 */
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div role="alert" style={{ padding: '20px', textAlign: 'center' }}>
    <h2>Something went wrong</h2>
    <pre style={{ color: 'red' }}>{error.message}</pre>
    <button onClick={() => window.location.reload()}>Refresh Page</button>
  </div>
);

/**
 * Renders the root application component with all necessary providers
 */
const renderApp = (): void => {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) {
    throw new Error(`Root element with id '${ROOT_ELEMENT_ID}' not found`);
  }

  // Initialize theme
  const theme = themeConfig.initializeTheme();

  // Create root container
  const root = ReactDOM.createRoot(rootElement);

  // Render app with all providers
  root.render(
    <React.StrictMode>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <AnalyticsProvider>
              <AppNavigator />
            </AnalyticsProvider>
          </ThemeProvider>
        </Provider>
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Set up accessibility announcements
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.style.position = 'absolute';
  announcer.style.width = '1px';
  announcer.style.height = '1px';
  announcer.style.padding = '0';
  announcer.style.margin = '-1px';
  announcer.style.overflow = 'hidden';
  announcer.style.clip = 'rect(0, 0, 0, 0)';
  announcer.style.whiteSpace = 'nowrap';
  announcer.style.border = '0';
  document.body.appendChild(announcer);
};

// Initialize and render application
initializeApp()
  .then(renderApp)
  .catch((error) => {
    console.error('Application initialization failed:', error);
    // Render error state if initialization fails
    const rootElement = document.getElementById(ROOT_ELEMENT_ID);
    if (rootElement) {
      ReactDOM.createRoot(rootElement).render(
        <ErrorFallback error={error as Error} />
      );
    }
  });