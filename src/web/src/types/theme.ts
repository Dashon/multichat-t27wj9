// @mui/material v5.14+
import { Theme as MuiTheme, PaletteOptions } from '@mui/material';

/**
 * Theme mode enumeration defining available theme options
 */
export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system'
}

/**
 * Interface defining color object structure with Material Design 3 states
 */
export interface ColorObject {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
  hover: string;
  active: string;
  disabled: string;
  focused: string;
  alpha: (opacity: number) => string;
  darken: (amount: number) => string;
  lighten: (amount: number) => string;
}

/**
 * Comprehensive color scheme following Material Design 3 principles
 */
export interface ColorScheme {
  primary: ColorObject;
  secondary: ColorObject;
  background: ColorObject;
  surface: ColorObject;
  error: ColorObject;
  warning: ColorObject;
  success: ColorObject;
  info: ColorObject;
}

/**
 * Font size configuration with responsive scaling
 */
export type FontSize = {
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  h5: string;
  h6: string;
  subtitle1: string;
  subtitle2: string;
  body1: string;
  body2: string;
  button: string;
  caption: string;
  overline: string;
};

/**
 * Font family configuration
 */
export type FontFamily = {
  primary: string;
  secondary: string;
  monospace: string;
};

/**
 * Font weight configuration following Material Design guidelines
 */
export type FontWeight = {
  light: number;
  regular: number;
  medium: number;
  semibold: number;
  bold: number;
};

/**
 * Line height configuration for optimal readability
 */
export type LineHeight = {
  tight: number;
  normal: number;
  relaxed: number;
  loose: number;
};

/**
 * Letter spacing configuration for different text styles
 */
export type LetterSpacing = {
  tighter: string;
  tight: string;
  normal: string;
  wide: string;
  wider: string;
};

/**
 * Typography system configuration
 */
export interface Typography {
  fontFamily: FontFamily;
  fontSize: FontSize;
  fontWeight: FontWeight;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
}

/**
 * Spacing system with consistent scale
 */
export type SpacingSystem = {
  unit: number;
  values: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
};

/**
 * Breakpoint system for responsive design
 */
export type BreakpointSystem = {
  values: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  unit: string;
};

/**
 * Transition system for smooth animations
 */
export type TransitionSystem = {
  duration: {
    shortest: number;
    shorter: number;
    short: number;
    standard: number;
    complex: number;
  };
  easing: {
    easeInOut: string;
    easeOut: string;
    easeIn: string;
    sharp: string;
  };
};

/**
 * Shadow system for elevation and depth
 */
export type ShadowSystem = {
  elevation: {
    0: string;
    1: string;
    2: string;
    3: string;
    4: string;
  };
};

/**
 * Main theme interface extending Material UI theme with custom tokens
 * Implements Material Design 3 principles for depth, motion, and interaction
 */
export interface Theme extends MuiTheme {
  mode: ThemeMode;
  colors: ColorScheme;
  typography: Typography;
  spacing: SpacingSystem;
  breakpoints: BreakpointSystem;
  transitions: TransitionSystem;
  shadows: ShadowSystem;
}

/**
 * Type guard to check if a value is a valid ThemeMode
 */
export const isThemeMode = (value: any): value is ThemeMode => {
  return Object.values(ThemeMode).includes(value as ThemeMode);
};

/**
 * Helper type for theme customization
 */
export type CustomThemeOptions = {
  mode?: ThemeMode;
  colors?: Partial<ColorScheme>;
  typography?: Partial<Typography>;
  spacing?: Partial<SpacingSystem>;
  breakpoints?: Partial<BreakpointSystem>;
  transitions?: Partial<TransitionSystem>;
  shadows?: Partial<ShadowSystem>;
};

/**
 * Type for theme context value
 */
export type ThemeContextValue = {
  theme: Theme;
  setTheme: (options: CustomThemeOptions) => void;
  toggleTheme: () => void;
};