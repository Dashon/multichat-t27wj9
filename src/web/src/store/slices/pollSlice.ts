/**
 * @fileoverview Redux slice for managing poll state in the group chat platform's web client.
 * Implements comprehensive poll management with optimized performance and caching.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit'; // v1.9.0
import { IPoll, PollOption, PollSettings, PollStatus } from '../../types/poll';
import { PollService } from '../../services/poll.service';

// Initialize poll service singleton
const pollService = new PollService();

// Constants
const POLL_CACHE_DURATION = 300000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;

/**
 * State interface for poll management
 */
interface PollState {
  polls: Record<string, IPoll>;
  pollsByChatId: Record<string, string[]>;
  loading: boolean;
  error: string | null;
  lastUpdated: Record<string, number>;
  optimisticUpdates: Record<string, IPoll>;
}

/**
 * Initial state with type safety
 */
const initialState: PollState = {
  polls: {},
  pollsByChatId: {},
  loading: false,
  error: null,
  lastUpdated: {},
  optimisticUpdates: {}
};

/**
 * Async thunk for creating a new poll
 */
export const createPoll = createAsyncThunk(
  'polls/createPoll',
  async (params: {
    chatId: string;
    question: string;
    options: Omit<PollOption, 'id' | 'votes' | 'voters' | 'voteTimestamps'>[];
    settings: Partial<PollSettings>;
  }, { rejectWithValue }) => {
    try {
      const poll = await pollService.createPoll(
        params.chatId,
        params.question,
        params.options,
        params.settings
      );
      return poll;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to create poll');
    }
  }
);

/**
 * Async thunk for submitting a vote
 */
export const votePoll = createAsyncThunk(
  'polls/votePoll',
  async (params: {
    pollId: string;
    optionIds: string[];
    userId: string;
  }, { rejectWithValue, getState }) => {
    try {
      const poll = await pollService.vote(params.pollId, params.optionIds);
      return poll;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to submit vote');
    }
  }
);

/**
 * Async thunk for closing a poll
 */
export const closePoll = createAsyncThunk(
  'polls/closePoll',
  async (pollId: string, { rejectWithValue }) => {
    try {
      const poll = await pollService.closePoll(pollId);
      return poll;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to close poll');
    }
  }
);

/**
 * Async thunk for fetching polls for a chat
 */
export const fetchChatPolls = createAsyncThunk(
  'polls/fetchChatPolls',
  async (chatId: string, { rejectWithValue, getState }) => {
    try {
      const state = getState() as { polls: PollState };
      const lastUpdated = state.polls.lastUpdated[chatId] || 0;
      
      // Return cached data if within cache duration
      if (Date.now() - lastUpdated < POLL_CACHE_DURATION) {
        return null;
      }

      const polls = await pollService.getChatPolls(chatId);
      return { chatId, polls };
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch polls');
    }
  }
);

/**
 * Poll slice with enhanced caching and optimistic updates
 */
const pollSlice = createSlice({
  name: 'polls',
  initialState,
  reducers: {
    clearPollError: (state) => {
      state.error = null;
    },
    invalidateCache: (state, action) => {
      const chatId = action.payload;
      if (chatId) {
        delete state.lastUpdated[chatId];
      } else {
        state.lastUpdated = {};
      }
    }
  },
  extraReducers: (builder) => {
    builder
      // Create Poll
      .addCase(createPoll.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createPoll.fulfilled, (state, action) => {
        const poll = action.payload;
        state.polls[poll.id] = poll;
        state.pollsByChatId[poll.chatId] = [
          ...(state.pollsByChatId[poll.chatId] || []),
          poll.id
        ];
        state.loading = false;
        state.lastUpdated[poll.chatId] = Date.now();
      })
      .addCase(createPoll.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Vote Poll
      .addCase(votePoll.pending, (state, action) => {
        state.loading = true;
        state.error = null;
        // Store optimistic update
        const { pollId, optionIds, userId } = action.meta.arg;
        if (state.polls[pollId]) {
          state.optimisticUpdates[pollId] = {
            ...state.polls[pollId],
            options: state.polls[pollId].options.map(option => ({
              ...option,
              votes: optionIds.includes(option.id) ? option.votes + 1 : option.votes,
              voters: optionIds.includes(option.id) ? [...option.voters, userId] : option.voters
            }))
          };
        }
      })
      .addCase(votePoll.fulfilled, (state, action) => {
        const poll = action.payload;
        state.polls[poll.id] = poll;
        delete state.optimisticUpdates[poll.id];
        state.loading = false;
        state.lastUpdated[poll.chatId] = Date.now();
      })
      .addCase(votePoll.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        // Revert optimistic update
        const pollId = action.meta.arg.pollId;
        delete state.optimisticUpdates[pollId];
      })

      // Close Poll
      .addCase(closePoll.fulfilled, (state, action) => {
        const poll = action.payload;
        state.polls[poll.id] = {
          ...poll,
          status: PollStatus.CLOSED
        };
        state.lastUpdated[poll.chatId] = Date.now();
      })

      // Fetch Chat Polls
      .addCase(fetchChatPolls.fulfilled, (state, action) => {
        if (action.payload) {
          const { chatId, polls } = action.payload;
          polls.forEach(poll => {
            state.polls[poll.id] = poll;
          });
          state.pollsByChatId[chatId] = polls.map(poll => poll.id);
          state.lastUpdated[chatId] = Date.now();
        }
      });
  }
});

// Memoized selectors for optimized performance
export const selectPollById = createSelector(
  [(state: { polls: PollState }) => state.polls.polls, 
   (_, pollId: string) => pollId],
  (polls, pollId) => polls[pollId] || null
);

export const selectChatPolls = createSelector(
  [(state: { polls: PollState }) => state.polls.polls,
   (state: { polls: PollState }) => state.polls.pollsByChatId,
   (_, chatId: string) => chatId],
  (polls, pollsByChatId, chatId) => {
    const pollIds = pollsByChatId[chatId] || [];
    return pollIds.map(id => polls[id]).filter(Boolean);
  }
);

export const { clearPollError, invalidateCache } = pollSlice.actions;
export default pollSlice.reducer;