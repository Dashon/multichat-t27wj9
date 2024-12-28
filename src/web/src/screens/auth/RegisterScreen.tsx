/**
 * @fileoverview Registration screen component implementing secure user signup
 * Follows Material Design 3 principles with comprehensive validation and accessibility
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Button, 
  Link, 
  CircularProgress, 
  Alert,
  Box,
  LinearProgress
} from '@mui/material'; // v5.14.0
import { useTheme } from '@mui/material/styles'; // v5.14.0

// Internal imports
import Input from '../../components/common/Input';
import { RegisterData } from '../../types/user';
import { validateRegistrationData } from '../../utils/validation.utils';

/**
 * Interface for form validation state
 */
interface ValidationState {
  email: string[];
  username: string[];
  password: string[];
}

/**
 * Registration screen component with form validation and error handling
 */
const RegisterScreen = React.memo(() => {
  const theme = useTheme();
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState<RegisterData>({
    email: '',
    username: '',
    password: ''
  });

  // Validation and UI state
  const [errors, setErrors] = useState<ValidationState>({
    email: [],
    username: [],
    password: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Rate limiting state
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastAttemptTime, setLastAttemptTime] = useState(Date.now());

  // Handle form field changes with validation
  const handleFieldChange = useCallback((field: keyof RegisterData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field-specific errors
    setErrors(prev => ({ ...prev, [field]: [] }));
    
    // Clear submit error when user starts typing
    setSubmitError(null);
  }, []);

  // Password strength indicator color
  const getStrengthColor = useCallback((strength: number) => {
    if (strength < 2) return theme.palette.error.main;
    if (strength < 4) return theme.palette.warning.main;
    return theme.palette.success.main;
  }, [theme]);

  // Form submission handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Rate limiting check
    const now = Date.now();
    if (attemptCount >= 5 && now - lastAttemptTime < 300000) {
      setSubmitError('Too many attempts. Please try again in 5 minutes.');
      return;
    }

    // Validate all fields
    const validation = validateRegistrationData(formData);
    if (!validation.isValid) {
      setErrors({
        email: validation.errors.filter(err => err.includes('email')),
        username: validation.errors.filter(err => err.includes('username')),
        password: validation.errors.filter(err => err.includes('password'))
      });
      return;
    }

    setIsLoading(true);
    setSubmitError(null);

    try {
      // TODO: Implement registration API call here
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated API call
      
      // Update rate limiting state
      setAttemptCount(prev => prev + 1);
      setLastAttemptTime(now);

      // Navigate to login on success
      navigate('/login');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  }, [formData, attemptCount, lastAttemptTime, navigate]);

  // Update password strength when password changes
  useEffect(() => {
    const validation = validateRegistrationData(formData);
    setPasswordStrength(validation.details?.passwordStrength || 0);
  }, [formData.password]);

  return (
    <Container maxWidth="sm" sx={styles.formContainer}>
      <Typography variant="h4" component="h1" sx={styles.title}>
        Create Account
      </Typography>

      {submitError && (
        <Alert severity="error" sx={styles.errorAlert}>
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          name="email"
          type="email"
          value={formData.email}
          onChange={(value) => handleFieldChange('email', value)}
          placeholder="Email address"
          error={errors.email[0]}
          required
          autoComplete="email"
          validation="email"
          ariaLabel="Email address input"
        />

        <Input
          name="username"
          type="text"
          value={formData.username}
          onChange={(value) => handleFieldChange('username', value)}
          placeholder="Username"
          error={errors.username[0]}
          required
          autoComplete="username"
          validation="username"
          ariaLabel="Username input"
        />

        <Input
          name="password"
          type="password"
          value={formData.password}
          onChange={(value) => handleFieldChange('password', value)}
          placeholder="Password"
          error={errors.password[0]}
          required
          autoComplete="new-password"
          validation="password"
          ariaLabel="Password input"
        />

        <Box sx={styles.passwordStrength}>
          <LinearProgress
            variant="determinate"
            value={(passwordStrength / 5) * 100}
            sx={{
              backgroundColor: theme.palette.grey[200],
              '& .MuiLinearProgress-bar': {
                backgroundColor: getStrengthColor(passwordStrength)
              }
            }}
          />
        </Box>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={isLoading}
          sx={styles.submitButton}
        >
          {isLoading ? <CircularProgress size={24} /> : 'Register'}
        </Button>
      </form>

      <Typography variant="body2" sx={styles.loginLink}>
        Already have an account?{' '}
        <Link href="/login" underline="hover">
          Sign in
        </Link>
      </Typography>
    </Container>
  );
});

// Styles object using Material Design 3 principles
const styles = {
  formContainer: {
    maxWidth: '400px',
    margin: '0 auto',
    padding: theme => theme.spacing(3),
    display: 'flex',
    flexDirection: 'column',
    gap: theme => theme.spacing(2),
    position: 'relative'
  },
  title: {
    marginBottom: theme => theme.spacing(3),
    textAlign: 'center',
    color: theme => theme.palette.text.primary
  },
  submitButton: {
    marginTop: theme => theme.spacing(2),
    position: 'relative',
    minHeight: '48px'
  },
  loginLink: {
    marginTop: theme => theme.spacing(2),
    textAlign: 'center',
    color: theme => theme.palette.primary.main
  },
  errorAlert: {
    marginBottom: theme => theme.spacing(2),
    width: '100%'
  },
  passwordStrength: {
    marginTop: theme => theme.spacing(1),
    height: '4px',
    borderRadius: '2px',
    transition: 'all 0.3s ease'
  }
};

RegisterScreen.displayName = 'RegisterScreen';

export default RegisterScreen;