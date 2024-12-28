import React, { useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  RadioGroup,
  Radio,
  FormControlLabel,
  Slider,
  Box,
  Switch,
  useTheme as useMuiTheme,
  useMediaQuery
} from '@mui/material';
import { styled } from '@mui/material/styles';
import debounce from 'lodash/debounce';

import { useTheme } from '../../hooks/useTheme';
import { ThemeMode } from '../../types/theme';

// Styled components for enhanced accessibility and responsive design
const StyledCard = styled(Card)(({ theme }) => ({
  maxWidth: '600px',
  margin: '24px auto',
  [theme.breakpoints.down('sm')]: {
    margin: '16px',
  },
}));

const ColorOption = styled('button')<{ color: string; isSelected: boolean }>(
  ({ theme, color, isSelected }) => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    backgroundColor: color,
    border: isSelected ? `3px solid ${theme.palette.primary.main}` : '2px solid transparent',
    cursor: 'pointer',
    transition: theme.transitions.create(['border'], {
      duration: theme.transitions.duration.shorter,
    }),
    '&:hover': {
      border: `2px solid ${theme.palette.primary.light}`,
    },
    '&:focus-visible': {
      outline: `3px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  })
);

const ThemeScreen: React.FC = React.memo(() => {
  const {
    themeMode,
    accentColor,
    fontSize,
    constants: { MIN_FONT_SIZE, MAX_FONT_SIZE },
    setThemeMode,
    setAccentColor,
    setFontSize,
  } = useTheme();

  const muiTheme = useMuiTheme();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Available accent colors with WCAG AA contrast ratios
  const accentColors = [
    '#006494', // Default blue
    '#7B4B94', // Purple
    '#2E7D32', // Green
    '#B3261E', // Red
    '#F4A100', // Orange
  ];

  // Debounced handlers for performance
  const debouncedFontSizeChange = useCallback(
    debounce((size: number) => {
      setFontSize(size);
    }, 150),
    [setFontSize]
  );

  // Effect to sync with system preferences
  useEffect(() => {
    if (themeMode === ThemeMode.SYSTEM) {
      const effectiveMode = prefersDarkMode ? ThemeMode.DARK : ThemeMode.LIGHT;
      document.documentElement.setAttribute('data-theme', effectiveMode);
    }
  }, [prefersDarkMode, themeMode]);

  const handleThemeModeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newMode = event.target.value as ThemeMode;
      setThemeMode(newMode);
      // Announce theme change for screen readers
      const message = `Theme changed to ${newMode} mode`;
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.textContent = message;
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 1000);
    },
    [setThemeMode]
  );

  const handleAccentColorChange = useCallback(
    (color: string) => {
      setAccentColor(color);
      // Announce color change for screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.textContent = `Accent color changed`;
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 1000);
    },
    [setAccentColor]
  );

  return (
    <StyledCard>
      <CardContent>
        <Typography variant="h5" component="h1" gutterBottom>
          Theme Settings
        </Typography>

        {/* Theme Mode Selection */}
        <Box mb={4}>
          <Typography variant="h6" component="h2" gutterBottom>
            Theme Mode
          </Typography>
          <RadioGroup
            aria-label="theme mode"
            name="theme-mode"
            value={themeMode}
            onChange={handleThemeModeChange}
          >
            <FormControlLabel
              value={ThemeMode.LIGHT}
              control={<Radio />}
              label="Light"
            />
            <FormControlLabel
              value={ThemeMode.DARK}
              control={<Radio />}
              label="Dark"
            />
            <FormControlLabel
              value={ThemeMode.SYSTEM}
              control={<Radio />}
              label="System Default"
            />
          </RadioGroup>
        </Box>

        {/* Accent Color Selection */}
        <Box mb={4}>
          <Typography variant="h6" component="h2" gutterBottom>
            Accent Color
          </Typography>
          <Box
            display="flex"
            gap={2}
            role="radiogroup"
            aria-label="accent color selection"
          >
            {accentColors.map((color) => (
              <ColorOption
                key={color}
                color={color}
                isSelected={color === accentColor}
                onClick={() => handleAccentColorChange(color)}
                aria-label={`Select ${color} as accent color`}
                role="radio"
                aria-checked={color === accentColor}
              />
            ))}
          </Box>
        </Box>

        {/* Font Size Adjustment */}
        <Box mb={4}>
          <Typography variant="h6" component="h2" gutterBottom>
            Font Size
          </Typography>
          <Slider
            value={fontSize}
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            onChange={(_, value) => debouncedFontSizeChange(value as number)}
            aria-label="font size"
            valueLabelDisplay="auto"
            marks={[
              { value: MIN_FONT_SIZE, label: 'Small' },
              { value: (MIN_FONT_SIZE + MAX_FONT_SIZE) / 2, label: 'Medium' },
              { value: MAX_FONT_SIZE, label: 'Large' },
            ]}
          />
        </Box>

        {/* Reduced Motion Preference */}
        <Box>
          <Typography variant="h6" component="h2" gutterBottom>
            Reduced Motion
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={prefersReducedMotion}
                disabled
                aria-label="system reduced motion preference"
              />
            }
            label="Use system preference for reduced motion"
          />
        </Box>
      </CardContent>
    </StyledCard>
  );
});

ThemeScreen.displayName = 'ThemeScreen';

export default ThemeScreen;