/**
 * @fileoverview Enhanced button component implementing Material Design 3 principles
 * with comprehensive accessibility, motion controls, and theme support
 * @version 1.0.0
 */

import React, { forwardRef, useCallback } from 'react';
import { styled } from '@mui/material/styles'; // v5.14+
import Button from '@mui/material/Button'; // v5.14+
import useMediaQuery from '@mui/material/useMediaQuery'; // v5.14+
import CircularProgress from '@mui/material/CircularProgress'; // v5.14+

// Internal imports
import { lightTheme, darkTheme } from '../../styles/theme';
import { FONT_SIZES, TOUCH_TARGETS } from '../../styles/typography';

// Enhanced button props interface
interface ButtonProps {
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  reducedMotion?: boolean;
  ariaLabel?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

// Styled button component with enhanced features
const StyledButton = styled(Button, {
  shouldForwardProp: (prop) => 
    !['loading', 'reducedMotion'].includes(prop as string),
})<ButtonProps>(({ theme, variant, size, loading, reducedMotion }) => ({
  // Base styles
  borderRadius: theme.shape.borderRadius,
  textTransform: 'none',
  fontFamily: theme.typography.button.fontFamily,
  position: 'relative',
  overflow: 'hidden',
  minWidth: TOUCH_TARGETS.min,
  minHeight: TOUCH_TARGETS.min,

  // Transition handling
  transition: reducedMotion ? 'none' : theme.transitions.create([
    'background-color',
    'box-shadow',
    'border-color',
    'transform'
  ], {
    duration: theme.transitions.duration.short,
    easing: theme.transitions.easing.easeInOut,
  }),

  // Variant-specific styles
  ...(variant === 'contained' && {
    boxShadow: 'none',
    '&:hover': !reducedMotion && {
      boxShadow: theme.shadows[2],
      transform: 'translateY(-1px)',
    },
    '&:active': !reducedMotion && {
      transform: 'translateY(0)',
    },
  }),

  ...(variant === 'outlined' && {
    borderWidth: 2,
    '&:hover': {
      borderWidth: 2,
      backgroundColor: theme.palette.action.hover,
    },
  }),

  // Size-specific styles
  ...(size === 'small' && {
    padding: '6px 16px',
    fontSize: FONT_SIZES.sm,
    '@media (max-width: 600px)': {
      padding: '8px 16px',
    },
  }),

  ...(size === 'medium' && {
    padding: '8px 24px',
    fontSize: FONT_SIZES.md,
    '@media (max-width: 600px)': {
      padding: '12px 24px',
    },
  }),

  ...(size === 'large' && {
    padding: '12px 32px',
    fontSize: FONT_SIZES.lg,
    '@media (max-width: 600px)': {
      padding: '16px 32px',
    },
  }),

  // State-specific styles
  ...(loading && {
    opacity: 0.7,
    pointerEvents: 'none',
  }),

  // Enhanced focus styles for accessibility
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },

  // High contrast mode support
  '@media (forced-colors: active)': {
    borderColor: 'ButtonText',
    '&:focus-visible': {
      outline: '2px solid ButtonText',
    },
  },
}));

/**
 * Enhanced button component with comprehensive accessibility features
 * and responsive design
 */
export const CustomButton = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'contained',
      size = 'medium',
      color = 'primary',
      fullWidth = false,
      disabled = false,
      loading = false,
      reducedMotion = false,
      ariaLabel,
      startIcon,
      endIcon,
      onClick,
      onFocus,
      onBlur,
      children,
      ...props
    },
    ref
  ) => {
    // Check for reduced motion preference
    const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const shouldReduceMotion = reducedMotion || prefersReducedMotion;

    // Handle click with loading state
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!loading && !disabled && onClick) {
          onClick(event);
        }
      },
      [loading, disabled, onClick]
    );

    return (
      <StyledButton
        ref={ref}
        variant={variant}
        size={size}
        color={color}
        fullWidth={fullWidth}
        disabled={disabled}
        loading={loading}
        reducedMotion={shouldReduceMotion}
        onClick={handleClick}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel || typeof children === 'string' ? children as string : undefined}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        startIcon={!loading && startIcon}
        endIcon={!loading && endIcon}
        {...props}
      >
        {loading ? (
          <>
            <CircularProgress
              size={20}
              color="inherit"
              sx={{ 
                position: 'absolute',
                left: '50%',
                marginLeft: '-10px',
              }}
            />
            <span style={{ visibility: 'hidden' }}>{children}</span>
          </>
        ) : (
          children
        )}
      </StyledButton>
    );
  }
);

CustomButton.displayName = 'CustomButton';

export default CustomButton;