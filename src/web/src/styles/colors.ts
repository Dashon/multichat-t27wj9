import type { PaletteOptions } from '@mui/material'; // @mui/material v5.14+

// Type definitions for color tokens
interface ColorToken {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
  surface: string;
  onSurface: string;
}

interface BackgroundToken {
  default: string;
  paper: string;
  surface: string;
  elevation: {
    0: string;
    1: string;
    2: string;
    3: string;
    4: string;
  };
}

interface TextToken {
  primary: string;
  secondary: string;
  disabled: string;
  hint: string;
  onPrimary: string;
  onSecondary: string;
  onBackground: string;
}

interface SurfaceToken {
  default: string;
  variant: string;
  tint: string;
  dim: string;
}

interface InteractionToken {
  hover: string;
  focus: string;
  pressed: string;
  dragged: string;
  selected: string;
}

// Main color scheme interface
interface ColorScheme {
  primary: ColorToken;
  secondary: ColorToken;
  error: ColorToken;
  warning: ColorToken;
  info: ColorToken;
  success: ColorToken;
  background: BackgroundToken;
  text: TextToken;
  surface: SurfaceToken;
  interaction: InteractionToken;
}

// Global opacity constants for interactive states
export const OPACITY = {
  hover: '0.08',
  selected: '0.12',
  disabled: '0.38',
  focus: '0.12',
  pressed: '0.16',
  dragged: '0.20',
  scrim: '0.32',
} as const;

// Global elevation constants
export const ELEVATION = {
  0: '0px',
  1: '1px',
  2: '3px',
  3: '6px',
  4: '8px',
} as const;

// Light theme color scheme
export const lightColors: ColorScheme = {
  primary: {
    main: '#006494', // WCAG AAA compliant
    light: '#4B9CCA',
    dark: '#003E5F',
    contrastText: '#FFFFFF',
    surface: '#E6F3FA',
    onSurface: '#001E2E',
  },
  secondary: {
    main: '#7B4B94',
    light: '#A77DBE',
    dark: '#51246D',
    contrastText: '#FFFFFF',
    surface: '#F4EDF7',
    onSurface: '#2A1238',
  },
  error: {
    main: '#B3261E',
    light: '#F2B8B5',
    dark: '#8C1D18',
    contrastText: '#FFFFFF',
    surface: '#F9DEDC',
    onSurface: '#410E0B',
  },
  warning: {
    main: '#F4A100',
    light: '#FFDDB2',
    dark: '#7A5100',
    contrastText: '#000000',
    surface: '#FFF2D9',
    onSurface: '#3F2900',
  },
  info: {
    main: '#0288D1',
    light: '#B3E5FC',
    dark: '#01579B',
    contrastText: '#FFFFFF',
    surface: '#E1F5FE',
    onSurface: '#014361',
  },
  success: {
    main: '#2E7D32',
    light: '#A5D6A7',
    dark: '#1B5E20',
    contrastText: '#FFFFFF',
    surface: '#E8F5E9',
    onSurface: '#0C2E0F',
  },
  background: {
    default: '#FFFFFF',
    paper: '#F5F5F5',
    surface: '#FFFFFF',
    elevation: {
      0: '#FFFFFF',
      1: '#F8F8F8',
      2: '#F5F5F5',
      3: '#F2F2F2',
      4: '#EFEFEF',
    },
  },
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.60)',
    disabled: 'rgba(0, 0, 0, 0.38)',
    hint: 'rgba(0, 0, 0, 0.38)',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onBackground: 'rgba(0, 0, 0, 0.87)',
  },
  surface: {
    default: '#FFFFFF',
    variant: '#F5F5F5',
    tint: '#E1E1E1',
    dim: '#FAFAFA',
  },
  interaction: {
    hover: `rgba(0, 0, 0, ${OPACITY.hover})`,
    focus: `rgba(0, 0, 0, ${OPACITY.focus})`,
    pressed: `rgba(0, 0, 0, ${OPACITY.pressed})`,
    dragged: `rgba(0, 0, 0, ${OPACITY.dragged})`,
    selected: `rgba(0, 0, 0, ${OPACITY.selected})`,
  },
};

// Dark theme color scheme
export const darkColors: ColorScheme = {
  primary: {
    main: '#89CBFF', // Enhanced contrast for dark theme
    light: '#BCE3FF',
    dark: '#004B70',
    contrastText: '#003351',
    surface: '#004B70',
    onSurface: '#BCE3FF',
  },
  secondary: {
    main: '#CEB1DB',
    light: '#EBD6F6',
    dark: '#5D3777',
    contrastText: '#381F4A',
    surface: '#5D3777',
    onSurface: '#EBD6F6',
  },
  error: {
    main: '#F2B8B5',
    light: '#FFD9D6',
    dark: '#8C1D18',
    contrastText: '#601410',
    surface: '#8C1D18',
    onSurface: '#FFD9D6',
  },
  warning: {
    main: '#FFB95C',
    light: '#FFD9B1',
    dark: '#7A5100',
    contrastText: '#3F2900',
    surface: '#7A5100',
    onSurface: '#FFD9B1',
  },
  info: {
    main: '#89CBFF',
    light: '#BCE3FF',
    dark: '#004B70',
    contrastText: '#003351',
    surface: '#004B70',
    onSurface: '#BCE3FF',
  },
  success: {
    main: '#7BC67E',
    light: '#B5E4B7',
    dark: '#1B5E20',
    contrastText: '#0C2E0F',
    surface: '#1B5E20',
    onSurface: '#B5E4B7',
  },
  background: {
    default: '#121212',
    paper: '#1E1E1E',
    surface: '#121212',
    elevation: {
      0: '#121212',
      1: '#1E1E1E',
      2: '#232323',
      3: '#252525',
      4: '#272727',
    },
  },
  text: {
    primary: 'rgba(255, 255, 255, 0.87)',
    secondary: 'rgba(255, 255, 255, 0.60)',
    disabled: 'rgba(255, 255, 255, 0.38)',
    hint: 'rgba(255, 255, 255, 0.38)',
    onPrimary: '#003351',
    onSecondary: '#381F4A',
    onBackground: 'rgba(255, 255, 255, 0.87)',
  },
  surface: {
    default: '#121212',
    variant: '#1E1E1E',
    tint: '#2C2C2C',
    dim: '#181818',
  },
  interaction: {
    hover: `rgba(255, 255, 255, ${OPACITY.hover})`,
    focus: `rgba(255, 255, 255, ${OPACITY.focus})`,
    pressed: `rgba(255, 255, 255, ${OPACITY.pressed})`,
    dragged: `rgba(255, 255, 255, ${OPACITY.dragged})`,
    selected: `rgba(255, 255, 255, ${OPACITY.selected})`,
  },
};