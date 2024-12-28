import { createTheme, useMediaQuery } from '@mui/material'; // @mui/material v5.14+
import { ThemeMode, isThemeMode } from '../types/theme';
import { lightColors, darkColors } from '../styles/colors';

// Storage key for persisting theme preference
const STORAGE_THEME_KEY = 'app_theme_mode';

// Theme transition configuration
const THEME_TRANSITION_DURATION = 300;
const THEME_TRANSITION_PROPERTIES = [
  'background-color',
  'color',
  'border-color',
  'box-shadow',
  'transform'
];

// Typography scale following Material Design guidelines
const typography = {
  fontFamily: {
    primary: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    secondary: '"Roboto Slab", "Times New Roman", serif',
    monospace: '"Roboto Mono", monospace'
  },
  fontSize: {
    h1: '2.5rem',
    h2: '2rem',
    h3: '1.75rem',
    h4: '1.5rem',
    h5: '1.25rem',
    h6: '1rem',
    subtitle1: '1rem',
    subtitle2: '0.875rem',
    body1: '1rem',
    body2: '0.875rem',
    button: '0.875rem',
    caption: '0.75rem',
    overline: '0.75rem'
  },
  fontWeight: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2
  },
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em'
  }
};

// Breakpoint system for responsive design
const breakpoints = {
  values: {
    xs: 320,
    sm: 768,
    md: 1024,
    lg: 1440,
    xl: 1920
  },
  unit: 'px'
};

/**
 * Initializes the application theme based on stored preferences or system default
 * Implements Material Design 3 principles for depth, motion, and interaction
 */
const initializeTheme = () => {
  // Check for stored theme preference
  const storedTheme = localStorage.getItem(STORAGE_THEME_KEY);
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  
  let themeMode: ThemeMode;
  
  if (storedTheme && isThemeMode(storedTheme)) {
    themeMode = storedTheme as ThemeMode;
  } else {
    themeMode = prefersDarkMode ? ThemeMode.DARK : ThemeMode.LIGHT;
  }
  
  return getThemeConfig(themeMode);
};

/**
 * Generates comprehensive theme configuration based on specified mode
 * @param mode - The desired theme mode (light/dark/system)
 */
const getThemeConfig = (mode: ThemeMode) => {
  const colors = mode === ThemeMode.DARK ? darkColors : lightColors;
  
  return createTheme({
    palette: {
      mode: mode === ThemeMode.DARK ? 'dark' : 'light',
      primary: colors.primary,
      secondary: colors.secondary,
      error: colors.error,
      warning: colors.warning,
      info: colors.info,
      success: colors.success,
      background: colors.background,
      text: colors.text
    },
    typography,
    breakpoints,
    spacing: (factor: number) => `${8 * factor}px`,
    shape: {
      borderRadius: 8
    },
    transitions: {
      duration: {
        shortest: 150,
        shorter: 200,
        short: 250,
        standard: THEME_TRANSITION_DURATION,
        complex: 375
      },
      easing: {
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        sharp: 'cubic-bezier(0.4, 0, 0.6, 1)'
      }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            transition: THEME_TRANSITION_PROPERTIES.map(
              prop => `${prop} ${THEME_TRANSITION_DURATION}ms ease-in-out`
            ).join(', ')
          }
        }
      },
      // Enhance accessibility with focus visible styles
      MuiButtonBase: {
        defaultProps: {
          disableRipple: false
        },
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              outline: `3px solid ${colors.primary.main}`,
              outlineOffset: 2
            }
          }
        }
      }
    },
    // Custom tokens for Material Design 3 elevation system
    shadows: [
      'none',
      `0px 2px 4px ${colors.interaction.hover}`,
      `0px 4px 8px ${colors.interaction.hover}`,
      `0px 8px 16px ${colors.interaction.hover}`,
      `0px 16px 24px ${colors.interaction.hover}`,
      // Additional shadow levels...
    ]
  });
};

export const themeConfig = {
  initializeTheme,
  getThemeConfig
};