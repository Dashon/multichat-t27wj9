/**
 * @fileoverview Redux slice for managing chat state with real-time messaging, AI agent integration,
 * and group collaboration features. Implements <2s message delivery requirement.
 * @version 1.0.0
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'; // v1.9.7
import { IChat, ChatParticipant, isActiveChat } from '../../types/chat';
import { Message, MessageType, MessageStatus } from '../../types/message';
import { ChatService } from '../../services/chat.service';

/**
 * Enum for AI agent status tracking
 */
enum AIAgentStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  RESPONDING = 'RESPONDING',
  ERROR = 'ERROR'
}

/**
 * Enum for message delivery status tracking
 */
enum DeliveryStatus {
  SENDING = 'SENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED'
}

/**
 * Interface for chat slice state
 */
interface ChatState {
  chats: Record<string, IChat>;
  activeChat: string | null;
  loading: boolean;
  error: string | null;
  messageDeliveryStatus: Record<string, DeliveryStatus>;
  typingIndicators: Record<string, string[]>;
  aiAgentStatus: Record<string, AIAgentStatus>;
}

/**
 * Initial state for chat slice
 */
const initialState: ChatState = {
  chats: {},
  activeChat: null,
  loading: false,
  error: null,
  messageDeliveryStatus: {},
  typingIndicators: {},
  aiAgentStatus: {}
};

/**
 * Redux slice for chat management
 */
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // Chat management
    setActiveChat: (state, action: PayloadAction<string>) => {
      state.activeChat = action.payload;
      state.error = null;
    },

    addChat: (state, action: PayloadAction<IChat>) => {
      state.chats[action.payload.id] = action.payload;
    },

    updateChat: (state, action: PayloadAction<{ chatId: string; updates: Partial<IChat> }>) => {
      const { chatId, updates } = action.payload;
      if (state.chats[chatId]) {
        state.chats[chatId] = { ...state.chats[chatId], ...updates };
      }
    },

    // Message management
    addMessage: (state, action: PayloadAction<{ chatId: string; message: Message }>) => {
      const { chatId, message } = action.payload;
      if (state.chats[chatId]) {
        state.chats[chatId].messages.push(message);
        state.messageDeliveryStatus[message.id] = DeliveryStatus.SENDING;
      }
    },

    updateMessageStatus: (state, action: PayloadAction<{ messageId: string; status: DeliveryStatus }>) => {
      const { messageId, status } = action.payload;
      state.messageDeliveryStatus[messageId] = status;
    },

    // AI agent management
    setAIAgentStatus: (state, action: PayloadAction<{ chatId: string; status: AIAgentStatus }>) => {
      const { chatId, status } = action.payload;
      state.aiAgentStatus[chatId] = status;
    },

    // Typing indicators
    setTypingIndicator: (state, action: PayloadAction<{ chatId: string; userId: string; isTyping: boolean }>) => {
      const { chatId, userId, isTyping } = action.payload;
      if (!state.typingIndicators[chatId]) {
        state.typingIndicators[chatId] = [];
      }
      
      if (isTyping) {
        if (!state.typingIndicators[chatId].includes(userId)) {
          state.typingIndicators[chatId].push(userId);
        }
      } else {
        state.typingIndicators[chatId] = state.typingIndicators[chatId].filter(id => id !== userId);
      }
    },

    // Error handling
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },

    clearError: (state) => {
      state.error = null;
    },

    // Loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    }
  }
});

// Export actions
export const {
  setActiveChat,
  addChat,
  updateChat,
  addMessage,
  updateMessageStatus,
  setAIAgentStatus,
  setTypingIndicator,
  setError,
  clearError,
  setLoading
} = chatSlice.actions;

// Selectors
export const selectActiveChat = (state: { chat: ChatState }) => 
  state.chat.activeChat ? state.chat.chats[state.chat.activeChat] : null;

export const selectChat = (state: { chat: ChatState }, chatId: string) => 
  state.chat.chats[chatId];

export const selectMessageDeliveryStatus = (state: { chat: ChatState }, messageId: string) =>
  state.chat.messageDeliveryStatus[messageId];

export const selectAIAgentStatus = (state: { chat: ChatState }, chatId: string) =>
  state.chat.aiAgentStatus[chatId];

export const selectTypingUsers = (state: { chat: ChatState }, chatId: string) =>
  state.chat.typingIndicators[chatId] || [];

// Thunk action creators
export const createChat = (name: string, participants: string[]) => async (dispatch: any) => {
  dispatch(setLoading(true));
  try {
    const chatService = new ChatService(/* websocket service */);
    const newChat = await chatService.createChat(name, participants);
    dispatch(addChat(newChat));
    dispatch(setActiveChat(newChat.id));
  } catch (error) {
    dispatch(setError(error.message));
  } finally {
    dispatch(setLoading(false));
  }
};

export const sendMessage = (chatId: string, message: Message) => async (dispatch: any) => {
  dispatch(addMessage({ chatId, message }));
  try {
    const chatService = new ChatService(/* websocket service */);
    await chatService.sendMessage(message);
    dispatch(updateMessageStatus({ messageId: message.id, status: DeliveryStatus.DELIVERED }));
  } catch (error) {
    dispatch(updateMessageStatus({ messageId: message.id, status: DeliveryStatus.FAILED }));
    dispatch(setError(`Failed to send message: ${error.message}`));
  }
};

export const triggerAIAgent = (chatId: string, agentId: string, context: string) => async (dispatch: any) => {
  dispatch(setAIAgentStatus({ chatId, status: AIAgentStatus.PROCESSING }));
  try {
    const chatService = new ChatService(/* websocket service */);
    await chatService.triggerAIAgent(agentId, chatId, context);
    dispatch(setAIAgentStatus({ chatId, status: AIAgentStatus.IDLE }));
  } catch (error) {
    dispatch(setAIAgentStatus({ chatId, status: AIAgentStatus.ERROR }));
    dispatch(setError(`AI agent error: ${error.message}`));
  }
};

export default chatSlice.reducer;