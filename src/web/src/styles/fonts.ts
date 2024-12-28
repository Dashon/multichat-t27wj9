/**
 * @fileoverview Font system configuration following Material Design 3 principles
 * Implements WCAG 2.1 Level AA compliance with customizable font sizes
 * @version 1.0.0
 */

// @fontsource/roboto v5.0.8 - Primary font family
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

// @fontsource/inter v5.0.8 - Secondary font family for UI elements
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

/**
 * Font family definitions with fallback stacks following Material Design guidelines
 * Ensures consistent typography across different platforms and browsers
 */
export const FONT_FAMILY = {
  primary: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  secondary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  monospace: "'Roboto Mono', 'SF Mono', 'Consolas', monospace"
} as const;

/**
 * Font weight constants following Material Design type scale
 * Provides semantic meaning to different text emphasis levels
 */
export const FONT_WEIGHT = {
  light: 300,    // For large display text
  regular: 400,  // For body text
  medium: 500,   // For emphasis and UI elements
  semibold: 600, // For stronger emphasis in UI
  bold: 700      // For headlines and strong emphasis
} as const;

/**
 * Font variants to be loaded for each font family
 * Optimizes performance by loading only necessary weights
 */
export const FONT_VARIANTS = {
  primary: ['300', '400', '500', '700'],   // Roboto variants
  secondary: ['400', '500', '600']         // Inter variants
} as const;

/**
 * Loads required font families and their variants
 * Implements font-display: swap for optimal loading performance
 */
export const loadFonts = (): void => {
  // Font loading is handled by @fontsource imports above
  // This function is provided for future extensibility
  // and potential dynamic font loading requirements
};

// Type definitions for better TypeScript support
export type FontFamily = keyof typeof FONT_FAMILY;
export type FontWeight = keyof typeof FONT_WEIGHT;
export type FontVariants = keyof typeof FONT_VARIANTS;