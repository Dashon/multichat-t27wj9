/**
 * @fileoverview Typography system configuration following Material Design 3 principles
 * Implements WCAG 2.1 Level AA compliance with enhanced support for chat interface elements
 * @version 1.0.0
 */

import { TypographyOptions } from '@mui/material/styles'; // v5.14+
import { FONT_FAMILY, FONT_WEIGHT } from './fonts';

/**
 * Font size scale following Material Design type system
 * Enhanced with chat-specific variants for optimal readability
 */
const FONT_SIZES = {
  // Base scale
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 48,

  // Chat-specific variants
  messageBody: 16,
  messageTimestamp: 12,
  userName: 14,
  aiAgentName: 14,
  threadTitle: 18,
} as const;

/**
 * Line height scale optimized for readability and vertical rhythm
 * Specific values for chat interface elements
 */
const LINE_HEIGHTS = {
  // Base scale
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,

  // Chat-specific variants
  message: 1.6,    // Optimized for message readability
  timestamp: 1.2,  // Compact for auxiliary information
  userName: 1.4,   // Balanced for user identification
  threadTitle: 1.3 // Compact but clear for thread headers
} as const;

/**
 * Letter spacing configurations for different text styles
 * Enhanced spacing for better distinction between different message types
 */
const LETTER_SPACING = {
  // Base scale
  tight: '-0.02em',
  normal: '0em',
  wide: '0.02em',

  // Chat-specific variants
  message: '0.01em',   // Slightly enhanced for better readability
  timestamp: '0em',    // Default spacing for timestamps
  userName: '0.02em',  // Wider for better user name distinction
  aiAgent: '0.03em'    // Widest for AI agent name emphasis
} as const;

/**
 * Creates a typography variant with specified properties
 * Ensures consistent styling across different text elements
 */
const createTypographyVariant = (options: {
  fontFamily?: keyof typeof FONT_FAMILY;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: string;
}) => ({
  fontFamily: FONT_FAMILY[options.fontFamily || 'primary'],
  fontSize: options.fontSize,
  fontWeight: options.fontWeight,
  lineHeight: options.lineHeight,
  letterSpacing: options.letterSpacing || LETTER_SPACING.normal,
  textTransform: options.textTransform || 'none',
});

/**
 * Typography configuration for the application
 * Implements Material Design type scale with chat-specific enhancements
 */
export const typography: TypographyOptions = {
  fontFamily: FONT_FAMILY.primary,
  fontSize: 16,

  // Standard Material Design variants
  h1: createTypographyVariant({
    fontSize: FONT_SIZES.display,
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: LINE_HEIGHTS.tight,
    letterSpacing: LETTER_SPACING.tight,
  }),

  h2: createTypographyVariant({
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: LINE_HEIGHTS.tight,
    letterSpacing: LETTER_SPACING.tight,
  }),

  h3: createTypographyVariant({
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: LINE_HEIGHTS.tight,
  }),

  h4: createTypographyVariant({
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: LINE_HEIGHTS.normal,
  }),

  body1: createTypographyVariant({
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHTS.normal,
  }),

  body2: createTypographyVariant({
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHTS.normal,
  }),

  // Chat-specific variants
  messageBody: createTypographyVariant({
    fontSize: FONT_SIZES.messageBody,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHTS.message,
    letterSpacing: LETTER_SPACING.message,
  }),

  messageTimestamp: createTypographyVariant({
    fontFamily: 'secondary',
    fontSize: FONT_SIZES.messageTimestamp,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHTS.timestamp,
    letterSpacing: LETTER_SPACING.timestamp,
  }),

  userName: createTypographyVariant({
    fontFamily: 'secondary',
    fontSize: FONT_SIZES.userName,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: LINE_HEIGHTS.userName,
    letterSpacing: LETTER_SPACING.userName,
  }),

  aiAgentName: createTypographyVariant({
    fontFamily: 'secondary',
    fontSize: FONT_SIZES.aiAgentName,
    fontWeight: FONT_WEIGHT.semibold,
    lineHeight: LINE_HEIGHTS.userName,
    letterSpacing: LETTER_SPACING.aiAgent,
  }),

  threadTitle: createTypographyVariant({
    fontSize: FONT_SIZES.threadTitle,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: LINE_HEIGHTS.threadTitle,
    letterSpacing: LETTER_SPACING.normal,
  }),

  // Additional utility variants
  button: createTypographyVariant({
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: LINE_HEIGHTS.normal,
    letterSpacing: LETTER_SPACING.wide,
    textTransform: 'uppercase',
  }),

  caption: createTypographyVariant({
    fontFamily: 'secondary',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHTS.normal,
  }),
};

// Type augmentation for custom variants
declare module '@mui/material/styles' {
  interface TypographyVariants {
    messageBody: React.CSSProperties;
    messageTimestamp: React.CSSProperties;
    userName: React.CSSProperties;
    aiAgentName: React.CSSProperties;
    threadTitle: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    messageBody?: React.CSSProperties;
    messageTimestamp?: React.CSSProperties;
    userName?: React.CSSProperties;
    aiAgentName?: React.CSSProperties;
    threadTitle?: React.CSSProperties;
  }
}

// Update Typography's variant prop options
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    messageBody: true;
    messageTimestamp: true;
    userName: true;
    aiAgentName: true;
    threadTitle: true;
  }
}