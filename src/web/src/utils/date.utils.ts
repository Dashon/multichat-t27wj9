/**
 * Date utilities for the AI-Enhanced Group Chat Platform
 * Provides date formatting, manipulation and comparison functions
 * with support for different locales and time zones
 * @module date.utils
 * @version 1.0.0
 */

import { format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns'; // v2.30.0

// Global format constants
const TIME_FORMAT = 'HH:mm';
const DATE_FORMAT = 'MMM d, yyyy';
const DATE_FORMAT_WITHOUT_YEAR = 'MMM d';
const THREAD_DATE_FORMAT = 'MMMM d, yyyy';

// Cache for message group keys to improve performance
const messageGroupKeyCache = new Map<string, string>();

/**
 * Formats message dates intelligently based on their relative time to now
 * Handles timezone and locale awareness for consistent display
 * 
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string appropriate for the message context
 * @throws {Error} If date parameter is invalid
 */
export const formatMessageDate = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to formatMessageDate');
  }

  try {
    if (isToday(date)) {
      return format(date, TIME_FORMAT);
    }

    if (isYesterday(date)) {
      return 'Yesterday';
    }

    if (isThisWeek(date)) {
      return format(date, 'EEEE'); // Full day name
    }

    if (isThisYear(date)) {
      return format(date, DATE_FORMAT_WITHOUT_YEAR);
    }

    return format(date, DATE_FORMAT);
  } catch (error) {
    console.error('Error formatting message date:', error);
    return 'Invalid date';
  }
};

/**
 * Formats dates for thread headers with contextual awareness
 * Provides consistent date representation for thread navigation
 * 
 * @param {Date} date - The thread date to format
 * @returns {string} Formatted date string optimized for thread display
 * @throws {Error} If date parameter is invalid
 */
export const formatThreadDate = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to formatThreadDate');
  }

  try {
    if (isToday(date)) {
      return 'Today';
    }

    if (isYesterday(date)) {
      return 'Yesterday';
    }

    if (isThisWeek(date)) {
      return format(date, 'EEEE'); // Full day name
    }

    return format(date, THREAD_DATE_FORMAT);
  } catch (error) {
    console.error('Error formatting thread date:', error);
    return 'Invalid date';
  }
};

/**
 * Generates human-readable relative time strings
 * Provides granular formatting based on time difference
 * 
 * @param {Date} date - The date to format relative to now
 * @returns {string} Human-readable relative time string
 * @throws {Error} If date parameter is invalid
 */
export const formatTimeAgo = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to formatTimeAgo');
  }

  try {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Handle future dates
    if (diffMs < 0) {
      return format(date, DATE_FORMAT);
    }

    // Convert to seconds
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) {
      return 'just now';
    }

    // Convert to minutes
    const diffMin = Math.floor(diffSec / 60);

    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }

    // Convert to hours
    const diffHours = Math.floor(diffMin / 60);

    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    // Convert to days
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    // For older dates, use standard format
    return format(date, DATE_FORMAT);
  } catch (error) {
    console.error('Error formatting time ago:', error);
    return 'Invalid date';
  }
};

/**
 * Generates consistent keys for message grouping
 * Considers timezone for accurate day boundaries
 * 
 * @param {Date} date - The date to generate a group key for
 * @returns {string} Unique date-based key for message grouping
 * @throws {Error} If date parameter is invalid
 */
export const getMessageGroupKey = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to getMessageGroupKey');
  }

  try {
    const dateString = date.toISOString();
    
    // Check cache first
    if (messageGroupKeyCache.has(dateString)) {
      return messageGroupKeyCache.get(dateString)!;
    }

    // Generate key in YYYY-MM-DD format
    const key = format(date, 'yyyy-MM-dd');
    
    // Cache the result
    messageGroupKeyCache.set(dateString, key);
    
    // Prevent unlimited cache growth
    if (messageGroupKeyCache.size > 1000) {
      const firstKey = messageGroupKeyCache.keys().next().value;
      messageGroupKeyCache.delete(firstKey);
    }

    return key;
  } catch (error) {
    console.error('Error generating message group key:', error);
    return 'invalid-date-group';
  }
};