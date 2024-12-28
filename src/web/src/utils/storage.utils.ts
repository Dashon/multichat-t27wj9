import AES from 'crypto-js/aes'; // v4.1.1
import encUtf8 from 'crypto-js/enc-utf8'; // v4.1.1
import { UserSettings } from '../types/user';

/**
 * Global constants for storage configuration
 */
const STORAGE_PREFIX = 'ai_chat_';
const STORAGE_VERSION = '1.0';
const ENCRYPTION_KEY = process.env.REACT_APP_STORAGE_ENCRYPTION_KEY;

/**
 * Storage operation result type
 */
interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Storage options configuration
 */
interface StorageOptions {
  encrypt?: boolean;
  version?: string;
  expiresIn?: number; // milliseconds
}

/**
 * Storage metadata for type safety and versioning
 */
interface StorageMetadata<T> {
  type: string;
  version: string;
  timestamp: number;
  expires?: number;
  data: T;
}

/**
 * Validates browser storage availability
 */
const isStorageAvailable = (): boolean => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Encrypts data using AES encryption
 * @param data - String data to encrypt
 * @returns Encrypted string or error result
 */
const encryptData = (data: string): Result<string> => {
  try {
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key not available');
    }
    const encrypted = AES.encrypt(data, ENCRYPTION_KEY).toString();
    return { success: true, data: encrypted };
  } catch (error) {
    return {
      success: false,
      error: `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Decrypts AES encrypted data
 * @param encryptedData - Encrypted string to decrypt
 * @returns Decrypted string or error result
 */
const decryptData = (encryptedData: string): Result<string> => {
  try {
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key not available');
    }
    const decrypted = AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decryptedString = decrypted.toString(encUtf8);
    if (!decryptedString) {
      throw new Error('Decryption resulted in empty string');
    }
    return { success: true, data: decryptedString };
  } catch (error) {
    return {
      success: false,
      error: `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Stores data in browser storage with encryption and type safety
 * @param key - Storage key
 * @param value - Value to store
 * @param options - Storage options
 * @returns Result of storage operation
 */
export const setStorageItem = <T>(
  key: string,
  value: T,
  options: StorageOptions = {}
): Result<void> => {
  try {
    if (!isStorageAvailable()) {
      throw new Error('Local storage is not available');
    }

    const metadata: StorageMetadata<T> = {
      type: typeof value,
      version: options.version || STORAGE_VERSION,
      timestamp: Date.now(),
      expires: options.expiresIn ? Date.now() + options.expiresIn : undefined,
      data: value
    };

    let storageString = JSON.stringify(metadata);

    if (options.encrypt) {
      const encryptResult = encryptData(storageString);
      if (!encryptResult.success) {
        throw new Error(encryptResult.error);
      }
      storageString = encryptResult.data!;
    }

    const storageKey = `${STORAGE_PREFIX}${key}`;
    localStorage.setItem(storageKey, storageString);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Storage operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Retrieves data from browser storage with type validation
 * @param key - Storage key
 * @param options - Storage options
 * @returns Retrieved value or error result
 */
export const getStorageItem = <T>(
  key: string,
  options: StorageOptions = {}
): Result<T | null> => {
  try {
    if (!isStorageAvailable()) {
      throw new Error('Local storage is not available');
    }

    const storageKey = `${STORAGE_PREFIX}${key}`;
    const storageValue = localStorage.getItem(storageKey);

    if (!storageValue) {
      return { success: true, data: null };
    }

    let parsedValue: string = storageValue;

    if (options.encrypt) {
      const decryptResult = decryptData(storageValue);
      if (!decryptResult.success) {
        throw new Error(decryptResult.error);
      }
      parsedValue = decryptResult.data!;
    }

    const metadata: StorageMetadata<T> = JSON.parse(parsedValue);

    // Check expiration
    if (metadata.expires && metadata.expires < Date.now()) {
      localStorage.removeItem(storageKey);
      return { success: true, data: null };
    }

    // Version check
    if (metadata.version !== (options.version || STORAGE_VERSION)) {
      return { success: true, data: null };
    }

    return { success: true, data: metadata.data };
  } catch (error) {
    return {
      success: false,
      error: `Retrieval operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Removes an item from browser storage
 * @param key - Storage key
 * @returns Result of removal operation
 */
export const removeStorageItem = (key: string): Result<void> => {
  try {
    if (!isStorageAvailable()) {
      throw new Error('Local storage is not available');
    }

    const storageKey = `${STORAGE_PREFIX}${key}`;
    localStorage.removeItem(storageKey);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Remove operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Clears all application storage items
 * @returns Result of clear operation
 */
export const clearStorage = (): Result<void> => {
  try {
    if (!isStorageAvailable()) {
      throw new Error('Local storage is not available');
    }

    const keys = Object.keys(localStorage);
    const appKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));

    appKeys.forEach(key => localStorage.removeItem(key));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Clear operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Type guard for storage metadata
 */
const isStorageMetadata = <T>(value: any): value is StorageMetadata<T> => {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.type === 'string' &&
    typeof value.version === 'string' &&
    typeof value.timestamp === 'number' &&
    'data' in value
  );
};