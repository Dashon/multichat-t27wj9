import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import Avatar as MuiAvatar from '@mui/material'; // v5.14+
import { User } from '../../types/user';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for the Avatar component
 * Provides comprehensive type safety and documentation
 */
interface AvatarProps {
  /** Size variant following Material Design 3 scale */
  size?: 'small' | 'medium' | 'large';
  /** User object containing profile information */
  user: User;
  /** Loading state for skeleton display */
  loading?: boolean;
  /** Optional CSS class name for styling overrides */
  className?: string;
  /** Click handler for interactive avatars */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Alternative text for accessibility */
  alt?: string;
  /** Test ID for component testing */
  testId?: string;
}

/**
 * Styled wrapper for MUI Avatar with enhanced theme integration
 * Implements Material Design 3 elevation and interaction states
 */
const StyledAvatar = styled(MuiAvatar, {
  shouldForwardProp: prop => !['size', 'loading'].includes(prop as string),
})<{ size: string; loading?: boolean; onClick?: Function }>(
  ({ theme, size, loading, onClick }) => ({
    width: getAvatarSize(size),
    height: getAvatarSize(size),
    opacity: loading ? 0.6 : 1,
    transition: theme.transitions.create(
      ['transform', 'box-shadow', 'opacity'],
      {
        duration: theme.transitions.duration.shorter,
        easing: theme.transitions.easing.easeInOut,
      }
    ),
    cursor: onClick ? 'pointer' : 'default',
    boxShadow: theme.shadows[1],
    
    // Hover styles for interactive avatars
    ...(onClick && {
      '&:hover': {
        transform: 'scale(1.05)',
        boxShadow: theme.shadows[2],
      },
      '&:active': {
        transform: 'scale(0.98)',
      },
    }),

    // Focus styles for keyboard navigation
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  })
);

/**
 * Extracts initials from username with error handling
 * @param username - User's display name
 * @returns Formatted initials or fallback
 */
const getInitials = React.useMemo((username: string): string => {
  if (!username?.trim()) return '?';

  const sanitizedName = username.trim().replace(/[^a-zA-Z\s]/g, '');
  const words = sanitizedName.split(/\s+/);
  
  if (words.length === 0) return '?';
  
  const firstInitial = words[0].charAt(0);
  const secondInitial = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  
  return (firstInitial + secondInitial).toUpperCase().slice(0, 2) || '?';
}, []);

/**
 * Maps size prop to pixel dimensions using design system tokens
 * @param size - Size variant
 * @returns Pixel value for avatar dimension
 */
const getAvatarSize = React.useMemo((size: string): number => {
  switch (size) {
    case 'small':
      return SPACING.sm; // 16px
    case 'medium':
      return SPACING.md; // 24px
    case 'large':
      return SPACING.lg; // 32px
    default:
      return SPACING.md; // Default to medium
  }
}, []);

/**
 * Avatar component displaying user profile image or initials
 * Implements Material Design 3 principles and accessibility features
 */
export const Avatar: React.FC<AvatarProps> = React.memo(({
  size = 'medium',
  user,
  loading = false,
  className,
  onClick,
  alt,
  testId = 'avatar',
}) => {
  // Generate user initials for fallback
  const initials = React.useMemo(() => getInitials(user.username), [user.username]);

  // Handle image load error
  const [hasError, setHasError] = React.useState(false);
  const handleError = () => setHasError(true);

  return (
    <StyledAvatar
      size={size}
      loading={loading}
      onClick={onClick}
      className={className}
      data-testid={testId}
      src={!hasError ? user.avatarUrl : undefined}
      onError={handleError}
      alt={alt || `${user.username}'s avatar`}
      aria-label={alt || `${user.username}'s avatar`}
      role={onClick ? 'button' : 'img'}
      tabIndex={onClick ? 0 : -1}
    >
      {initials}
    </StyledAvatar>
  );
});

Avatar.displayName = 'Avatar';

export default Avatar;