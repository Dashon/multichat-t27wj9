/**
 * @fileoverview Enhanced chat service implementation for the AI-Enhanced Group Chat Platform.
 * Provides real-time messaging, chat management, and AI agent integration with robust error handling.
 * @version 1.0.0
 */

// External imports
import axios, { AxiosInstance } from 'axios'; // v1.6.0
import rax from 'retry-axios'; // v3.0.0

// Internal imports
import { WebSocketService } from './websocket.service';
import { IChat, ChatParticipant, isActiveChat } from '../types/chat';
import { Message, MessageType, MessageStatus } from '../types/message';
import { API_CONSTANTS } from '../config/constants';

/**
 * Interface for message delivery tracking
 */
interface MessageDeliveryStatus {
  messageId: string;
  status: MessageStatus;
  timestamp: number;
  retryCount: number;
  error?: string;
}

/**
 * Interface for connection monitoring
 */
interface ConnectionMonitor {
  isConnected: boolean;
  lastConnectedAt?: Date;
  reconnectAttempts: number;
  messageQueue: Map<string, Message>;
}

/**
 * Enhanced chat service with reliability and monitoring features
 */
export class ChatService {
  private readonly websocketService: WebSocketService;
  private readonly httpClient: AxiosInstance;
  private readonly messageCallbacks: Map<string, (message: Message) => void>;
  private readonly deliveryTracking: Map<string, MessageDeliveryStatus>;
  private readonly connectionMonitor: ConnectionMonitor;

