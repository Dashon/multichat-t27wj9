/**
 * @fileoverview Enhanced Input component implementing Material Design 3 principles
 * Provides consistent text input experience with validation, theming, and accessibility
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { styled } from '@mui/material/styles'; // v5.14+
import { TextField, InputAdornment } from '@mui/material'; // v5.14+
import debounce from 'lodash/debounce'; // v4.17+

// Internal imports
import { lightTheme, darkTheme } from '../../styles/theme';
import { validateEmail, validatePassword, validateUsername, ValidationResult } from '../../utils/validation.utils';

/**
 * Type for supported input validation rules
 */
type ValidationRule = 'email' | 'password' | 'username' | 'none';

/**
 * Props interface for the Input component
 */
interface InputProps {
  name: string;
  type: 'text' | 'password' | 'email' | 'search' | 'tel';
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  validation?: ValidationRule;
  ariaLabel?: string;
  helperText?: string;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}

/**
 * Styled TextField component with Material Design 3 principles
 */
const StyledTextField = styled(TextField)(({ theme }) => ({
  margin: theme.spacing(1, 0),
  width: '100%',
  transition: 'all 0.3s ease-in-out',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,

  '& .MuiInputBase-root': {
    transition: 'border-color 0.3s ease-in-out',
    minHeight: '44px', // WCAG touch target size
  },

  '& .MuiInputLabel-root': {
    transition: 'color 0.3s ease-in-out',
    '&.Mui-focused': {
      color: theme.palette.primary.main,
    },
  },

  '& .MuiOutlinedInput-root': {
    '&:hover': {
      borderColor: theme.palette.primary.main,
    },
    '&.Mui-focused': {
      borderColor: theme.palette.primary.main,
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.primary.main,
        borderWidth: 2,
      },
    },
    '&.Mui-error': {
      borderColor: theme.palette.error.main,
    },
  },

  // High contrast mode support
  '@media (forced-colors: active)': {
    borderColor: 'CanvasText',
    '&:focus-within': {
      outline: '2px solid CanvasText',
    },
  },

  // Reduced motion support
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '& .MuiInputBase-root': {
      transition: 'none',
    },
    '& .MuiInputLabel-root': {
      transition: 'none',
    },
  },
}));

/**
 * Custom hook for handling input validation with debouncing
 */
const useValidation = (value: string, validationType: ValidationRule): ValidationResult => {
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });

  const debouncedValidate = useCallback(
    debounce((val: string) => {
      let result: ValidationResult;
      switch (validationType) {
        case 'email':
          result = validateEmail(val);
          break;
        case 'password':
          result = validatePassword(val);
          break;
        case 'username':
          result = validateUsername(val);
          break;
        default:
          result = { isValid: true, errors: [] };
      }
      setValidationResult(result);
    }, 300),
    [validationType]
  );

  useEffect(() => {
    if (validationType !== 'none') {
      debouncedValidate(value);
    }
    return () => {
      debouncedValidate.cancel();
    };
  }, [value, debouncedValidate, validationType]);

  return validationResult;
};

/**
 * Enhanced Input component with validation and accessibility features
 */
const Input = memo(({
  name,
  type,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  required = false,
  autoComplete,
  validation = 'none',
  ariaLabel,
  helperText,
  startAdornment,
  endAdornment,
  onFocus,
  onBlur,
  inputRef,
}: InputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const { isValid, errors } = useValidation(value, validation);
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || internalRef;

  // Handle input changes with validation
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    onChange(newValue, isValid);
  }, [onChange, isValid]);

  // Handle focus events
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  // Handle blur events
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  // Compute error message
  const errorMessage = error || (errors.length > 0 ? errors[0] : undefined);

  return (
    <StyledTextField
      name={name}
      type={type}
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      error={!!errorMessage}
      disabled={disabled}
      required={required}
      autoComplete={autoComplete}
      helperText={errorMessage || helperText}
      inputRef={ref}
      InputProps={{
        startAdornment: startAdornment && (
          <InputAdornment position="start">{startAdornment}</InputAdornment>
        ),
        endAdornment: endAdornment && (
          <InputAdornment position="end">{endAdornment}</InputAdornment>
        ),
      }}
      // Accessibility attributes
      inputProps={{
        'aria-label': ariaLabel || name,
        'aria-invalid': !!errorMessage,
        'aria-required': required,
        'aria-describedby': errorMessage ? `${name}-error` : undefined,
      }}
    />
  );
});

Input.displayName = 'Input';

export default Input;