/**
 * @fileoverview Thread interface definitions for the message service.
 * Provides type safety and consistency for message threading functionality.
 * @version 1.0.0
 */

// External imports
import { Timestamp } from 'google-protobuf'; // v3.0.0

// Internal imports
import { MessageMetadata } from './message.interface';

/**
 * Enumeration of possible thread states.
 * Maps to ThreadStatus enum in message_service.proto
 */
export enum ThreadStatus {
  /** Thread is active and accepting new messages */
  ACTIVE = 'ACTIVE',
  
  /** Thread has been archived but is still viewable */
  ARCHIVED = 'ARCHIVED',
  
  /** Thread is locked and cannot accept new messages */
  LOCKED = 'LOCKED'
}

/**
 * Interface for thread metadata.
 * Contains information about thread status, participants, and activity.
 */
export interface ThreadMetadata {
  /** Current status of the thread */
  status: ThreadStatus;
  
  /** Array of user IDs participating in the thread */
  participantIds: string[];
  
  /** Timestamp of last activity in the thread */
  lastActivityAt: Timestamp;
  
  /** Total number of messages in the thread */
  messageCount: number;
}

/**
 * Main thread interface that matches the gRPC Thread definition.
 * Represents a message thread with all associated metadata.
 */
export interface IThread {
  /** Unique identifier for the thread */
  id: string;
  
  /** ID of the parent message that started this thread */
  parentMessageId: string;
  
  /** ID of the chat/room where the thread belongs */
  chatId: string;
  
  /** Timestamp when the thread was created */
  createdAt: Timestamp;
  
  /** Thread-specific metadata including status and activity info */
  metadata: ThreadMetadata;
}

/**
 * Interface for thread summary information.
 * Used for displaying thread previews and lists.
 */
export interface IThreadSummary {
  /** Unique identifier for the thread */
  threadId: string;
  
  /** Total number of messages in the thread */
  messageCount: number;
  
  /** Number of unique participants in the thread */
  participantCount: number;
  
  /** Timestamp of last activity in the thread */
  lastActivityAt: Timestamp;
}