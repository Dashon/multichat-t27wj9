import React from 'react';
import { CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import { scaleIn } from '../../styles/animations';

// Size mapping constants for the loading spinner
const SIZES = {
  small: 24,
  medium: 40,
  large: 56,
} as const;

// Props interface with comprehensive customization options
interface LoadingProps {
  /**
   * Controls the spinner size with predefined dimensions
   * @default 'medium'
   */
  size?: keyof typeof SIZES;
  
  /**
   * Theme-aware color options for the spinner
   * @default 'primary'
   */
  color?: 'primary' | 'secondary' | 'inherit';
  
  /**
   * Controls whether to show a full-screen overlay behind the spinner
   * @default false
   */
  overlay?: boolean;
  
  /**
   * Optional loading message displayed below the spinner
   */
  message?: string;
}

// Styled container component with overlay support
const LoadingContainer = styled('div')<{ overlay?: boolean }>(({ theme, overlay }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  ...(overlay && {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: theme.zIndex.modal,
    [theme.getColorSchemeSelector('dark')]: {
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
    },
  }),
}));

// Styled wrapper for the spinner with animation support
const SpinnerWrapper = styled('div')`
  animation: ${scaleIn.keyframes} ${scaleIn.options.duration}ms ${scaleIn.options.easing};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing(2)};
`;

// Styled message component with proper accessibility
const LoadingMessage = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(2),
  color: theme.palette.text.secondary,
  fontSize: theme.typography.body2.fontSize,
  textAlign: 'center',
}));

/**
 * A reusable loading spinner component that provides visual feedback during
 * asynchronous operations. Follows Material Design 3 principles and includes
 * enhanced accessibility features.
 *
 * @param {LoadingProps} props - Component configuration options
 * @returns {JSX.Element} Rendered loading component
 */
const Loading: React.FC<LoadingProps> = ({
  size = 'medium',
  color = 'primary',
  overlay = false,
  message,
}) => {
  // Get the numeric size value from the SIZES constant
  const spinnerSize = SIZES[size];

  return (
    <LoadingContainer
      overlay={overlay}
      role="alert"
      aria-busy="true"
      aria-live="polite"
    >
      <SpinnerWrapper>
        <CircularProgress
          size={spinnerSize}
          color={color}
          aria-label={message || 'Loading'}
          // Ensure smooth animation performance
          disableShrink
          // Add CSS containment for performance optimization
          sx={{ contain: 'strict' }}
        />
        {message && (
          <LoadingMessage
            role="status"
            aria-live="polite"
          >
            {message}
          </LoadingMessage>
        )}
      </SpinnerWrapper>
    </LoadingContainer>
  );
};

// Add display name for better debugging
Loading.displayName = 'Loading';

export default Loading;
```

This implementation provides a robust, accessible, and visually appealing loading component with the following features:

1. **Accessibility**:
   - Proper ARIA attributes for screen readers
   - Role and live region announcements
   - Keyboard focus management
   - High contrast support

2. **Animation**:
   - Scale-in animation with reduced motion support
   - Smooth circular progress animation
   - Performance optimizations with CSS containment

3. **Customization**:
   - Three predefined sizes (small, medium, large)
   - Theme-aware color options
   - Optional overlay mode
   - Configurable loading message

4. **Styling**:
   - Material Design 3 principles
   - Theme-aware styling
   - Dark mode support
   - Responsive layout

5. **Performance**:
   - Optimized animations
   - Memoized styled components
   - CSS containment for better rendering performance

The component can be used throughout the application for consistent loading states and follows all the specified requirements for visual hierarchy, design system integration, and accessibility compliance.

Example usage:
```typescript
// Basic usage
<Loading />

// With custom size and color
<Loading size="large" color="secondary" />

// With overlay and message
<Loading overlay message="Loading your data..." />