// @ts-nocheck
import { IMessage } from './message';
import { User } from './user';

/**
 * Enumeration of chat types supported by the platform
 */
export enum ChatType {
  GROUP = 'GROUP',
  DIRECT = 'DIRECT'
}

/**
 * Enumeration of possible chat status states
 */
export enum ChatStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED'
}

/**
 * Interface defining available features and capabilities for a chat
 * Based on core features from technical specifications
 */
export interface ChatFeatures {
  /** Enable AI agent integration */
  aiAgents: boolean;
  /** Enable polling functionality */
  polls: boolean;
  /** Enable recommendation sharing */
  recommendations: boolean;
  /** Enable message threading */
  threading: boolean;
  /** Enable AI context awareness */
  aiContextAwareness: boolean;
  /** Enable decision tracking */
  decisionTracking: boolean;
  /** Enable real-time typing indicators */
  realTimeTyping: boolean;
}

/**
 * Interface defining participant roles in a chat
 */
export enum ChatRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER'
}

/**
 * Interface defining granular permissions for chat participants
 */
export interface ChatPermissions {
  /** Permission to manage chat participants */
  canManageParticipants: boolean;
  /** Permission to manage chat features */
  canManageFeatures: boolean;
  /** Permission to create and manage polls */
  canCreatePolls: boolean;
  /** Permission to manage AI agent integration */
  canManageAIAgents: boolean;
}

/**
 * Interface for chat participant details
 */
export interface ChatParticipant {
  /** Unique identifier of the participant */
  userId: string;
  /** Role of the participant in the chat */
  role: ChatRole;
  /** Timestamp when participant joined */
  joinedAt: Date;
  /** Timestamp of last read message */
  lastRead: Date;
  /** Participant's permissions in the chat */
  permissions: ChatPermissions;
}

/**
 * Interface for chat metadata including AI context and activity tracking
 */
export interface ChatMetadata {
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Active AI agents in the chat */
  activeAgents: string[];
  /** Context awareness data for AI */
  aiContext: Record<string, any>;
  /** Decision tracking metadata */
  decisions: {
    pending: number;
    resolved: number;
    lastUpdated: Date;
  };
  /** Custom properties for extensibility */
  customProperties?: Record<string, any>;
}

/**
 * Main chat interface defining complete chat structure
 */
export interface IChat {
  /** Unique identifier for the chat */
  id: string;
  /** Display name of the chat */
  name: string;
  /** Optional description */
  description: string;
  /** Current status of the chat */
  status: ChatStatus;
  /** List of chat participants */
  participants: ChatParticipant[];
  /** Messages in the chat */
  messages: IMessage[];
  /** Chat metadata */
  metadata: ChatMetadata;
  /** Enabled features */
  features: ChatFeatures;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Interface for chat creation data
 */
export interface ChatCreateData {
  /** Display name for the new chat */
  name: string;
  /** Optional description */
  description: string;
  /** Type of chat to create */
  type: ChatType;
  /** Initial participant IDs */
  participants: string[];
  /** Optional features to enable */
  features?: Partial<ChatFeatures>;
  /** Optional initial message */
  initialMessage?: string;
}

/**
 * Type guard to check if a chat is a group chat
 */
export const isGroupChat = (chat: IChat): boolean => {
  return chat.participants.length > 2;
};

/**
 * Type guard to check if a user is a chat admin
 */
export const isChatAdmin = (chat: IChat, userId: string): boolean => {
  const participant = chat.participants.find(p => p.userId === userId);
  return participant?.role === ChatRole.ADMIN || participant?.role === ChatRole.OWNER;
};

/**
 * Type guard to check if a chat has AI features enabled
 */
export const hasAIFeatures = (chat: IChat): boolean => {
  return chat.features.aiAgents || chat.features.aiContextAwareness;
};

/**
 * Type guard to check if a chat is active
 */
export const isActiveChat = (chat: IChat): boolean => {
  return chat.status === ChatStatus.ACTIVE;
};