  /**
   * Initializes chat service with enhanced monitoring and reliability features
   * @param websocketService WebSocket service instance
   */
  constructor(websocketService: WebSocketService) {
    this.websocketService = websocketService;
    this.messageCallbacks = new Map();
    this.deliveryTracking = new Map();
    
    // Initialize connection monitoring
    this.connectionMonitor = {
      isConnected: false,
      reconnectAttempts: 0,
      messageQueue: new Map()
    };

    // Configure HTTP client with retry capabilities
    this.httpClient = axios.create({
      baseURL: `${API_CONSTANTS.BASE_URL}/api/${API_CONSTANTS.API_VERSION}`,
      timeout: API_CONSTANTS.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Configure retry-axios
    this.httpClient.defaults.raxConfig = {
      retry: API_CONSTANTS.MAX_RETRIES,
      retryDelay: this.calculateRetryDelay,
      statusCodesToRetry: [[408, 429, 500, 502, 503, 504]]
    };
    rax.attach(this.httpClient);

    // Set up WebSocket event handlers
    this.setupWebSocketHandlers();
  }

  /**
   * Sends a message with delivery guarantees and offline support
   * @param message Message to send
   * @returns Promise resolving to message delivery status
   */
  public async sendMessage(message: Message): Promise<MessageDeliveryStatus> {
    // Validate message data
    if (!message.chatId || !message.content) {
      throw new Error('Invalid message format');
    }

    // Create delivery tracking entry
    const deliveryStatus: MessageDeliveryStatus = {
      messageId: message.id,
      status: MessageStatus.SENDING,
      timestamp: Date.now(),
      retryCount: 0
    };
    this.deliveryTracking.set(message.id, deliveryStatus);

    try {
      // Attempt WebSocket delivery
      await this.websocketService.sendMessage(message);
      
      // Update delivery status on success
      deliveryStatus.status = MessageStatus.DELIVERED;
      this.deliveryTracking.set(message.id, deliveryStatus);
      
      return deliveryStatus;
    } catch (error) {
      return this.handleMessageError(message, deliveryStatus, error);
    }
  }

  /**
   * Subscribes to messages in a specific chat
   * @param chatId Chat ID to subscribe to
   * @param callback Callback function for new messages
   */
  public subscribeToChat(chatId: string, callback: (message: Message) => void): void {
    this.messageCallbacks.set(chatId, callback);
    
    // Set up message handler if not already listening
    if (!this.websocketService.getConnectionStats().messagesReceived) {
      this.websocketService.onMessage((message: Message) => {
        if (message.chatId === chatId) {
          callback(message);
        }
      });
    }
  }

  /**
   * Creates a new chat group
   * @param name Chat group name
   * @param participants Initial participants
   * @returns Promise resolving to created chat
   */
  public async createChat(name: string, participants: string[]): Promise<IChat> {
    try {
      const response = await this.httpClient.post<IChat>('/chats', {
        name,
        participants
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create chat: ${error.message}`);
    }
  }

  /**
   * Handles AI agent mentions in messages
   * @param message Message containing AI mention
   */
  private async handleAIAgentMention(message: Message): Promise<void> {
    if (!message.metadata.mentions?.length) {
      return;
    }

    const aiMentions = message.metadata.mentions.filter(mention => 
      mention.startsWith('@') && ['@foodie', '@explorer', '@planner'].includes(mention)
    );

    if (aiMentions.length > 0) {
      try {
        // Process AI request
        const response = await this.httpClient.post(`/ai/process`, {
          messageId: message.id,
          chatId: message.chatId,
          mentions: aiMentions,
          context: message.metadata.aiContext
        });

        // Send AI response
        const aiResponse: Message = {
          id: crypto.randomUUID(),
          chatId: message.chatId,
          senderId: response.data.agentId,
          content: response.data.response,
          timestamp: new Date(),
          metadata: {
            type: MessageType.AI_RESPONSE,
            status: MessageStatus.DELIVERED,
            mentions: [],
            aiContext: response.data.context
          }
        };

        await this.sendMessage(aiResponse);
      } catch (error) {
        console.error('AI processing error:', error);
      }
    }
  }

  /**
   * Monitors message delivery status and handles retries
   * @param messageId Message ID to monitor
   */
  private async monitorMessageDelivery(messageId: string): Promise<void> {
    const status = this.deliveryTracking.get(messageId);
    if (!status) return;

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds

    while (status.status === MessageStatus.SENDING && status.retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      
      if (status.status !== MessageStatus.DELIVERED) {
        status.retryCount++;
        // Attempt redelivery
        const message = this.connectionMonitor.messageQueue.get(messageId);
        if (message) {
          try {
            await this.websocketService.sendMessage(message);
            status.status = MessageStatus.DELIVERED;
          } catch (error) {
            status.error = error.message;
          }
        }
      }
    }

    // Update final status
    if (status.status !== MessageStatus.DELIVERED) {
      status.status = MessageStatus.FAILED;
      this.deliveryTracking.set(messageId, status);
    }
  }

  /**
   * Sets up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    this.websocketService.onMessage((message: Message) => {
      // Process AI mentions
      if (message.metadata.mentions?.length) {
        this.handleAIAgentMention(message);
      }

      // Update delivery status
      if (message.metadata.status === MessageStatus.DELIVERED) {
        const status = this.deliveryTracking.get(message.id);
        if (status) {
          status.status = MessageStatus.DELIVERED;
          this.deliveryTracking.set(message.id, status);
        }
      }

      // Trigger callbacks
      const callback = this.messageCallbacks.get(message.chatId);
      if (callback) {
        callback(message);
      }
    });
  }

  /**
   * Handles message send errors
   */
  private handleMessageError(
    message: Message, 
    status: MessageDeliveryStatus, 
    error: Error
  ): MessageDeliveryStatus {
    status.status = MessageStatus.FAILED;
    status.error = error.message;
    this.deliveryTracking.set(message.id, status);

    // Queue message for retry if connection is lost
    if (!this.connectionMonitor.isConnected) {
      this.connectionMonitor.messageQueue.set(message.id, message);
    }

    return status;
  }

  /**
   * Calculates retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 10000);
  }

  /**
   * Retrieves message delivery status
   * @param messageId Message ID to check
   */
  public getDeliveryStatus(messageId: string): MessageDeliveryStatus | undefined {
    return this.deliveryTracking.get(messageId);
  }

  /**
   * Gets current connection status
   */
  public getConnectionStatus(): boolean {
    return this.connectionMonitor.isConnected;
  }
}