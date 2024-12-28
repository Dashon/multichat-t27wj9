import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import { Paper } from '@mui/material'; // v5.14+
import { useTheme } from '@mui/material/styles'; // v5.14+
import { SPACING } from '../../styles/dimensions';
import { lightColors, darkColors } from '../../styles/colors';

/**
 * Props interface for the Card component with enhanced interaction and styling options
 */
interface CardProps {
  children: React.ReactNode;
  elevation?: number;
  onClick?: () => void;
  className?: string;
  noPadding?: boolean;
  interactive?: boolean;
  role?: string;
  tabIndex?: number;
}

/**
 * StyledPaper component with theme-aware styling and interactive states
 */
const StyledPaper = styled(Paper, {
  shouldForwardProp: (prop) => 
    !['interactive', 'noPadding'].includes(prop as string),
})<{
  interactive?: boolean;
  noPadding?: boolean;
}>(({ theme, interactive, noPadding, elevation = 1 }) => ({
  // Base styles
  padding: noPadding ? 0 : `${SPACING.md}px`,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  backgroundColor: theme.palette.mode === 'light' 
    ? lightColors.background.paper 
    : darkColors.background.paper,
  color: theme.palette.mode === 'light'
    ? lightColors.text.primary
    : darkColors.text.primary,
  borderRadius: '8px',
  cursor: interactive ? 'pointer' : 'default',
  outline: 'none',
  position: 'relative',
  overflow: 'hidden',

  // Responsive padding adjustments
  [theme.breakpoints.up('sm')]: {
    padding: noPadding ? 0 : `${SPACING.lg}px`,
  },

  // Interactive states
  ...(interactive && {
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows[elevation + 1],
      backgroundColor: theme.palette.mode === 'light'
        ? lightColors.interaction.hover
        : darkColors.interaction.hover,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: '2px',
    },
    '&:active': {
      transform: 'translateY(0)',
      backgroundColor: theme.palette.mode === 'light'
        ? lightColors.interaction.pressed
        : darkColors.interaction.pressed,
    },
  }),

  // Elevation transitions
  '@media (prefers-reduced-motion: no-preference)': {
    transition: theme.transitions.create(
      ['transform', 'box-shadow', 'background-color'],
      {
        duration: theme.transitions.duration.shorter,
        easing: theme.transitions.easing.easeInOut,
      }
    ),
  },
}));

/**
 * Card component that provides a themed container with elevation and interactive states
 * following Material Design 3 principles.
 * 
 * @param {CardProps} props - Component props
 * @returns {JSX.Element} Rendered card component
 */
export const Card: React.FC<CardProps> = ({
  children,
  elevation = 1,
  onClick,
  className,
  noPadding = false,
  interactive = false,
  role,
  tabIndex,
}) => {
  const theme = useTheme();

  // Determine appropriate ARIA role based on interactivity
  const ariaRole = role || (interactive ? 'button' : 'article');
  
  // Set appropriate tabIndex for interactive elements
  const computedTabIndex = tabIndex ?? (interactive ? 0 : undefined);

  return (
    <StyledPaper
      elevation={elevation}
      onClick={onClick}
      className={className}
      noPadding={noPadding}
      interactive={interactive}
      role={ariaRole}
      tabIndex={computedTabIndex}
      aria-disabled={!interactive}
      component={interactive ? 'button' : 'div'}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (interactive && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </StyledPaper>
  );
};

export default Card;