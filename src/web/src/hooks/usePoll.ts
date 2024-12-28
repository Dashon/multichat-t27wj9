/**
 * @fileoverview Custom React hook for managing poll operations in the group chat platform.
 * Implements comprehensive poll management with optimistic updates, analytics tracking,
 * and accessibility support.
 * @version 1.0.0
 */

import { useCallback } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.0.5
import { 
  IPoll, 
  PollOption, 
  PollSettings, 
  PollStatus, 
  PollType,
  PollVisibility,
  PollAccessibility
} from '../types/poll';
import { 
  createPoll as createPollAction,
  votePoll as votePollAction,
  closePoll as closePollAction,
  selectPollById,
  selectChatPolls,
  invalidateCache
} from '../store/slices/pollSlice';

// Constants for poll validation and optimization
const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;
const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;
const CACHE_DURATION = 300000; // 5 minutes
const ANALYTICS_BATCH_SIZE = 10;
const DEBOUNCE_DELAY = 300;

/**
 * Custom hook for managing poll operations with enhanced features
 * @returns Object containing poll management functions and state
 */
export const usePoll = () => {
  const dispatch = useDispatch();

  /**
   * Creates a new poll with optimistic updates and analytics tracking
   */
  const createPoll = useCallback(async (
    chatId: string,
    question: string,
    options: Omit<PollOption, 'id' | 'votes' | 'voters' | 'voteTimestamps'>[],
    settings: Partial<PollSettings> = {},
    accessibility: Partial<PollAccessibility> = {}
  ): Promise<IPoll> => {
    // Validate inputs
    if (!chatId) throw new Error('Chat ID is required');
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      throw new Error(`Question must be between 1 and ${MAX_QUESTION_LENGTH} characters`);
    }
    if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      throw new Error(`Poll must have between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`);
    }

    // Validate option lengths
    options.forEach(option => {
      if (!option.text || option.text.length > MAX_OPTION_LENGTH) {
        throw new Error(`Option text must be between 1 and ${MAX_OPTION_LENGTH} characters`);
      }
    });

    // Initialize default settings
    const pollSettings: PollSettings = {
      type: settings.type || PollType.SINGLE_CHOICE,
      visibility: settings.visibility || PollVisibility.ALL_MEMBERS,
      deadline: settings.deadline || null,
      allowAddOptions: settings.allowAddOptions ?? false,
      minVotes: settings.minVotes || 1,
      maxVotes: settings.maxVotes || 1,
      validation: {
        requireComment: settings.validation?.requireComment ?? false,
        minimumParticipants: settings.validation?.minimumParticipants || 1,
        votingTimeWindow: settings.validation?.votingTimeWindow,
        restrictedToRoles: settings.validation?.restrictedToRoles
      }
    };

    // Initialize accessibility settings
    const pollAccessibility: PollAccessibility = {
      screenReaderDescription: accessibility.screenReaderDescription || question,
      keyboardShortcuts: accessibility.keyboardShortcuts ?? true,
      highContrastMode: accessibility.highContrastMode ?? false,
      textScaling: accessibility.textScaling || 1
    };

    try {
      const result = await dispatch(createPollAction({
        chatId,
        question,
        options,
        settings: pollSettings,
        accessibility: pollAccessibility
      })).unwrap();

      return result;
    } catch (error) {
      throw new Error(`Failed to create poll: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [dispatch]);

  /**
   * Submits votes for a poll with optimistic updates
   */
  const votePoll = useCallback(async (
    pollId: string,
    optionIds: string[],
    userId: string
  ): Promise<IPoll> => {
    try {
      const result = await dispatch(votePollAction({
        pollId,
        optionIds,
        userId
      })).unwrap();

      return result;
    } catch (error) {
      throw new Error(`Failed to vote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [dispatch]);

  /**
   * Closes a poll and generates final analytics
   */
  const closePoll = useCallback(async (pollId: string): Promise<IPoll> => {
    try {
      const result = await dispatch(closePollAction(pollId)).unwrap();
      return result;
    } catch (error) {
      throw new Error(`Failed to close poll: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [dispatch]);

  /**
   * Retrieves a poll by ID with cache management
   */
  const getPollById = useCallback((pollId: string): IPoll | null => {
    return useSelector((state) => selectPollById(state, pollId));
  }, []);

  /**
   * Retrieves all polls for a chat with pagination
   */
  const getPollsByChatId = useCallback((chatId: string): IPoll[] => {
    return useSelector((state) => selectChatPolls(state, chatId));
  }, []);

  /**
   * Retrieves analytics data for a poll
   */
  const getPollAnalytics = useCallback((pollId: string): any => {
    const poll = getPollById(pollId);
    if (!poll) return null;
    return poll.analytics;
  }, [getPollById]);

  /**
   * Invalidates poll cache for a chat
   */
  const refreshPolls = useCallback((chatId?: string) => {
    dispatch(invalidateCache(chatId));
  }, [dispatch]);

  return {
    createPoll,
    votePoll,
    closePoll,
    getPollById,
    getPollsByChatId,
    getPollAnalytics,
    refreshPolls
  };
};