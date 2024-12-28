/**
 * @fileoverview Badge component following Material Design 3 principles
 * Provides visual indicators for status, counts, and notifications with enhanced accessibility
 * @version 1.0.0
 */

import React, { FC } from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import Box from '@mui/material/Box'; // v5.14+

// Internal theme imports
import { lightTheme, darkTheme } from '../../styles/theme';

/**
 * Props interface for Badge component with enhanced accessibility support
 */
interface BadgeProps {
  /** Content to be displayed inside the badge */
  content: React.ReactNode | number | string;
  /** Visual style variant of the badge */
  variant?: 'standard' | 'dot' | 'count';
  /** Color scheme following Material Design tokens */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  /** Size variant affecting badge dimensions */
  size?: 'small' | 'medium' | 'large';
  /** Maximum number to display before showing + suffix */
  max?: number;
  /** Optional CSS class name */
  className?: string;
  /** Accessibility label for screen readers */
  ariaLabel?: string;
  /** ARIA role for semantic meaning */
  role?: string;
}

/**
 * Size configurations following Material Design touch targets
 */
const BADGE_SIZES = {
  small: {
    height: '20px',
    minWidth: '20px',
    fontSize: '0.75rem',
    padding: '0 4px',
    touchTarget: '44px'
  },
  medium: {
    height: '24px',
    minWidth: '24px',
    fontSize: '0.875rem',
    padding: '0 6px',
    touchTarget: '44px'
  },
  large: {
    height: '28px',
    minWidth: '28px',
    fontSize: '1rem',
    padding: '0 8px',
    touchTarget: '44px'
  }
} as const;

/**
 * Styled component for badge with enhanced accessibility and mobile support
 */
const StyledBadge = styled(Box, {
  shouldForwardProp: (prop) => 
    !['variant', 'badgeColor', 'badgeSize'].includes(prop as string)
})<{
  variant: BadgeProps['variant'];
  badgeColor: BadgeProps['color'];
  badgeSize: BadgeProps['size'];
}>(({ theme, variant, badgeColor = 'primary', badgeSize = 'medium' }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  boxSizing: 'border-box',
  height: BADGE_SIZES[badgeSize].height,
  minWidth: variant === 'dot' ? BADGE_SIZES[badgeSize].height : BADGE_SIZES[badgeSize].minWidth,
  padding: variant === 'dot' ? 0 : BADGE_SIZES[badgeSize].padding,
  borderRadius: '10px',
  backgroundColor: theme.palette[badgeColor].main,
  color: theme.palette[badgeColor].contrastText,
  fontSize: BADGE_SIZES[badgeSize].fontSize,
  fontWeight: theme.typography.fontWeightMedium,
  lineHeight: 1,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  transition: theme.transitions.create(
    ['background-color', 'color', 'transform'],
    {
      duration: theme.transitions.duration.shorter,
      easing: theme.transitions.easing.easeInOut,
    }
  ),

  // Enhanced touch target for mobile
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: BADGE_SIZES[badgeSize].touchTarget,
    height: BADGE_SIZES[badgeSize].touchTarget,
    zIndex: -1,
  },

  // High contrast mode support
  '@media (forced-colors: active)': {
    outline: '1px solid transparent',
    forcedColorAdjust: 'none',
  },

  // Reduced motion support
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },

  // Focus styles for keyboard navigation
  '&:focus-visible': {
    outline: `2px solid ${theme.palette[badgeColor].main}`,
    outlineOffset: '2px',
  },

  // Dot variant specific styles
  ...(variant === 'dot' && {
    borderRadius: '50%',
    padding: 0,
  }),
}));

/**
 * Badge component for displaying status indicators and counts
 * Follows Material Design 3 principles with enhanced accessibility
 */
export const Badge: FC<BadgeProps> = ({
  content,
  variant = 'standard',
  color = 'primary',
  size = 'medium',
  max = 99,
  className,
  ariaLabel,
  role = 'status',
}) => {
  // Calculate display content based on variant and max value
  const displayContent = React.useMemo(() => {
    if (variant === 'dot') return '';
    if (typeof content === 'number' && content > max) {
      return `${max}+`;
    }
    return content;
  }, [content, variant, max]);

  return (
    <StyledBadge
      variant={variant}
      badgeColor={color}
      badgeSize={size}
      className={className}
      aria-label={ariaLabel || (typeof content === 'number' ? `Count: ${content}` : String(content))}
      role={role}
      component="span"
    >
      {displayContent}
    </StyledBadge>
  );
};

export default Badge;