/**
 * @fileoverview Material Design 3 compliant spacing system implementation
 * Provides consistent spacing values based on an 8px grid system with a modular scale.
 * @version 1.0.0
 */

/**
 * Base unit for Material Design spacing calculations (8px)
 * @constant
 */
const BASE_UNIT = 8;

/**
 * Maximum size of memoization cache for spacing calculations
 * @constant
 */
const MEMOIZATION_CACHE_SIZE = 100;

/**
 * Interface defining the structure of the spacing scale multipliers
 * following Material Design 3 principles
 */
export interface SpacingScale {
  xxs: number; // Extra extra small (2px)
  xs: number;  // Extra small (4px)
  sm: number;  // Small (8px)
  md: number;  // Medium (12px)
  lg: number;  // Large (16px)
  xl: number;  // Extra large (24px)
  xxl: number; // Extra extra large (32px)
}

/**
 * Spacing scale multipliers based on Material Design 3 specifications
 * @constant
 */
const SPACING_SCALE: SpacingScale = {
  xxs: 0.25, // 2px
  xs: 0.5,   // 4px
  sm: 1,     // 8px
  md: 1.5,   // 12px
  lg: 2,     // 16px
  xl: 3,     // 24px
  xxl: 4     // 32px
};

/**
 * Type for memoization cache entries
 */
type CacheEntry = {
  multiplier: number;
  value: number;
};

/**
 * Memoization cache for spacing calculations
 */
const memoizationCache: CacheEntry[] = [];

/**
 * Creates a pixel-based spacing value by multiplying the base unit with a provided multiplier
 * @param multiplier - Number to multiply the base unit by
 * @returns Calculated spacing value in pixels
 * @throws {Error} If multiplier is negative or not a number
 */
export const createSpacing = (multiplier: number): number => {
  // Input validation
  if (typeof multiplier !== 'number' || multiplier < 0) {
    throw new Error('Spacing multiplier must be a non-negative number');
  }

  // Check memoization cache
  const cachedResult = memoizationCache.find(
    entry => entry.multiplier === multiplier
  );
  if (cachedResult) {
    return cachedResult.value;
  }

  // Calculate new spacing value
  const value = Math.round(BASE_UNIT * multiplier);

  // Update memoization cache
  memoizationCache.unshift({ multiplier, value });
  if (memoizationCache.length > MEMOIZATION_CACHE_SIZE) {
    memoizationCache.pop();
  }

  return value;
};

/**
 * Pre-calculated spacing values based on the spacing scale
 * @constant
 */
const DEFAULT_SPACING_VALUES: Record<keyof SpacingScale, number> = Object.entries(
  SPACING_SCALE
).reduce((acc, [key, multiplier]) => ({
  ...acc,
  [key]: createSpacing(multiplier)
}), {} as Record<keyof SpacingScale, number>);

/**
 * Exported spacing object providing standardized spacing values
 * following Material Design 3 principles
 */
export const spacing = {
  /**
   * Extra extra small spacing (2px)
   */
  xxs: DEFAULT_SPACING_VALUES.xxs,

  /**
   * Extra small spacing (4px)
   */
  xs: DEFAULT_SPACING_VALUES.xs,

  /**
   * Small spacing (8px)
   */
  sm: DEFAULT_SPACING_VALUES.sm,

  /**
   * Medium spacing (12px)
   */
  md: DEFAULT_SPACING_VALUES.md,

  /**
   * Large spacing (16px)
   */
  lg: DEFAULT_SPACING_VALUES.lg,

  /**
   * Extra large spacing (24px)
   */
  xl: DEFAULT_SPACING_VALUES.xl,

  /**
   * Extra extra large spacing (32px)
   */
  xxl: DEFAULT_SPACING_VALUES.xxl,

  /**
   * Creates a custom spacing value
   * @param multiplier - Custom multiplier for base unit
   */
  custom: createSpacing
} as const;

// Type assertion to ensure spacing object is read-only
Object.freeze(spacing);
```

This implementation provides a comprehensive Material Design 3 compliant spacing system with the following features:

1. Base 8px grid system with predefined scale multipliers
2. Type-safe interfaces and constants
3. Memoized spacing calculations for performance
4. Frozen spacing object to prevent modifications
5. Extensive documentation and type definitions
6. Input validation for custom spacing calculations
7. Pre-calculated default spacing values
8. Support for custom spacing calculations

The spacing system can be used throughout the application to maintain consistent spacing following Material Design principles. The exported `spacing` object provides both predefined values and a `custom` method for specific use cases.

Example usage:
```typescript
import { spacing } from './spacing';

// Using predefined values
margin: `${spacing.md}px`;  // 12px
padding: `${spacing.lg}px`; // 16px

// Using custom spacing
gap: `${spacing.custom(1.75)}px`; // 14px