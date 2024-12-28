/**
 * @fileoverview Custom React hook for managing WebSocket connections in the AI-Enhanced Group Chat Platform.
 * Implements real-time messaging with automatic reconnection, message queueing, and comprehensive monitoring.
 * @version 1.0.0
 */

// External imports - v18.2.0
import { useState, useEffect, useCallback, useRef } from 'react';

// Internal imports
import { WebSocketService } from '../services/websocket.service';
import { WebSocketConfig } from '../config/websocket.config';
import { Message, MessageStatus } from '../types/message';

/**
 * Connection state enumeration
 */
export enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

/**
 * Interface for monitoring connection statistics
 */
interface ConnectionStats {
  latency: number;
  uptime: number;
  messagesSent: number;
  messagesReceived: number;
  lastHeartbeat: number;
  reconnectAttempts: number;
}

/**
 * Interface for message queue management
 */
interface MessageQueue {
  pending: Message[];
  failed: Message[];
  retrying: Message[];
}

/**
 * Custom hook for WebSocket management with enhanced monitoring and reliability
 * @param config WebSocket configuration
 * @param onMessageCallback Callback function for handling received messages
 * @param onConnectionStateChange Optional callback for connection state changes
 */
export const useWebSocket = (
  config: WebSocketConfig,
  onMessageCallback: (message: Message) => void,
  onConnectionStateChange?: (state: ConnectionState) => void
) => {
  // State management
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [connectionStats, setConnectionStats] = useState<ConnectionStats>({
    latency: 0,
    uptime: 0,
    messagesSent: 0,
    messagesReceived: 0,
    lastHeartbeat: Date.now(),
    reconnectAttempts: 0
  });
  const [messageQueue, setMessageQueue] = useState<MessageQueue>({
    pending: [],
    failed: [],
    retrying: []
  });

  // Refs for persistent values
  const wsService = useRef<WebSocketService | null>(null);
  const uptimeInterval = useRef<NodeJS.Timeout>();
  const startTime = useRef<number>(Date.now());

  /**
   * Updates connection state and notifies callback
   */
  const updateConnectionState = useCallback((newState: ConnectionState) => {
    setConnectionState(newState);
    onConnectionStateChange?.(newState);
  }, [onConnectionStateChange]);

  /**
   * Handles incoming messages with delivery tracking
   */
  const handleMessage = useCallback((message: Message) => {
    setConnectionStats(prev => ({
      ...prev,
      messagesReceived: prev.messagesReceived + 1,
      lastHeartbeat: Date.now()
    }));
    onMessageCallback(message);
  }, [onMessageCallback]);

  /**
   * Initializes WebSocket service with configuration
   */
  const initializeWebSocket = useCallback(() => {
    if (!wsService.current) {
      wsService.current = new WebSocketService(config);
      wsService.current.onMessage(handleMessage);
    }
  }, [config, handleMessage]);

  /**
   * Connects to WebSocket server with automatic reconnection
   */
  const connect = useCallback(async () => {
    if (!wsService.current) {
      initializeWebSocket();
    }

    try {
      updateConnectionState(ConnectionState.CONNECTING);
      await wsService.current?.connect();
      updateConnectionState(ConnectionState.CONNECTED);
      
      // Process any queued messages
      messageQueue.pending.forEach(message => {
        sendMessage(message);
      });
      setMessageQueue(prev => ({ ...prev, pending: [] }));
    } catch (error) {
      updateConnectionState(ConnectionState.ERROR);
      console.error('WebSocket connection failed:', error);
    }
  }, [initializeWebSocket, messageQueue.pending, updateConnectionState]);

  /**
   * Sends a message with delivery guarantees and queue management
   */
  const sendMessage = useCallback(async (message: Message) => {
    if (!wsService.current || connectionState !== ConnectionState.CONNECTED) {
      setMessageQueue(prev => ({
        ...prev,
        pending: [...prev.pending, message]
      }));
      return;
    }

    try {
      await wsService.current.sendMessage(message);
      setConnectionStats(prev => ({
        ...prev,
        messagesSent: prev.messagesSent + 1
      }));
    } catch (error) {
      setMessageQueue(prev => ({
        ...prev,
        failed: [...prev.failed, { ...message, metadata: { ...message.metadata, status: MessageStatus.FAILED } }]
      }));
      console.error('Failed to send message:', error);
    }
  }, [connectionState]);

  /**
   * Disconnects WebSocket connection and cleans up resources
   */
  const disconnect = useCallback(() => {
    wsService.current?.disconnect();
    updateConnectionState(ConnectionState.DISCONNECTED);
    if (uptimeInterval.current) {
      clearInterval(uptimeInterval.current);
    }
  }, [updateConnectionState]);

  /**
   * Updates connection statistics periodically
   */
  useEffect(() => {
    uptimeInterval.current = setInterval(() => {
      setConnectionStats(prev => ({
        ...prev,
        uptime: Math.floor((Date.now() - startTime.current) / 1000)
      }));
    }, 1000);

    return () => {
      if (uptimeInterval.current) {
        clearInterval(uptimeInterval.current);
      }
    };
  }, []);

  /**
   * Cleans up resources on unmount
   */
  useEffect(() => {
    return () => {
      disconnect();
      wsService.current = null;
    };
  }, [disconnect]);

  return {
    connectionState,
    connectionStats,
    messageQueue,
    connect,
    disconnect,
    sendMessage
  };
};