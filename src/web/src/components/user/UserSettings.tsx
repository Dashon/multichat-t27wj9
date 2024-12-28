/**
 * @fileoverview Enhanced user settings component implementing Material Design 3 principles
 * with comprehensive accessibility features and preference learning integration.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { styled } from '@mui/material/styles'; // v5.14+
import {
  FormControl,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  Tooltip,
  Snackbar,
  Typography,
  Box,
  Paper,
  IconButton,
} from '@mui/material'; // v5.14+

// Internal imports
import { ThemeMode } from '../../types/theme';
import { useTheme } from '../../hooks/useTheme';
import { usePreference } from '../../hooks/usePreference';
import CustomButton from '../common/Button';
import { SPACING } from '../../styles/dimensions';
import { FONT_SIZES } from '../../styles/typography';

// Styled components
const SettingsContainer = styled(Paper)(({ theme }) => ({
  padding: SPACING.lg,
  maxWidth: 600,
  margin: '0 auto',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[1],
  [theme.breakpoints.down('sm')]: {
    padding: SPACING.md,
    maxWidth: '100%',
  },
}));

const SettingsSection = styled(Box)(({ theme }) => ({
  marginBottom: SPACING.xl,
  '&:last-child': {
    marginBottom: 0,
  },
  '&:focus-within': {
    outline: `2px solid ${theme.palette.primary.main}`,
    borderRadius: theme.shape.borderRadius,
  },
}));

const SettingRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: SPACING.md,
  padding: SPACING.sm,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

// Props interface
interface UserSettingsProps {
  userId: string;
  onSave: (settings: any) => Promise<void>;
  onCancel: () => void;
  initialSettings: any;
  autoSave?: boolean;
}

/**
 * Enhanced UserSettings component with comprehensive accessibility features
 * and preference learning integration
 */
const UserSettings: React.FC<UserSettingsProps> = ({
  userId,
  onSave,
  onCancel,
  initialSettings,
  autoSave = true,
}) => {
  // Hooks
  const { themeMode, setThemeMode, highContrastMode } = useTheme();
  const { preferences, updatePreference, confidenceScores } = usePreference(userId);
  
  // Local state
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Effect to sync with preference learning system
  useEffect(() => {
    if (preferences && Object.keys(preferences).length > 0) {
      setSettings(prevSettings => ({
        ...prevSettings,
        ...preferences,
      }));
    }
  }, [preferences]);

  // Handle theme change with preference learning
  const handleThemeChange = useCallback(async (mode: ThemeMode) => {
    try {
      setThemeMode(mode);
      await updatePreference('UI', {
        theme: mode,
        confidenceScore: confidenceScores.UI || 0.5,
      });
      setSuccessMessage('Theme updated successfully');
    } catch (err) {
      setError('Failed to update theme preference');
    }
  }, [setThemeMode, updatePreference, confidenceScores.UI]);

  // Handle accessibility settings change
  const handleAccessibilityChange = useCallback(async (setting: string, value: boolean) => {
    try {
      const newSettings = {
        ...settings,
        accessibility: {
          ...settings.accessibility,
          [setting]: value,
        },
      };
      setSettings(newSettings);

      if (autoSave) {
        await updatePreference('UI', {
          accessibility: newSettings.accessibility,
          confidenceScore: confidenceScores.UI || 0.5,
        });
      }
    } catch (err) {
      setError('Failed to update accessibility settings');
    }
  }, [settings, autoSave, updatePreference, confidenceScores.UI]);

  // Handle save with error handling
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(settings);
      setSuccessMessage('Settings saved successfully');
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsContainer role="region" aria-label="User Settings">
      {/* Theme Settings */}
      <SettingsSection>
        <Typography variant="h6" gutterBottom>
          Theme Settings
        </Typography>
        <SettingRow>
          <FormControl fullWidth>
            <Select
              value={themeMode}
              onChange={(e) => handleThemeChange(e.target.value as ThemeMode)}
              aria-label="Theme Mode"
            >
              <MenuItem value={ThemeMode.LIGHT}>Light</MenuItem>
              <MenuItem value={ThemeMode.DARK}>Dark</MenuItem>
              <MenuItem value={ThemeMode.SYSTEM}>System</MenuItem>
            </Select>
          </FormControl>
        </SettingRow>
      </SettingsSection>

      {/* Accessibility Settings */}
      <SettingsSection>
        <Typography variant="h6" gutterBottom>
          Accessibility
        </Typography>
        <SettingRow>
          <Tooltip title="Increases contrast for better readability">
            <FormControlLabel
              control={
                <Switch
                  checked={settings.accessibility?.highContrast || false}
                  onChange={(e) => handleAccessibilityChange('highContrast', e.target.checked)}
                  name="highContrast"
                />
              }
              label="High Contrast Mode"
            />
          </Tooltip>
        </SettingRow>
        <SettingRow>
          <Tooltip title="Reduces motion for animations">
            <FormControlLabel
              control={
                <Switch
                  checked={settings.accessibility?.reduceMotion || false}
                  onChange={(e) => handleAccessibilityChange('reduceMotion', e.target.checked)}
                  name="reduceMotion"
                />
              }
              label="Reduce Motion"
            />
          </Tooltip>
        </SettingRow>
        <SettingRow>
          <Tooltip title="Enhances screen reader compatibility">
            <FormControlLabel
              control={
                <Switch
                  checked={settings.accessibility?.screenReader || false}
                  onChange={(e) => handleAccessibilityChange('screenReader', e.target.checked)}
                  name="screenReader"
                />
              }
              label="Screen Reader Optimizations"
            />
          </Tooltip>
        </SettingRow>
      </SettingsSection>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
        <CustomButton
          variant="outlined"
          onClick={onCancel}
          disabled={isSaving}
          aria-label="Cancel changes"
        >
          Cancel
        </CustomButton>
        <CustomButton
          variant="contained"
          onClick={handleSave}
          loading={isSaving}
          disabled={isSaving}
          aria-label="Save settings"
        >
          Save Changes
        </CustomButton>
      </Box>

      {/* Feedback Messages */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        message={error}
        role="alert"
      />
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
        role="status"
      />
    </SettingsContainer>
  );
};

export default UserSettings;