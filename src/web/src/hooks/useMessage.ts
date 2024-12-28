/**
 * @fileoverview Enhanced React hook for managing message operations in the chat interface.
 * Implements real-time message handling, delivery tracking, and AI agent interactions.
 * @version 1.0.0
 */

import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Message, MessageStatus, MessageType } from '../types/message';
import messageService from '../services/message.service';
import { 
  addMessage, 
  updateDeliveryStatus, 
  fetchMessages, 
  sendMessage 
} from '../store/slices/messageSlice';

// Constants for message handling
const INITIAL_MESSAGE_LOAD = 50;
const MESSAGE_POLL_INTERVAL = 30000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const MESSAGE_BATCH_SIZE = 20;

/**
 * Custom error type for message operations
 */
interface MessageError {
  code: string;
  message: string;
  timestamp: number;
  messageId?: string;
}

/**
 * Hook state interface
 */
interface MessageHookState {
  messages: Message[];
  loading: boolean;
  error: MessageError | null;
  messageStatus: Record<string, MessageStatus>;
}

/**
 * Enhanced message hook for real-time chat operations
 * @param chatId - ID of the current chat room
 */
export const useMessage = (chatId: string) => {
  const dispatch = useDispatch();

  // Redux selectors with memoization
  const messages = useSelector((state: any) => 
    state.messages.messages[chatId]?.allIds.map(
      (id: string) => state.messages.messages[chatId].byId[id]
    ) || []
  );
  const loading = useSelector((state: any) => state.messages.loading.status === 'loading');
  const error = useSelector((state: any) => state.messages.error);
  const messageStatus = useSelector((state: any) => state.messages.messageDeliveryStatus);

  /**
   * Initializes message subscription and loads initial messages
   */
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let pollInterval: NodeJS.Timeout | undefined;

    const initializeMessages = async () => {
      try {
        // Load initial messages
        await dispatch(fetchMessages({ 
          chatId, 
          limit: INITIAL_MESSAGE_LOAD 
        })).unwrap();

        // Set up real-time subscription
        unsubscribe = messageService.subscribeToMessages(chatId, (message: Message) => {
          dispatch(addMessage(message));
          trackMessageDelivery(message);
        });

        // Set up polling for missed messages
        pollInterval = setInterval(async () => {
          const lastMessage = messages[messages.length - 1];
          if (lastMessage) {
            await dispatch(fetchMessages({
              chatId,
              limit: MESSAGE_BATCH_SIZE,
              after: lastMessage.timestamp
            })).unwrap();
          }
        }, MESSAGE_POLL_INTERVAL);

      } catch (error) {
        console.error('Failed to initialize messages:', error);
      }
    };

    initializeMessages();

    // Cleanup subscriptions
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      messageService.unsubscribeFromMessages(chatId);
    };
  }, [chatId, dispatch]);

  /**
   * Tracks message delivery status
   */
  const trackMessageDelivery = useCallback((message: Message) => {
    messageService.trackMessageDelivery(message.id, (status: MessageStatus) => {
      dispatch(updateDeliveryStatus({ messageId: message.id, status }));
    });
  }, [dispatch]);

  /**
   * Sends a message with optimistic updates and AI context handling
   */
  const handleMessageSend = useCallback(async (
    content: string,
    metadata: any = {},
    aiContext: any = null
  ): Promise<void> => {
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      chatId,
      content,
      metadata: {
        ...metadata,
        status: MessageStatus.SENDING,
        aiContext
      },
      timestamp: new Date().toISOString()
    };

    try {
      // Add optimistic message
      dispatch(addMessage(optimisticMessage));

      // Send actual message
      const sentMessage = await dispatch(sendMessage(optimisticMessage)).unwrap();

      // Update with real message ID
      dispatch(updateDeliveryStatus({ 
        messageId: sentMessage.id, 
        status: MessageStatus.DELIVERED 
      }));

    } catch (error) {
      dispatch(updateDeliveryStatus({ 
        messageId: tempId, 
        status: MessageStatus.FAILED 
      }));
      throw error;
    }
  }, [chatId, dispatch]);

  /**
   * Retries failed message send
   */
  const retryMessage = useCallback(async (messageId: string): Promise<void> => {
    const failedMessage = messages.find(msg => msg.id === messageId);
    if (!failedMessage) return;

    let retryCount = 0;
    const retry = async (): Promise<void> => {
      try {
        await messageService.retryMessage(failedMessage);
        dispatch(updateDeliveryStatus({ 
          messageId, 
          status: MessageStatus.DELIVERED 
        }));
      } catch (error) {
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return retry();
        }
        throw error;
      }
    };

    await retry();
  }, [messages, dispatch]);

  return {
    messages,
    sendMessage: handleMessageSend,
    retryMessage,
    loading,
    error,
    messageStatus
  };
};