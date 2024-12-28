/**
 * @fileoverview Enhanced poll creation component implementing Material Design 3 principles
 * with comprehensive accessibility features and real-time validation.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { styled } from '@mui/material/styles'; // v5.14+
import { 
  FormControlLabel, 
  Switch, 
  FormGroup, 
  Alert,
  Box,
  Typography,
  IconButton
} from '@mui/material'; // v5.14+
import debounce from 'lodash/debounce'; // v4.17+
import DeleteIcon from '@mui/icons-material/Delete'; // v5.14+
import AddIcon from '@mui/icons-material/Add'; // v5.14+

// Internal imports
import CustomButton from '../common/Button';
import Input from '../common/Input';
import { usePoll } from '../../hooks/usePoll';
import { PollType, PollVisibility, IPoll } from '../../types/poll';

// Constants for validation
const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;
const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;

// Styled components
const PollContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  maxWidth: '600px',
  margin: '0 auto',
}));

const OptionContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
}));

interface PollCreateProps {
  chatId: string;
  onClose: () => void;
  onSuccess: (poll: IPoll) => void;
  onError: (error: Error) => void;
  initialData?: Partial<IPoll>;
}

interface PollFormState {
  question: string;
  options: Array<{ id: string; text: string }>;
  settings: {
    type: PollType;
    visibility: PollVisibility;
    allowAddOptions: boolean;
    deadline: Date | null;
  };
  errors: Record<string, string>;
  isSubmitting: boolean;
  isDirty: boolean;
}

const PollCreate = memo(({
  chatId,
  onClose,
  onSuccess,
  onError,
  initialData
}: PollCreateProps) => {
  // Initialize form state
  const [formState, setFormState] = useState<PollFormState>({
    question: initialData?.question || '',
    options: initialData?.options?.map(opt => ({ 
      id: crypto.randomUUID(),
      text: opt.text 
    })) || [{ id: crypto.randomUUID(), text: '' }, { id: crypto.randomUUID(), text: '' }],
    settings: {
      type: initialData?.settings?.type || PollType.SINGLE_CHOICE,
      visibility: initialData?.settings?.visibility || PollVisibility.ALL_MEMBERS,
      allowAddOptions: initialData?.settings?.allowAddOptions || false,
      deadline: initialData?.settings?.deadline || null,
    },
    errors: {},
    isSubmitting: false,
    isDirty: false,
  });

  const { createPoll } = usePoll();
  const formRef = useRef<HTMLFormElement>(null);

  // Validation helper
  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    if (!formState.question.trim()) {
      errors.question = 'Question is required';
    } else if (formState.question.length > MAX_QUESTION_LENGTH) {
      errors.question = `Question must be less than ${MAX_QUESTION_LENGTH} characters`;
    }

    const validOptions = formState.options.filter(opt => opt.text.trim());
    if (validOptions.length < MIN_OPTIONS) {
      errors.options = `At least ${MIN_OPTIONS} options are required`;
    }

    formState.options.forEach((opt, idx) => {
      if (opt.text.length > MAX_OPTION_LENGTH) {
        errors[`option-${idx}`] = `Option must be less than ${MAX_OPTION_LENGTH} characters`;
      }
    });

    return errors;
  }, [formState.question, formState.options]);

  // Debounced validation
  const debouncedValidate = useCallback(
    debounce(() => {
      const errors = validateForm();
      setFormState(prev => ({ ...prev, errors }));
    }, 300),
    [validateForm]
  );

  // Update validation on form changes
  useEffect(() => {
    if (formState.isDirty) {
      debouncedValidate();
    }
    return () => {
      debouncedValidate.cancel();
    };
  }, [formState.question, formState.options, formState.isDirty, debouncedValidate]);

  // Handle question change
  const handleQuestionChange = useCallback((value: string) => {
    setFormState(prev => ({
      ...prev,
      question: value,
      isDirty: true,
    }));
  }, []);

  // Handle option change
  const handleOptionChange = useCallback((id: string, value: string) => {
    setFormState(prev => ({
      ...prev,
      options: prev.options.map(opt => 
        opt.id === id ? { ...opt, text: value } : opt
      ),
      isDirty: true,
    }));
  }, []);

  // Add option
  const handleAddOption = useCallback(() => {
    if (formState.options.length >= MAX_OPTIONS) return;
    
    setFormState(prev => ({
      ...prev,
      options: [...prev.options, { id: crypto.randomUUID(), text: '' }],
      isDirty: true,
    }));
  }, [formState.options.length]);

  // Remove option
  const handleRemoveOption = useCallback((id: string) => {
    setFormState(prev => ({
      ...prev,
      options: prev.options.filter(opt => opt.id !== id),
      isDirty: true,
    }));
  }, []);

  // Handle settings change
  const handleSettingChange = useCallback((setting: keyof PollFormState['settings'], value: any) => {
    setFormState(prev => ({
      ...prev,
      settings: { ...prev.settings, [setting]: value },
      isDirty: true,
    }));
  }, []);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormState(prev => ({ ...prev, errors }));
      return;
    }

    setFormState(prev => ({ ...prev, isSubmitting: true }));

    try {
      const poll = await createPoll(
        chatId,
        formState.question,
        formState.options.map(opt => ({ text: opt.text.trim() })),
        formState.settings
      );
      onSuccess(poll);
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Failed to create poll'));
    } finally {
      setFormState(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  return (
    <PollContainer
      component="form"
      ref={formRef}
      onSubmit={handleSubmit}
      role="form"
      aria-label="Create Poll"
    >
      <Typography variant="h6" gutterBottom>
        Create Poll
      </Typography>

      <Input
        name="question"
        type="text"
        value={formState.question}
        onChange={handleQuestionChange}
        placeholder="Enter your question"
        error={formState.errors.question}
        required
        ariaLabel="Poll question"
      />

      {formState.options.map((option, index) => (
        <OptionContainer key={option.id}>
          <Input
            name={`option-${index}`}
            type="text"
            value={option.text}
            onChange={(value) => handleOptionChange(option.id, value)}
            placeholder={`Option ${index + 1}`}
            error={formState.errors[`option-${index}`]}
            required
            ariaLabel={`Poll option ${index + 1}`}
          />
          {formState.options.length > MIN_OPTIONS && (
            <IconButton
              onClick={() => handleRemoveOption(option.id)}
              aria-label={`Remove option ${index + 1}`}
              size="small"
            >
              <DeleteIcon />
            </IconButton>
          )}
        </OptionContainer>
      ))}

      {formState.options.length < MAX_OPTIONS && (
        <CustomButton
          type="button"
          variant="outlined"
          onClick={handleAddOption}
          startIcon={<AddIcon />}
          fullWidth
          ariaLabel="Add option"
        >
          Add Option
        </CustomButton>
      )}

      <FormGroup sx={{ mt: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={formState.settings.type === PollType.MULTIPLE_CHOICE}
              onChange={(e) => handleSettingChange('type', 
                e.target.checked ? PollType.MULTIPLE_CHOICE : PollType.SINGLE_CHOICE
              )}
            />
          }
          label="Allow multiple choices"
        />
        <FormControlLabel
          control={
            <Switch
              checked={formState.settings.allowAddOptions}
              onChange={(e) => handleSettingChange('allowAddOptions', e.target.checked)}
            />
          }
          label="Allow participants to add options"
        />
      </FormGroup>

      {Object.keys(formState.errors).length > 0 && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Please fix the errors before submitting
        </Alert>
      )}

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <CustomButton
          type="submit"
          variant="contained"
          color="primary"
          disabled={formState.isSubmitting || Object.keys(formState.errors).length > 0}
          loading={formState.isSubmitting}
          fullWidth
        >
          Create Poll
        </CustomButton>
        <CustomButton
          type="button"
          variant="outlined"
          onClick={onClose}
          disabled={formState.isSubmitting}
          fullWidth
        >
          Cancel
        </CustomButton>
      </Box>
    </PollContainer>
  );
});

PollCreate.displayName = 'PollCreate';

export default PollCreate;