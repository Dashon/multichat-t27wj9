/**
 * @fileoverview Reusable icon component implementing Material Design 3 principles
 * with comprehensive accessibility support and theme integration
 * @version 1.0.0
 */

import React from 'react'; // v18.2+
import { styled, useTheme } from '@mui/material/styles'; // v5.14+
import { Icon as MuiIcon } from '@mui/material'; // v5.14+

// Internal theme imports
import { ANIMATION_DURATION, EASING, REDUCED_MOTION_QUERY } from '../../styles/animations';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for the Icon component with comprehensive accessibility support
 */
interface IconProps {
  /** Name of the icon from Material Icons font */
  name: string;
  /** Size variant of the icon with proper touch target sizes */
  size?: 'small' | 'medium' | 'large';
  /** Color variant of the icon from theme palette */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit';
  /** Whether the icon should appear disabled */
  disabled?: boolean;
  /** Optional click handler for interactive icons */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Required accessibility label for screen readers */
  ariaLabel: string;
  /** Whether the icon should be focusable via keyboard */
  focusable?: boolean;
  /** Respects user's reduced motion preferences */
  reducedMotion?: boolean;
}

/**
 * Styled icon component with theme integration and accessibility features
 */
const StyledIcon = styled(MuiIcon, {
  shouldForwardProp: (prop) => 
    !['size', 'disabled', 'focusable', 'reducedMotion'].includes(prop as string),
})<IconProps>(({ theme, size = 'medium', disabled, focusable, reducedMotion }) => ({
  // Base styles
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  userSelect: 'none',
  verticalAlign: 'middle',
  
  // Size variants with proper touch targets
  ...(size === 'small' && {
    fontSize: theme.typography.pxToRem(20),
    padding: theme.spacing(1),
    width: theme.spacing(4),
    height: theme.spacing(4),
  }),
  ...(size === 'medium' && {
    fontSize: theme.typography.pxToRem(24),
    padding: theme.spacing(1.5),
    width: theme.spacing(5),
    height: theme.spacing(5),
  }),
  ...(size === 'large' && {
    fontSize: theme.typography.pxToRem(32),
    padding: theme.spacing(2),
    width: theme.spacing(6),
    height: theme.spacing(6),
  }),

  // Transition handling with reduced motion support
  transition: !reducedMotion 
    ? theme.transitions.create(['color', 'transform', 'opacity'], {
        duration: ANIMATION_DURATION.NORMAL,
        easing: EASING.STANDARD,
      })
    : 'none',

  // Interactive states
  ...(focusable && {
    cursor: 'pointer',
    '&:hover': {
      opacity: 0.8,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: '2px',
    },
    '&:active': {
      transform: !reducedMotion ? 'scale(0.95)' : 'none',
    },
  }),

  // Disabled state
  ...(disabled && {
    opacity: 0.38,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  }),

  // Reduced motion preferences
  [REDUCED_MOTION_QUERY]: {
    transition: 'none',
    transform: 'none',
  },
}));

/**
 * Icon component that renders Material Design icons with comprehensive
 * accessibility support and theme integration
 */
const Icon: React.FC<IconProps> = ({
  name,
  size = 'medium',
  color = 'inherit',
  disabled = false,
  onClick,
  className,
  ariaLabel,
  focusable = !!onClick,
  reducedMotion = false,
}) => {
  const theme = useTheme();

  return (
    <StyledIcon
      className={className}
      size={size}
      color={color}
      disabled={disabled}
      focusable={focusable}
      reducedMotion={reducedMotion}
      onClick={!disabled ? onClick : undefined}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      role={onClick ? 'button' : 'img'}
      tabIndex={focusable ? 0 : -1}
    >
      {name}
    </StyledIcon>
  );
};

export default Icon;