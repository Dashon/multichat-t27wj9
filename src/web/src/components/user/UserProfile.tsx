import React from 'react'; // v18.2+
import { styled } from '@mui/material/styles'; // v5.14+
import { 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Skeleton,
  useTheme,
  Box,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material'; // v5.14+
import EditIcon from '@mui/icons-material/Edit'; // v5.14+
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'; // v5.14+

import { User } from '../../types/user';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../hooks/useAuth';
import { SPACING } from '../../styles/dimensions';

/**
 * Props interface for UserProfile component with enhanced type safety
 */
interface UserProfileProps {
  className?: string;
  onEdit?: (user: User) => Promise<void>;
  onError?: (error: Error) => void;
  testId?: string;
}

/**
 * Styled components following Material Design 3 principles
 */
const StyledCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[2],
  transition: theme.transitions.create(['box-shadow']),
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  
  '&:hover': {
    boxShadow: theme.shadows[4],
  },

  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

const ProfileHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.md,
  marginBottom: SPACING.md,

  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    textAlign: 'center',
  },
}));

const ProfileContent = styled(CardContent)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.md,
  padding: `${SPACING.md}px 0`,

  '&:last-child': {
    paddingBottom: 0,
  },
}));

const ProfileField = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.xs,
}));

/**
 * Formats date strings with internationalization support
 */
const formatDate = (dateString: string, options: Intl.DateTimeFormatOptions = {}): string => {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...options,
    }).format(date);
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid date';
  }
};

/**
 * UserProfile component displaying user information with Material Design 3 styling
 * Implements WCAG 2.1 Level AA accessibility standards
 */
export const UserProfile: React.FC<UserProfileProps> = React.memo(({
  className,
  onEdit,
  onError,
  testId = 'user-profile',
}) => {
  const theme = useTheme();
  const { user, isLoading, error } = useAuth();

  // Handle edit action with error boundary
  const handleEdit = async () => {
    if (!user || !onEdit) return;

    try {
      await onEdit(user);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Edit failed'));
    }
  };

  // Show loading state
  if (isLoading || !user) {
    return (
      <StyledCard className={className} data-testid={`${testId}-loading`}>
        <ProfileHeader>
          <Skeleton variant="circular" width={80} height={80} />
          <Box flex={1}>
            <Skeleton variant="text" width="60%" height={32} />
            <Skeleton variant="text" width="40%" height={24} />
          </Box>
        </ProfileHeader>
        <Divider />
        <ProfileContent>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="text" width="100%" height={24} />
          ))}
        </ProfileContent>
      </StyledCard>
    );
  }

  // Show error state
  if (error) {
    return (
      <StyledCard 
        className={className} 
        data-testid={`${testId}-error`}
        role="alert"
        aria-live="polite"
      >
        <Box display="flex" alignItems="center" gap={1} color="error.main">
          <ErrorOutlineIcon />
          <Typography variant="body1">
            {error.message || 'Failed to load profile'}
          </Typography>
        </Box>
      </StyledCard>
    );
  }

  return (
    <StyledCard 
      className={className} 
      data-testid={testId}
      role="region"
      aria-label="User Profile"
    >
      <ProfileHeader>
        <Avatar 
          user={user} 
          size="large"
          alt={`${user.username}'s profile picture`}
        />
        <Box flex={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h5" component="h1">
              {user.username}
            </Typography>
            {onEdit && (
              <Tooltip title="Edit Profile" arrow>
                <IconButton
                  onClick={handleEdit}
                  aria-label="Edit profile"
                  size="small"
                  color="primary"
                >
                  <EditIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Typography 
            variant="body2" 
            color="text.secondary"
            component="p"
          >
            Member since {formatDate(user.createdAt, { dateStyle: 'long' })}
          </Typography>
        </Box>
      </ProfileHeader>

      <Divider />

      <ProfileContent>
        <ProfileField>
          <Typography variant="subtitle2" color="text.secondary">
            Email
          </Typography>
          <Typography variant="body1">{user.email}</Typography>
        </ProfileField>

        <ProfileField>
          <Typography variant="subtitle2" color="text.secondary">
            Last Active
          </Typography>
          <Typography variant="body1">
            {formatDate(user.lastActive)}
          </Typography>
        </ProfileField>

        <ProfileField>
          <Typography variant="subtitle2" color="text.secondary">
            Theme Preference
          </Typography>
          <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
            {user.settings.theme.toLowerCase()}
          </Typography>
        </ProfileField>

        {user.settings.highContrast && (
          <Typography 
            variant="body2" 
            color="primary"
            sx={{ mt: 2 }}
          >
            High Contrast Mode Enabled
          </Typography>
        )}
      </ProfileContent>
    </StyledCard>
  );
});

UserProfile.displayName = 'UserProfile';

export default UserProfile;