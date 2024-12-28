/**
 * @fileoverview Enhanced preferences screen component implementing user preference
 * management with confidence scoring, real-time synchronization, and accessibility.
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import {
  Switch,
  FormControlLabel,
  Typography,
  Box,
  LinearProgress,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'; // v5.14.0
import { usePreference } from '../../hooks/usePreference';
import Card from '../../components/common/Card';
import { PreferenceType } from '../../types/preference';
import { SPACING } from '../../styles/dimensions';
import { lightColors, darkColors } from '../../styles/colors';

/**
 * Interface for preference section rendering
 */
interface PreferenceSectionProps {
  title: string;
  description: string;
  confidenceScore: number;
  children: React.ReactNode;
}

/**
 * Enhanced preferences screen component with confidence scoring and accessibility
 */
const PreferencesScreen: React.FC = () => {
  const {
    preferences,
    loading,
    error,
    getPreference,
    updatePreference,
    confidenceScores,
  } = usePreference();

  /**
   * Debounced preference update handler with confidence tracking
   */
  const handlePreferenceUpdate = useCallback(
    async (
      preferenceType: PreferenceType,
      value: any,
      confidenceScore: number
    ) => {
      try {
        await updatePreference(preferenceType, {
          ...getPreference(preferenceType),
          value,
          confidenceScore: Math.min(confidenceScore + 0.1, 1),
          lastUpdated: new Date(),
        });
      } catch (error) {
        console.error('Failed to update preference:', error);
      }
    },
    [getPreference, updatePreference]
  );

  /**
   * Enhanced preference section component with confidence indicator
   */
  const PreferenceSection: React.FC<PreferenceSectionProps> = ({
    title,
    description,
    confidenceScore,
    children,
  }) => (
    <Card elevation={1} className="preference-section" role="region" aria-label={title}>
      <Box sx={{ mb: SPACING.md / 8 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ mb: SPACING.sm / 8 }}
        >
          {description}
        </Typography>
        <Tooltip
          title={`Confidence Score: ${Math.round(confidenceScore * 100)}%`}
          placement="right"
        >
          <LinearProgress
            variant="determinate"
            value={confidenceScore * 100}
            sx={{
              mb: SPACING.sm / 8,
              height: 4,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === 'light'
                  ? lightColors.surface.variant
                  : darkColors.surface.variant,
            }}
          />
        </Tooltip>
      </Box>
      {children}
    </Card>
  );

  /**
   * Chat preferences section with enhanced accessibility
   */
  const renderChatPreferences = useMemo(() => {
    const chatPrefs = getPreference(PreferenceType.CHAT);
    return (
      <PreferenceSection
        title="Chat Preferences"
        description="Customize your chat experience and message display settings"
        confidenceScore={confidenceScores[PreferenceType.CHAT]}
      >
        <FormControl fullWidth margin="normal">
          <FormControlLabel
            control={
              <Switch
                checked={chatPrefs?.showTimestamps ?? true}
                onChange={(e) =>
                  handlePreferenceUpdate(
                    PreferenceType.CHAT,
                    { ...chatPrefs, showTimestamps: e.target.checked },
                    confidenceScores[PreferenceType.CHAT]
                  )
                }
                inputProps={{ 'aria-label': 'Show message timestamps' }}
              />
            }
            label="Show Timestamps"
          />
        </FormControl>
        <FormControl fullWidth margin="normal">
          <InputLabel id="message-display-label">Message Display</InputLabel>
          <Select
            labelId="message-display-label"
            value={chatPrefs?.messageDisplay ?? 'comfortable'}
            onChange={(e) =>
              handlePreferenceUpdate(
                PreferenceType.CHAT,
                { ...chatPrefs, messageDisplay: e.target.value },
                confidenceScores[PreferenceType.CHAT]
              )
            }
            aria-label="Message display mode"
          >
            <MenuItem value="compact">Compact</MenuItem>
            <MenuItem value="comfortable">Comfortable</MenuItem>
            <MenuItem value="expanded">Expanded</MenuItem>
          </Select>
        </FormControl>
      </PreferenceSection>
    );
  }, [getPreference, confidenceScores, handlePreferenceUpdate]);

  /**
   * AI agent preferences section with enhanced accessibility
   */
  const renderAIPreferences = useMemo(() => {
    const aiPrefs = getPreference(PreferenceType.AI_AGENT);
    return (
      <PreferenceSection
        title="AI Agent Preferences"
        description="Configure AI agent behavior and interaction settings"
        confidenceScore={confidenceScores[PreferenceType.AI_AGENT]}
      >
        <FormControl fullWidth margin="normal">
          <FormControlLabel
            control={
              <Switch
                checked={aiPrefs?.autoSuggestions ?? true}
                onChange={(e) =>
                  handlePreferenceUpdate(
                    PreferenceType.AI_AGENT,
                    { ...aiPrefs, autoSuggestions: e.target.checked },
                    confidenceScores[PreferenceType.AI_AGENT]
                  )
                }
                inputProps={{ 'aria-label': 'Enable AI suggestions' }}
              />
            }
            label="Enable AI Suggestions"
          />
        </FormControl>
        <FormControl fullWidth margin="normal">
          <InputLabel id="interaction-style-label">Interaction Style</InputLabel>
          <Select
            labelId="interaction-style-label"
            value={aiPrefs?.interactionStyle ?? 'balanced'}
            onChange={(e) =>
              handlePreferenceUpdate(
                PreferenceType.AI_AGENT,
                { ...aiPrefs, interactionStyle: e.target.value },
                confidenceScores[PreferenceType.AI_AGENT]
              )
            }
            aria-label="AI interaction style"
          >
            <MenuItem value="proactive">Proactive</MenuItem>
            <MenuItem value="balanced">Balanced</MenuItem>
            <MenuItem value="reactive">Reactive</MenuItem>
          </Select>
        </FormControl>
      </PreferenceSection>
    );
  }, [getPreference, confidenceScores, handlePreferenceUpdate]);

  /**
   * UI preferences section with enhanced accessibility
   */
  const renderUIPreferences = useMemo(() => {
    const uiPrefs = getPreference(PreferenceType.UI);
    return (
      <PreferenceSection
        title="UI Preferences"
        description="Customize the application's appearance and behavior"
        confidenceScore={confidenceScores[PreferenceType.UI]}
      >
        <FormControl fullWidth margin="normal">
          <InputLabel id="theme-mode-label">Theme Mode</InputLabel>
          <Select
            labelId="theme-mode-label"
            value={uiPrefs?.theme ?? 'system'}
            onChange={(e) =>
              handlePreferenceUpdate(
                PreferenceType.UI,
                { ...uiPrefs, theme: e.target.value },
                confidenceScores[PreferenceType.UI]
              )
            }
            aria-label="Theme mode"
          >
            <MenuItem value="light">Light</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
            <MenuItem value="system">System</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth margin="normal">
          <FormControlLabel
            control={
              <Switch
                checked={uiPrefs?.accessibility?.highContrast ?? false}
                onChange={(e) =>
                  handlePreferenceUpdate(
                    PreferenceType.UI,
                    {
                      ...uiPrefs,
                      accessibility: {
                        ...uiPrefs?.accessibility,
                        highContrast: e.target.checked,
                      },
                    },
                    confidenceScores[PreferenceType.UI]
                  )
                }
                inputProps={{ 'aria-label': 'Enable high contrast' }}
              />
            }
            label="High Contrast Mode"
          />
        </FormControl>
      </PreferenceSection>
    );
  }, [getPreference, confidenceScores, handlePreferenceUpdate]);

  if (loading) {
    return (
      <Box sx={{ p: SPACING.md / 8 }}>
        <LinearProgress aria-label="Loading preferences" />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: SPACING.md / 8 }}>
        Failed to load preferences: {error}
      </Alert>
    );
  }

  return (
    <Box
      component="main"
      role="main"
      aria-label="Preferences"
      sx={{
        p: SPACING.md / 8,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACING.md / 8,
      }}
    >
      {renderChatPreferences}
      {renderAIPreferences}
      {renderUIPreferences}
    </Box>
  );
};

export default PreferencesScreen;