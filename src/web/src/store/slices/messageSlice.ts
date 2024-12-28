/**
 * @fileoverview Redux slice for managing real-time message state with thread organization
 * and AI agent interactions. Implements comprehensive error handling and performance optimizations.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.7
import { Message, MessageStatus, MessageType } from '../../types/message';
import { MessageService } from '../../services/message.service';

/**
 * Normalized message state structure for efficient updates and lookups
 */
interface NormalizedMessages {
  byId: Record<string, Message>;
  allIds: string[];
}

/**
 * Thread state structure with message references
 */
interface ThreadState {
  messageIds: string[];
  metadata: {
    lastActivityAt: string;
    participantCount: number;
    messageCount: number;
  };
}

/**
 * Loading state with granular status tracking
 */
interface LoadingState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  type: 'fetch' | 'send' | 'update' | null;
  entityId: string | null;
}

/**
 * Error state with detailed information
 */
interface ErrorState {
  code: string;
  message: string;
  entityId?: string;
  timestamp: number;
}

/**
 * Message slice state interface
 */
interface MessageState {
  messages: Record<string, NormalizedMessages>;
  threads: Record<string, ThreadState>;
  loading: LoadingState;
  error: ErrorState | null;
  currentChatId: string | null;
  currentThreadId: string | null;
  messageDeliveryStatus: Record<string, MessageStatus>;
}

/**
 * Initial state configuration
 */
const initialState: MessageState = {
  messages: {},
  threads: {},
  loading: {
    status: 'idle',
    type: null,
    entityId: null
  },
  error: null,
  currentChatId: null,
  currentThreadId: null,
  messageDeliveryStatus: {}
};

/**
 * Async thunk for fetching messages with pagination and caching
 */
export const fetchMessages = createAsyncThunk(
  'messages/fetchMessages',
  async ({ chatId, limit = 50, offset = 0 }: { chatId: string; limit?: number; offset?: number }, { rejectWithValue }) => {
    try {
      const messageService = new MessageService();
      const messages = await messageService.getMessages(chatId, { limit, offset });
      return { chatId, messages };
    } catch (error) {
      return rejectWithValue({
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch messages',
        timestamp: Date.now()
      });
    }
  }
);

/**
 * Async thunk for sending messages with AI processing and delivery tracking
 */
export const sendMessage = createAsyncThunk(
  'messages/sendMessage',
  async (message: Message, { rejectWithValue }) => {
    try {
      const messageService = new MessageService();
      await messageService.sendMessage(message);
      return message;
    } catch (error) {
      return rejectWithValue({
        code: 'SEND_ERROR',
        message: error instanceof Error ? error.message : 'Failed to send message',
        entityId: message.id,
        timestamp: Date.now()
      });
    }
  }
);

/**
 * Message slice with comprehensive state management
 */
const messageSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    /**
     * Adds a new message with normalization
     */
    addMessage(state, action: PayloadAction<Message>) {
      const message = action.payload;
      const chatId = message.chatId;

      // Initialize chat state if needed
      if (!state.messages[chatId]) {
        state.messages[chatId] = { byId: {}, allIds: [] };
      }

      // Add message to normalized structure
      state.messages[chatId].byId[message.id] = message;
      if (!state.messages[chatId].allIds.includes(message.id)) {
        state.messages[chatId].allIds.push(message.id);
      }

      // Update thread state if applicable
      if (message.threadId) {
        if (!state.threads[message.threadId]) {
          state.threads[message.threadId] = {
            messageIds: [],
            metadata: {
              lastActivityAt: message.timestamp.toString(),
              participantCount: 1,
              messageCount: 0
            }
          };
        }
        state.threads[message.threadId].messageIds.push(message.id);
        state.threads[message.threadId].metadata.messageCount++;
        state.threads[message.threadId].metadata.lastActivityAt = message.timestamp.toString();
      }
    },

    /**
     * Updates message delivery status
     */
    updateDeliveryStatus(state, action: PayloadAction<{ messageId: string; status: MessageStatus }>) {
      const { messageId, status } = action.payload;
      state.messageDeliveryStatus[messageId] = status;
    },

    /**
     * Sets current chat context
     */
    setCurrentChat(state, action: PayloadAction<string>) {
      state.currentChatId = action.payload;
      state.currentThreadId = null;
    },

    /**
     * Updates thread state
     */
    updateThreadState(state, action: PayloadAction<{ threadId: string; metadata: Partial<ThreadState['metadata']> }>) {
      const { threadId, metadata } = action.payload;
      if (state.threads[threadId]) {
        state.threads[threadId].metadata = {
          ...state.threads[threadId].metadata,
          ...metadata
        };
      }
    },

    /**
     * Clears error state
     */
    clearError(state) {
      state.error = null;
    },

    /**
     * Resets message state
     */
    resetState: () => initialState
  },
  extraReducers: (builder) => {
    builder
      // Fetch messages handlers
      .addCase(fetchMessages.pending, (state, action) => {
        state.loading = {
          status: 'loading',
          type: 'fetch',
          entityId: action.meta.arg.chatId
        };
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { chatId, messages } = action.payload;
        state.loading = { status: 'succeeded', type: null, entityId: null };
        
        // Initialize chat state if needed
        if (!state.messages[chatId]) {
          state.messages[chatId] = { byId: {}, allIds: [] };
        }

        // Normalize and store messages
        messages.forEach((message: Message) => {
          state.messages[chatId].byId[message.id] = message;
          if (!state.messages[chatId].allIds.includes(message.id)) {
            state.messages[chatId].allIds.push(message.id);
          }
        });
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = { status: 'failed', type: null, entityId: null };
        state.error = action.payload as ErrorState;
      })

      // Send message handlers
      .addCase(sendMessage.pending, (state, action) => {
        state.loading = {
          status: 'loading',
          type: 'send',
          entityId: action.meta.arg.id
        };
        state.messageDeliveryStatus[action.meta.arg.id] = MessageStatus.SENDING;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.loading = { status: 'succeeded', type: null, entityId: null };
        state.messageDeliveryStatus[action.payload.id] = MessageStatus.DELIVERED;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.loading = { status: 'failed', type: null, entityId: null };
        state.error = action.payload as ErrorState;
        if (action.meta.arg.id) {
          state.messageDeliveryStatus[action.meta.arg.id] = MessageStatus.FAILED;
        }
      });
  }
});

// Export actions and reducer
export const {
  addMessage,
  updateDeliveryStatus,
  setCurrentChat,
  updateThreadState,
  clearError,
  resetState
} = messageSlice.actions;

export default messageSlice.reducer;