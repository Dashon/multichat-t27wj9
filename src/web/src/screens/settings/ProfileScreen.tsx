import React, { useCallback, useState } from 'react';
import { styled } from '@mui/material/styles';
import { 
  Container, 
  Box, 
  CircularProgress, 
  Alert,
  Typography,
  useTheme
} from '@mui/material';

import { User } from '../../types/user';
import UserProfile from '../../components/user/UserProfile';
import { useAuth } from '../../hooks/useAuth';
import { SPACING, BREAKPOINTS } from '../../styles/dimensions';

/**
 * Props interface for ProfileScreen component
 */
interface ProfileScreenProps {
  className?: string;
  onError?: (error: Error) => void;
}

/**
 * Styled components following Material Design 3 principles
 */
const StyledContainer = styled(Container)(({ theme }) => ({
  padding: theme.spacing(3),
  marginTop: SPACING.xl,
  marginBottom: SPACING.xl,
  minHeight: `calc(100vh - ${SPACING.headerHeight}px)`,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.md,

  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
}));

const ContentWrapper = styled(Box)(({ theme }) => ({
  maxWidth: BREAKPOINTS.md,
  width: '100%',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING.lg,
}));

const LoadingOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.palette.background.paper,
  opacity: 0.7,
  zIndex: theme.zIndex.modal,
}));

/**
 * ProfileScreen component providing comprehensive user profile management
 * Implements Material Design 3 principles and WCAG 2.1 Level AA accessibility
 */
export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  className,
  onError,
}) => {
  const theme = useTheme();
  const { user, isLoading, error: authError } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<Error | null>(null);

  /**
   * Handles profile update with error handling and loading states
   */
  const handleProfileUpdate = useCallback(async (updatedUser: User) => {
    try {
      setIsUpdating(true);
      setUpdateError(null);

      const response = await fetch('/api/v1/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify(updatedUser),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }

      // Trigger success notification
      // Note: Actual notification implementation would be handled by a notification system
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      setUpdateError(new Error(errorMessage));
      onError?.(new Error(errorMessage));
    } finally {
      setIsUpdating(false);
    }
  }, [onError]);

  /**
   * Handles error display reset
   */
  const handleErrorReset = useCallback(() => {
    setUpdateError(null);
  }, []);

  return (
    <StyledContainer 
      className={className}
      component="main"
      maxWidth="lg"
      data-testid="profile-screen"
    >
      <ContentWrapper>
        {/* Screen Title */}
        <Typography 
          variant="h4" 
          component="h1"
          sx={{ 
            color: theme.palette.text.primary,
            textAlign: { xs: 'center', sm: 'left' },
          }}
        >
          Profile Settings
        </Typography>

        {/* Error Messages */}
        {(authError || updateError) && (
          <Alert 
            severity="error" 
            onClose={handleErrorReset}
            sx={{ width: '100%' }}
          >
            {updateError?.message || authError?.message || 'An error occurred'}
          </Alert>
        )}

        {/* Profile Content */}
        <Box position="relative">
          <UserProfile
            onEdit={handleProfileUpdate}
            onError={onError}
            testId="profile-content"
          />
          
          {/* Loading Overlay */}
          {(isLoading || isUpdating) && (
            <LoadingOverlay>
              <CircularProgress 
                size={40}
                aria-label="Loading profile"
              />
            </LoadingOverlay>
          )}
        </Box>

        {/* Accessibility Information */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ 
            mt: SPACING.md,
            textAlign: 'center',
          }}
        >
          Press Tab to navigate through profile settings. 
          Use Enter or Space to activate buttons and controls.
        </Typography>
      </ContentWrapper>
    </StyledContainer>
  );
};

ProfileScreen.displayName = 'ProfileScreen';

export default ProfileScreen;