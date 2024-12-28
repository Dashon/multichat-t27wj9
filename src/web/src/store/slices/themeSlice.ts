// @reduxjs/toolkit v1.9+
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ThemeMode } from '../types/theme';
import { lightColors, darkColors } from '../styles/colors';

// Constants for theme configuration
const TRANSITION_DURATION = 200; // ms
const FONT_SIZE_LIMITS = {
  min: 12,
  max: 24,
  default: 16,
} as const;

// Helper function to detect system theme preference
const getSystemTheme = (): ThemeMode.LIGHT | ThemeMode.DARK => {
  if (typeof window === 'undefined') return ThemeMode.LIGHT;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? ThemeMode.DARK
    : ThemeMode.LIGHT;
};

// Helper to update CSS variables
const updateCSSVariables = (
  mode: ThemeMode,
  accentColor: string,
  fontSize: number
) => {
  const root = document.documentElement;
  const colors = mode === ThemeMode.DARK ? darkColors : lightColors;
  
  // Set color scheme
  root.style.setProperty('--primary-main', colors.primary.main);
  root.style.setProperty('--primary-light', colors.primary.light);
  root.style.setProperty('--primary-dark', colors.primary.dark);
  root.style.setProperty('--accent-color', accentColor);
  
  // Set font size
  root.style.setProperty('--font-size-base', `${fontSize}px`);
  
  // Set transition
  root.style.setProperty(
    '--theme-transition',
    `all ${TRANSITION_DURATION}ms ease-in-out`
  );
};

// Interface for theme state
interface ThemeState {
  mode: ThemeMode;
  accentColor: string;
  fontSize: number;
  reducedMotion: boolean;
  lastSync: number;
  systemTheme: ThemeMode.LIGHT | ThemeMode.DARK;
}

// Initial state with system defaults
const initialState: ThemeState = {
  mode: ThemeMode.SYSTEM,
  accentColor: lightColors.primary.main,
  fontSize: FONT_SIZE_LIMITS.default,
  reducedMotion: false,
  lastSync: Date.now(),
  systemTheme: getSystemTheme(),
};

// Create the theme slice
const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      const newMode = action.payload;
      
      if (!Object.values(ThemeMode).includes(newMode)) {
        console.error('Invalid theme mode:', newMode);
        return;
      }

      state.mode = newMode;
      state.lastSync = Date.now();

      // Update effective theme based on system preference if needed
      if (newMode === ThemeMode.SYSTEM) {
        state.systemTheme = getSystemTheme();
      }

      // Update CSS variables
      updateCSSVariables(
        newMode === ThemeMode.SYSTEM ? state.systemTheme : newMode,
        state.accentColor,
        state.fontSize
      );

      // Persist theme preference
      try {
        localStorage.setItem('theme-mode', newMode);
      } catch (error) {
        console.error('Failed to persist theme mode:', error);
      }
    },

    setAccentColor: (state, action: PayloadAction<string>) => {
      const newColor = action.payload;
      
      // Basic color validation
      if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(newColor)) {
        console.error('Invalid accent color format:', newColor);
        return;
      }

      state.accentColor = newColor;
      state.lastSync = Date.now();

      // Update CSS variables
      updateCSSVariables(
        state.mode === ThemeMode.SYSTEM ? state.systemTheme : state.mode,
        newColor,
        state.fontSize
      );

      // Persist accent color preference
      try {
        localStorage.setItem('theme-accent-color', newColor);
      } catch (error) {
        console.error('Failed to persist accent color:', error);
      }
    },

    setFontSize: (state, action: PayloadAction<number>) => {
      const newSize = Math.min(
        Math.max(action.payload, FONT_SIZE_LIMITS.min),
        FONT_SIZE_LIMITS.max
      );

      state.fontSize = newSize;
      state.lastSync = Date.now();

      // Update CSS variables
      updateCSSVariables(
        state.mode === ThemeMode.SYSTEM ? state.systemTheme : state.mode,
        state.accentColor,
        newSize
      );

      // Persist font size preference
      try {
        localStorage.setItem('theme-font-size', newSize.toString());
      } catch (error) {
        console.error('Failed to persist font size:', error);
      }
    },

    setReducedMotion: (state, action: PayloadAction<boolean>) => {
      state.reducedMotion = action.payload;
      state.lastSync = Date.now();

      // Update transition duration based on reduced motion preference
      document.documentElement.style.setProperty(
        '--theme-transition',
        state.reducedMotion ? 'none' : `all ${TRANSITION_DURATION}ms ease-in-out`
      );

      // Persist reduced motion preference
      try {
        localStorage.setItem('theme-reduced-motion', action.payload.toString());
      } catch (error) {
        console.error('Failed to persist reduced motion preference:', error);
      }
    },

    syncSystemTheme: (state) => {
      if (state.mode === ThemeMode.SYSTEM) {
        state.systemTheme = getSystemTheme();
        state.lastSync = Date.now();

        // Update CSS variables
        updateCSSVariables(
          state.systemTheme,
          state.accentColor,
          state.fontSize
        );
      }
    },
  },
});

// Export actions and reducer
export const {
  setThemeMode,
  setAccentColor,
  setFontSize,
  setReducedMotion,
  syncSystemTheme,
} = themeSlice.actions;

export default themeSlice.reducer;

// Selector for theme state with memoization consideration
export const selectTheme = (state: { theme: ThemeState }) => {
  const { mode, accentColor, fontSize, reducedMotion, systemTheme } = state.theme;
  
  return {
    mode,
    effectiveMode: mode === ThemeMode.SYSTEM ? systemTheme : mode,
    accentColor,
    fontSize,
    reducedMotion,
    colors: mode === ThemeMode.SYSTEM
      ? (systemTheme === ThemeMode.DARK ? darkColors : lightColors)
      : (mode === ThemeMode.DARK ? darkColors : lightColors),
  };
};

// Initialize theme system
export const initializeTheme = () => {
  return (dispatch: any) => {
    // Listen for system theme changes
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        dispatch(syncSystemTheme());
      });
    }

    // Load persisted preferences
    try {
      const storedMode = localStorage.getItem('theme-mode') as ThemeMode;
      const storedColor = localStorage.getItem('theme-accent-color');
      const storedSize = localStorage.getItem('theme-font-size');
      const storedReducedMotion = localStorage.getItem('theme-reduced-motion');

      if (storedMode && Object.values(ThemeMode).includes(storedMode)) {
        dispatch(setThemeMode(storedMode));
      }
      if (storedColor) {
        dispatch(setAccentColor(storedColor));
      }
      if (storedSize) {
        dispatch(setFontSize(parseInt(storedSize, 10)));
      }
      if (storedReducedMotion) {
        dispatch(setReducedMotion(storedReducedMotion === 'true'));
      }
    } catch (error) {
      console.error('Failed to load theme preferences:', error);
    }
  };
};