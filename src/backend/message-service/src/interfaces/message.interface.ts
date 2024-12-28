/**
 * @fileoverview Message interface definitions for the real-time messaging service.
 * Provides type safety and consistency with gRPC service definitions.
 * @version 1.0.0
 */

// External imports
import { Timestamp } from 'google-protobuf'; // v3.0.0

/**
 * Enumeration of possible message types in the system.
 * Maps to MessageType enum in message_service.proto
 */
export enum MessageType {
  TEXT = 'TEXT',                   // Standard text message
  AI_RESPONSE = 'AI_RESPONSE',     // AI agent generated response
  POLL = 'POLL',                   // Poll/voting message
  SYSTEM = 'SYSTEM'                // System-generated message
}

/**
 * Interface for thread-specific metadata.
 * Contains information about message thread participants and activity.
 */
export interface ThreadMetadata {
  /** Array of user IDs participating in the thread */
  participantIds: string[];
  
  /** Timestamp of last activity in the thread */
  lastActivityAt: Timestamp;
  
  /** Total number of messages in the thread */
  messageCount: number;
}

/**
 * Interface for message-specific metadata.
 * Includes formatting, mentions, and AI context information.
 */
export interface MessageMetadata {
  /** Type of message (text, AI response, poll, system) */
  type: MessageType;
  
  /** Key-value pairs for message formatting (bold, italic, etc.) */
  formatting: Record<string, string>;
  
  /** Array of user/agent IDs mentioned in the message */
  mentions: string[];
  
  /** Key-value pairs for AI-specific context data */
  aiContext: Record<string, string>;
}

/**
 * Main message interface that matches the gRPC Message definition.
 * Represents a single message in the system with all associated metadata.
 */
export interface IMessage {
  /** Unique identifier for the message */
  id: string;
  
  /** ID of the chat/room where the message belongs */
  chatId: string;
  
  /** ID of the user or AI agent that sent the message */
  senderId: string;
  
  /** Actual content/text of the message */
  content: string;
  
  /** ID of the thread this message belongs to (if threaded) */
  threadId: string;
  
  /** Timestamp when the message was sent */
  timestamp: Timestamp;
  
  /** Message-specific metadata including type and formatting */
  metadata: MessageMetadata;
  
  /** Thread-specific metadata (if message is part of a thread) */
  threadMetadata?: ThreadMetadata;
}