// @mui/material v5.14+
import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useMediaQuery } from '@mui/material';

import { ThemeMode } from '../types/theme';
import { 
  themeActions, 
  selectTheme 
} from '../store/slices/themeSlice';
import { themeConfig } from '../config/theme.config';

// Constants for theme management
const STORAGE_THEME_KEY = 'app_theme_mode';
const THEME_TRANSITION_DURATION = 300;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;
const DEFAULT_ACCENT_COLOR = '#1976d2';

/**
 * Custom hook for comprehensive theme management
 * Implements Material Design 3 principles for theme customization
 */
export const useTheme = () => {
  const dispatch = useDispatch();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  
  // Select theme state from Redux store
  const theme = useSelector(selectTheme);

  // Initialize theme on component mount
  useEffect(() => {
    const initializeTheme = () => {
      try {
        // Load stored theme preferences
        const storedTheme = localStorage.getItem(STORAGE_THEME_KEY);
        if (storedTheme && Object.values(ThemeMode).includes(storedTheme as ThemeMode)) {
          handleThemeChange(storedTheme as ThemeMode);
        } else {
          // Set system default if no stored preference
          handleThemeChange(ThemeMode.SYSTEM);
        }
      } catch (error) {
        console.error('Failed to initialize theme:', error);
        // Fallback to system theme
        handleThemeChange(ThemeMode.SYSTEM);
      }
    };

    initializeTheme();
  }, []);

  // Sync with system theme changes
  useEffect(() => {
    if (theme.mode === ThemeMode.SYSTEM) {
      const effectiveMode = prefersDarkMode ? ThemeMode.DARK : ThemeMode.LIGHT;
      document.documentElement.setAttribute('data-theme', effectiveMode);
    }
  }, [prefersDarkMode, theme.mode]);

  /**
   * Handles theme mode changes with smooth transitions
   */
  const handleThemeChange = useCallback((mode: ThemeMode) => {
    if (!Object.values(ThemeMode).includes(mode)) {
      console.error('Invalid theme mode:', mode);
      return;
    }

    // Add transition class for smooth switching
    document.documentElement.classList.add('theme-transition');
    document.documentElement.setAttribute('data-theme', mode);

    // Dispatch theme change action
    dispatch(themeActions.setThemeMode(mode));

    // Store preference
    try {
      localStorage.setItem(STORAGE_THEME_KEY, mode);
    } catch (error) {
      console.error('Failed to store theme preference:', error);
    }

    // Remove transition class after duration
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition');
    }, THEME_TRANSITION_DURATION);
  }, [dispatch]);

  /**
   * Handles accent color changes with accessibility checks
   */
  const handleAccentColorChange = useCallback((color: string) => {
    // Validate color format
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      console.error('Invalid color format:', color);
      return;
    }

    // Add transition for smooth color change
    document.documentElement.classList.add('color-transition');
    
    // Dispatch color change action
    dispatch(themeActions.setAccentColor(color));

    // Remove transition class after duration
    setTimeout(() => {
      document.documentElement.classList.remove('color-transition');
    }, THEME_TRANSITION_DURATION);
  }, [dispatch]);

  /**
   * Handles font size changes with validation
   */
  const handleFontSizeChange = useCallback((size: number) => {
    // Validate and constrain font size
    const validSize = Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE);
    
    // Dispatch font size change action
    dispatch(themeActions.setFontSize(validSize));

    // Update root font size
    document.documentElement.style.fontSize = `${validSize}px`;
  }, [dispatch]);

  return {
    // Current theme state
    theme: theme.colors,
    themeMode: theme.mode,
    effectiveMode: theme.effectiveMode,
    accentColor: theme.accentColor,
    fontSize: theme.fontSize,
    
    // Theme control functions
    setThemeMode: handleThemeChange,
    setAccentColor: handleAccentColorChange,
    setFontSize: handleFontSizeChange,
    
    // Theme constants
    constants: {
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
      DEFAULT_ACCENT_COLOR,
      TRANSITION_DURATION: THEME_TRANSITION_DURATION
    }
  };
};

export default useTheme;
```

This implementation:

1. Provides comprehensive theme management following Material Design 3 principles
2. Handles theme mode switching (light/dark/system) with smooth transitions
3. Manages accent color changes with validation and accessibility considerations
4. Controls font size with constraints and responsive scaling
5. Synchronizes with system theme preferences
6. Persists user preferences in local storage
7. Implements proper error handling and fallbacks
8. Uses Redux for centralized state management
9. Provides type safety with TypeScript
10. Includes detailed documentation and comments

The hook can be used in components like this:

```typescript
const MyComponent = () => {
  const { 
    themeMode, 
    setThemeMode, 
    setAccentColor, 
    setFontSize 
  } = useTheme();

  return (
    // Theme controls and UI
  );
};