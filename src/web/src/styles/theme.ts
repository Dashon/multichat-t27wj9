/**
 * @fileoverview Core theme configuration implementing Material Design 3 principles
 * Provides comprehensive theming system with accessibility and responsive features
 * @version 1.0.0
 */

import { createTheme, Theme, ThemeOptions } from '@mui/material/styles'; // v5.14+
import type { CSSObject } from '@emotion/react'; // v11.11+

// Internal imports
import { lightColors, darkColors } from './colors';
import { typography } from './typography';
import { SPACING, BREAKPOINTS, LAYOUT } from './dimensions';
import { themeTransition } from './animations';

// Constants for theme configuration
const THEME_CONSTANTS = {
  MIN_TOUCH_TARGET: 44, // Minimum touch target size in pixels (WCAG)
  MIN_CONTRAST_RATIO: 4.5, // Minimum contrast ratio for text (WCAG AA)
  BORDER_RADIUS: 8, // Default border radius
  TRANSITION_DURATION: 300, // Default transition duration in ms
} as const;

/**
 * Interface for custom theme options extending Material UI's ThemeOptions
 */
interface CustomThemeOptions extends ThemeOptions {
  mode?: 'light' | 'dark' | 'system';
  highContrast?: boolean;
  reducedMotion?: boolean;
}

/**
 * Creates component overrides with accessibility and responsive features
 */
const createComponentOverrides = (mode: 'light' | 'dark') => {
  const colors = mode === 'light' ? lightColors : darkColors;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
        'html, body': {
          margin: 0,
          padding: 0,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        // Reduced motion support
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: THEME_CONSTANTS.MIN_TOUCH_TARGET,
          borderRadius: THEME_CONSTANTS.BORDER_RADIUS,
          transition: `all ${THEME_CONSTANTS.TRANSITION_DURATION}ms`,
          '&:focus-visible': {
            outline: `2px solid ${colors.primary.main}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: THEME_CONSTANTS.MIN_TOUCH_TARGET,
          minHeight: THEME_CONSTANTS.MIN_TOUCH_TARGET,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          minHeight: THEME_CONSTANTS.MIN_TOUCH_TARGET,
          '&.Mui-focused': {
            outline: `2px solid ${colors.primary.main}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: THEME_CONSTANTS.BORDER_RADIUS,
          transition: `all ${THEME_CONSTANTS.TRANSITION_DURATION}ms`,
        },
      },
    },
  };
};

/**
 * Creates a theme configuration with all necessary customizations
 */
const createAppTheme = (options: CustomThemeOptions = {}): Theme => {
  const {
    mode = 'light',
    highContrast = false,
    reducedMotion = false,
    ...otherOptions
  } = options;

  // Determine color scheme based on mode
  const colors = mode === 'light' ? lightColors : darkColors;

  // Create base theme configuration
  const themeConfig: ThemeOptions = {
    palette: {
      mode,
      primary: colors.primary,
      secondary: colors.secondary,
      error: colors.error,
      warning: colors.warning,
      info: colors.info,
      success: colors.success,
      background: colors.background,
      text: colors.text,
    },
    typography,
    spacing: (factor: number) => `${SPACING.xs * factor}px`,
    breakpoints: {
      values: BREAKPOINTS,
    },
    shape: {
      borderRadius: THEME_CONSTANTS.BORDER_RADIUS,
    },
    transitions: {
      duration: {
        shortest: themeTransition.duration / 2,
        shorter: themeTransition.duration * 0.75,
        short: themeTransition.duration,
        standard: themeTransition.duration,
        complex: themeTransition.duration * 1.25,
        enteringScreen: themeTransition.duration,
        leavingScreen: themeTransition.duration,
      },
      easing: {
        easeInOut: themeTransition.easing,
        easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
      },
    },
    components: createComponentOverrides(mode),
    ...otherOptions,
  };

  // Apply high contrast adjustments if enabled
  if (highContrast) {
    themeConfig.palette = {
      ...themeConfig.palette,
      primary: {
        ...colors.primary,
        main: mode === 'light' ? '#005293' : '#99D6FF', // Enhanced contrast
      },
      text: {
        ...colors.text,
        primary: mode === 'light' ? '#000000' : '#FFFFFF',
        secondary: mode === 'light' ? '#222222' : '#EEEEEE',
      },
    };
  }

  // Apply reduced motion preferences
  if (reducedMotion) {
    themeConfig.transitions = {
      ...themeConfig.transitions,
      duration: {
        shortest: 0,
        shorter: 0,
        short: 0,
        standard: 0,
        complex: 0,
        enteringScreen: 0,
        leavingScreen: 0,
      },
    };
  }

  return createTheme(themeConfig);
};

// Create and export theme instances
export const lightTheme = createAppTheme({ mode: 'light' });
export const darkTheme = createAppTheme({ mode: 'dark' });

// Type augmentation for custom theme properties
declare module '@mui/material/styles' {
  interface Theme {
    status: {
      danger: string;
    };
  }
  interface ThemeOptions {
    status?: {
      danger?: string;
    };
  }
}