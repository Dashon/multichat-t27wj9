/**
 * dimensions.ts
 * Core dimensional constants following Material Design 3 principles
 * @version 1.0.0
 */

// Base unit for Material Design 8px grid system
const BASE_SPACING_UNIT = 8;
const GOLDEN_RATIO = 1.618;

/**
 * Type-safe interface for spacing measurements following Material Design grid
 */
export interface SpacingInterface {
  xxs: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

/**
 * Type-safe interface for responsive design breakpoints
 */
export interface BreakpointsInterface {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/**
 * Type-safe interface for fixed layout dimensions
 */
export interface LayoutInterface {
  headerHeight: number;
  sidebarWidth: number;
  chatInputHeight: number;
  agentPanelWidth: number;
  maxContentWidth: number;
}

/**
 * Utility function to calculate spacing values based on the Material Design 8px grid system
 * @param multiplier - Number to multiply with base spacing unit
 * @returns Calculated spacing value in pixels
 */
const calculateSpacing = (multiplier: number): number => {
  if (multiplier <= 0) {
    throw new Error('Spacing multiplier must be a positive number');
  }
  return Math.round(BASE_SPACING_UNIT * multiplier);
};

/**
 * SPACING
 * Defines consistent spacing values based on Material Design 8px grid system
 * Used for margins, padding, and gaps throughout the application
 */
export const SPACING: SpacingInterface = {
  xxs: calculateSpacing(0.5),  // 4px
  xs: calculateSpacing(1),     // 8px
  sm: calculateSpacing(2),     // 16px
  md: calculateSpacing(3),     // 24px
  lg: calculateSpacing(4),     // 32px
  xl: calculateSpacing(6),     // 48px
  xxl: calculateSpacing(8),    // 64px
} as const;

/**
 * BREAKPOINTS
 * Defines responsive breakpoints for mobile-first design approach
 * Matches technical specification requirements for responsive design
 */
export const BREAKPOINTS: BreakpointsInterface = {
  xs: 320,  // Mobile portrait
  sm: 768,  // Tablet portrait
  md: 1024, // Tablet landscape
  lg: 1440, // Desktop
  xl: 1920, // Large desktop
} as const;

/**
 * LAYOUT
 * Defines fixed dimensions for core layout components
 * Following Material Design 3 principles for visual hierarchy
 */
export const LAYOUT: LayoutInterface = {
  headerHeight: calculateSpacing(7),        // 56px - Standard Material Design app bar height
  sidebarWidth: calculateSpacing(35),       // 280px - Standard Material Design drawer width
  chatInputHeight: calculateSpacing(8),     // 64px - Comfortable input area height
  agentPanelWidth: calculateSpacing(40),    // 320px - Optimal width for reading
  maxContentWidth: calculateSpacing(180),   // 1440px - Maximum content width for readability
} as const;

// Type assertions to ensure immutability
Object.freeze(SPACING);
Object.freeze(BREAKPOINTS);
Object.freeze(LAYOUT);