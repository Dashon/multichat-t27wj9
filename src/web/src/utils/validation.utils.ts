// External imports
import isEmail from 'validator/lib/isEmail'; // v13.7.0

// Internal imports
import { User, LoginCredentials, RegisterData } from '../types/user';
import { ChatCreateData } from '../types/chat';
import { Message } from '../types/message';

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  details?: Record<string, any>;
}

// Validation cache interface
interface ValidationCache {
  [key: string]: {
    result: ValidationResult;
    timestamp: number;
  };
}

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Initialize validation cache
const validationCache: ValidationCache = {};

/**
 * Validates email format and domain with caching support
 * @param email - Email address to validate
 * @returns ValidationResult with status and error messages
 */
export const validateEmail = (email: string): ValidationResult => {
  // Check cache
  const cacheKey = `email:${email}`;
  const cached = validationCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.result;
  }

  const errors: string[] = [];

  // Basic validation
  if (!email) {
    errors.push('Email is required');
  } else {
    // Length validation
    if (email.length < 5) {
      errors.push('Email must be at least 5 characters long');
    }
    if (email.length > 255) {
      errors.push('Email must not exceed 255 characters');
    }

    // Format validation using validator library
    if (!isEmail(email)) {
      errors.push('Invalid email format');
    }

    // Domain validation
    const domain = email.split('@')[1];
    if (domain) {
      // Add your domain validation logic here
      const blockedDomains = ['tempmail.com', 'disposable.com'];
      if (blockedDomains.includes(domain)) {
        errors.push('Email domain not allowed');
      }
    }
  }

  const result = {
    isValid: errors.length === 0,
    errors,
  };

  // Cache result
  validationCache[cacheKey] = {
    result,
    timestamp: Date.now(),
  };

  return result;
};

/**
 * Validates password strength and compliance
 * @param password - Password to validate
 * @returns ValidationResult with strength indicators
 */
export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];
  let strength = 0;

  // Basic validation
  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors, details: { strength: 0 } };
  }

  // Length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else {
    strength += 1;
  }

  // Character type checks using regex
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    strength += 1;
  }

  if (!hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    strength += 1;
  }

  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  } else {
    strength += 1;
  }

  if (!hasSpecialChars) {
    errors.push('Password must contain at least one special character');
  } else {
    strength += 1;
  }

  return {
    isValid: errors.length === 0,
    errors,
    details: {
      strength,
      hasUppercase,
      hasLowercase,
      hasNumbers,
      hasSpecialChars,
    },
  };
};

/**
 * Validates username format and availability
 * @param username - Username to validate
 * @returns ValidationResult with availability status
 */
export const validateUsername = (username: string): ValidationResult => {
  const errors: string[] = [];

  // Basic validation
  if (!username) {
    errors.push('Username is required');
    return { isValid: false, errors };
  }

  // Length validation
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  if (username.length > 30) {
    errors.push('Username must not exceed 30 characters');
  }

  // Format validation
  const validUsernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!validUsernameRegex.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
  }

  // Reserved username check
  const reservedUsernames = ['admin', 'system', 'moderator', 'bot'];
  if (reservedUsernames.includes(username.toLowerCase())) {
    errors.push('This username is reserved');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates login credentials with rate limiting
 * @param credentials - Login credentials to validate
 * @returns ValidationResult with rate limit info
 */
export const validateLoginCredentials = (credentials: LoginCredentials): ValidationResult => {
  const errors: string[] = [];
  
  // Validate email
  const emailValidation = validateEmail(credentials.email);
  errors.push(...emailValidation.errors);

  // Validate password
  const passwordValidation = validatePassword(credentials.password);
  errors.push(...passwordValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
    details: {
      emailValid: emailValidation.isValid,
      passwordValid: passwordValidation.isValid,
    },
  };
};

/**
 * Validates registration data with duplicate checking
 * @param data - Registration data to validate
 * @returns ValidationResult with availability status
 */
export const validateRegistrationData = (data: RegisterData): ValidationResult => {
  const errors: string[] = [];

  // Validate email
  const emailValidation = validateEmail(data.email);
  errors.push(...emailValidation.errors);

  // Validate password
  const passwordValidation = validatePassword(data.password);
  errors.push(...passwordValidation.errors);

  // Validate username
  const usernameValidation = validateUsername(data.username);
  errors.push(...usernameValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
    details: {
      emailValid: emailValidation.isValid,
      passwordValid: passwordValidation.isValid,
      usernameValid: usernameValidation.isValid,
      passwordStrength: passwordValidation.details?.strength,
    },
  };
};

/**
 * Validates chat creation data
 * @param data - Chat creation data to validate
 * @returns ValidationResult with participant checks
 */
export const validateChatCreation = (data: ChatCreateData): ValidationResult => {
  const errors: string[] = [];

  // Validate chat name
  if (!data.name) {
    errors.push('Chat name is required');
  } else {
    if (data.name.length < 3) {
      errors.push('Chat name must be at least 3 characters long');
    }
    if (data.name.length > 50) {
      errors.push('Chat name must not exceed 50 characters');
    }
  }

  // Validate description if provided
  if (data.description && data.description.length > 500) {
    errors.push('Description must not exceed 500 characters');
  }

  // Validate participants
  if (!data.participants || data.participants.length < 2) {
    errors.push('Chat must have at least 2 participants');
  } else if (data.participants.length > 50) {
    errors.push('Chat cannot exceed 50 participants');
  }

  return {
    isValid: errors.length === 0,
    errors,
    details: {
      participantCount: data.participants?.length || 0,
    },
  };
};

/**
 * Validates message content with filtering
 * @param message - Message to validate
 * @returns ValidationResult with content checks
 */
export const validateMessageContent = (message: Message): ValidationResult => {
  const errors: string[] = [];

  // Validate content
  if (!message.content) {
    errors.push('Message content is required');
  } else {
    // Length validation
    if (message.content.length > 5000) {
      errors.push('Message content must not exceed 5000 characters');
    }

    // Content filtering
    const prohibitedPatterns = [
      /^spam$/i,
      /<script>/i,
      /^\s*$/  // Empty or whitespace-only content
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(message.content)) {
        errors.push('Message content contains prohibited patterns');
        break;
      }
    }
  }

  // Validate metadata if present
  if (message.metadata) {
    if (!Object.values(MessageType).includes(message.metadata.type)) {
      errors.push('Invalid message type');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    details: {
      contentLength: message.content?.length || 0,
      hasMetadata: !!message.metadata,
    },
  };
};