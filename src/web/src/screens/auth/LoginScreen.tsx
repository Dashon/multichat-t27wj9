/**
 * @fileoverview Enhanced login screen component implementing Material Design 3 principles
 * with comprehensive accessibility features and secure authentication handling.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

// Internal imports
import CustomButton from '../../components/common/Button';
import Input from '../../components/common/Input';
import { login, selectAuth, clearError } from '../../store/slices/authSlice';
import { validateEmail, validatePassword } from '../../utils/validation.utils';

// Interface for login form state
interface LoginFormState {
  email: string;
  password: string;
  emailError: string | null;
  passwordError: string | null;
  isSubmitting: boolean;
  retryCount: number;
  lastError: string | null;
}

// Styled components with Material Design 3 principles
const LoginContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: theme.spacing(3),
  backgroundColor: theme.palette.background.default,
}));

const LoginForm = styled('form')(({ theme }) => ({
  width: '100%',
  maxWidth: '400px',
  padding: theme.spacing(4),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  transition: theme.transitions.create(['box-shadow']),
  '&:focus-within': {
    boxShadow: theme.shadows[3],
  },
}));

const Title = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(4),
  textAlign: 'center',
  color: theme.palette.text.primary,
}));

const InputContainer = styled('div')(({ theme }) => ({
  marginBottom: theme.spacing(3),
  position: 'relative',
}));

const ButtonContainer = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(4),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
}));

const ErrorMessage = styled(Typography)(({ theme }) => ({
  color: theme.palette.error.main,
  marginTop: theme.spacing(2),
  textAlign: 'center',
  role: 'alert',
}));

/**
 * Enhanced login screen component with accessibility and security features
 */
const LoginScreen: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector(selectAuth);

  // Form state management
  const [formState, setFormState] = useState<LoginFormState>({
    email: '',
    password: '',
    emailError: null,
    passwordError: null,
    isSubmitting: false,
    retryCount: 0,
    lastError: null,
  });

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chats');
    }
  }, [isAuthenticated, navigate]);

  // Handle input changes with validation
  const handleInputChange = useCallback((field: string, value: string) => {
    setFormState(prev => {
      const newState = { ...prev, [field]: value, lastError: null };

      // Real-time validation
      if (field === 'email') {
        const emailValidation = validateEmail(value);
        newState.emailError = emailValidation.errors[0] || null;
      } else if (field === 'password') {
        const passwordValidation = validatePassword(value);
        newState.passwordError = passwordValidation.errors[0] || null;
      }

      return newState;
    });
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    // Validate all inputs
    const emailValidation = validateEmail(formState.email);
    const passwordValidation = validatePassword(formState.password);

    if (!emailValidation.isValid || !passwordValidation.isValid) {
      setFormState(prev => ({
        ...prev,
        emailError: emailValidation.errors[0] || null,
        passwordError: passwordValidation.errors[0] || null,
      }));
      return;
    }

    setFormState(prev => ({ ...prev, isSubmitting: true }));

    try {
      await dispatch(login({
        email: formState.email,
        password: formState.password,
        rememberMe: true,
      })).unwrap();

      // Success - navigation handled by useEffect
    } catch (error) {
      setFormState(prev => ({
        ...prev,
        isSubmitting: false,
        lastError: error instanceof Error ? error.message : 'Login failed',
        retryCount: prev.retryCount + 1,
      }));
    }
  }, [dispatch, formState.email, formState.password]);

  return (
    <LoginContainer>
      <LoginForm onSubmit={handleSubmit} noValidate>
        <Title variant="h4" component="h1">
          Welcome Back
        </Title>

        <InputContainer>
          <Input
            name="email"
            type="email"
            value={formState.email}
            onChange={(value) => handleInputChange('email', value)}
            placeholder="Email"
            error={formState.emailError}
            disabled={loading}
            required
            autoComplete="email"
            validation="email"
            ariaLabel="Email address"
          />
        </InputContainer>

        <InputContainer>
          <Input
            name="password"
            type="password"
            value={formState.password}
            onChange={(value) => handleInputChange('password', value)}
            placeholder="Password"
            error={formState.passwordError}
            disabled={loading}
            required
            autoComplete="current-password"
            validation="password"
            ariaLabel="Password"
          />
        </InputContainer>

        <ButtonContainer>
          <CustomButton
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            loading={loading}
            disabled={loading || !!formState.emailError || !!formState.passwordError}
            ariaLabel="Sign in"
          >
            Sign In
          </CustomButton>
        </ButtonContainer>

        {(error || formState.lastError) && (
          <ErrorMessage variant="body2">
            {error?.message || formState.lastError}
          </ErrorMessage>
        )}
      </LoginForm>
    </LoginContainer>
  );
};

export default LoginScreen;