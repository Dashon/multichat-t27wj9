/**
 * Divider.tsx
 * A reusable divider component following Material Design 3 principles
 * @version 1.0.0
 */

import { styled } from '@mui/material/styles';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for the Divider component
 */
interface DividerProps {
  /**
   * Determines the direction of the divider
   * @default 'horizontal'
   */
  orientation?: 'vertical' | 'horizontal';
  
  /**
   * Width of the divider line in pixels
   * @default 1
   */
  thickness?: number;
  
  /**
   * Space around the divider in pixels
   * @default SPACING.xs (8px)
   */
  margin?: number;
  
  /**
   * Additional CSS classes for custom styling
   */
  className?: string;
}

/**
 * Styled component for the divider with theme-aware styling
 */
const StyledDivider = styled(Box, {
  shouldForwardProp: (prop) => 
    !['orientation', 'thickness', 'margin'].includes(prop as string),
})<DividerProps>(({ theme, orientation = 'horizontal', thickness = 1, margin = SPACING.xs }) => ({
  backgroundColor: theme.palette.divider,
  transition: theme.transitions.create(['background-color'], {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
  margin: orientation === 'vertical' ? `0 ${margin}px` : `${margin}px 0`,
  width: orientation === 'vertical' ? `${thickness}px` : '100%',
  height: orientation === 'horizontal' ? `${thickness}px` : '100%',
  flexShrink: 0,
  role: 'separator',
  'aria-orientation': orientation,
}));

/**
 * Divider component that provides visual separation between content sections
 * following Material Design 3 principles.
 *
 * @param {DividerProps} props - Component props
 * @returns {JSX.Element} Rendered divider component
 *
 * @example
 * // Horizontal divider with default settings
 * <Divider />
 *
 * @example
 * // Vertical divider with custom thickness
 * <Divider orientation="vertical" thickness={2} margin={16} />
 */
const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  thickness = 1,
  margin = SPACING.xs,
  className,
}) => {
  const theme = useTheme();

  return (
    <StyledDivider
      orientation={orientation}
      thickness={thickness}
      margin={margin}
      className={className}
      component="hr"
      aria-orientation={orientation}
      role="separator"
      data-testid="divider"
    />
  );
};

export default Divider;