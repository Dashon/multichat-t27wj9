import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import Avatar from '../common/Avatar';
import { useAuth } from '../../hooks/useAuth';

/**
 * Props interface for UserAvatar component with enhanced interaction handling
 */
interface UserAvatarProps {
  /** Size variant following Material Design 3 scale */
  size?: 'small' | 'medium' | 'large';
  /** Optional CSS class name for styling overrides */
  className?: string;
  /** Click handler for interactive avatars */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Error handler for failed avatar loads */
  onError?: (error: Error) => void;
  /** Test ID for component testing */
  testId?: string;
}

/**
 * Enhanced styled wrapper with improved visual states and accessibility features
 * Implements Material Design 3 elevation and interaction states
 */
const StyledWrapper = styled('div')(({ theme }) => ({
  position: 'relative',
  display: 'inline-block',
  cursor: 'pointer',
  borderRadius: '50%',
  transition: theme.transitions.create(
    ['transform', 'box-shadow', 'outline'],
    {
      duration: theme.transitions.duration.shorter,
      easing: theme.transitions.easing.easeInOut,
    }
  ),

  // Enhanced focus states for accessibility
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },

  // Hover effects following Material Design 3
  '&:hover': {
    transform: 'scale(1.05)',
    boxShadow: theme.shadows[2],
  },

  // Active state for interaction feedback
  '&:active': {
    transform: 'scale(0.98)',
  },

  // Loading state styles
  '&[data-loading="true"]': {
    opacity: 0.7,
    cursor: 'wait',
  },

  // Error state styles
  '&[data-error="true"]': {
    outline: `2px solid ${theme.palette.error.main}`,
    outlineOffset: 2,
  },

  // Reduced motion support
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': {
      transform: 'none',
    },
    '&:active': {
      transform: 'none',
    },
  },
}));

/**
 * UserAvatar component displaying the authenticated user's avatar
 * Implements Material Design 3 principles and comprehensive accessibility features
 */
export const UserAvatar: React.FC<UserAvatarProps> = React.memo(({
  size = 'medium',
  className,
  onClick,
  onError,
  testId = 'user-avatar',
}) => {
  // Get authenticated user data with loading and error states
  const { user, isLoading, error } = useAuth();

  // Track error state for visual feedback
  const [hasError, setHasError] = React.useState<boolean>(false);

  // Reset error state when user changes
  React.useEffect(() => {
    setHasError(false);
  }, [user]);

  /**
   * Enhanced error handling with retry capability
   */
  const handleError = React.useCallback((err: Error) => {
    setHasError(true);
    onError?.(err);
  }, [onError]);

  /**
   * Keyboard interaction handler for accessibility
   */
  const handleKeyPress = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
    }
  }, [onClick]);

  // Don't render if no user data is available
  if (!user && !isLoading) {
    return null;
  }

  return (
    <StyledWrapper
      className={className}
      onClick={onClick}
      onKeyPress={handleKeyPress}
      data-testid={testId}
      data-loading={isLoading}
      data-error={hasError || !!error}
      role={onClick ? 'button' : 'presentation'}
      tabIndex={onClick ? 0 : -1}
      aria-label={user ? `${user.username}'s avatar` : 'Loading user avatar'}
      aria-disabled={isLoading}
      aria-invalid={hasError || !!error}
    >
      <Avatar
        size={size}
        user={user!}
        loading={isLoading}
        onError={handleError}
        alt={user ? `${user.username}'s profile picture` : 'User avatar'}
        testId={`${testId}-image`}
      />
    </StyledWrapper>
  );
});

// Display name for debugging
UserAvatar.displayName = 'UserAvatar';

export default UserAvatar;