// @ts-nocheck
// External imports
import { Timestamp } from 'google-protobuf'; // v3.0.0 - Standard timestamp type for message timing

/**
 * Enumeration of possible message types in the chat system
 */
export enum MessageType {
    TEXT = 'TEXT',
    AI_RESPONSE = 'AI_RESPONSE',
    POLL = 'POLL',
    SYSTEM = 'SYSTEM'
}

/**
 * Enumeration of message delivery statuses for UI feedback
 */
export enum MessageStatus {
    SENDING = 'SENDING',
    DELIVERED = 'DELIVERED',
    READ = 'READ',
    FAILED = 'FAILED'
}

/**
 * Interface for message text formatting options
 */
export interface MessageFormatting {
    bold: boolean;
    italic: boolean;
    color: string;
    emoji: string[];
}

/**
 * Interface for message metadata including formatting, status and AI context
 */
export interface MessageMetadata {
    type: MessageType;
    status: MessageStatus;
    formatting: MessageFormatting;
    mentions: string[];
    aiContext: Record<string, any>;
}

/**
 * Interface for thread metadata including status and activity info
 */
export interface ThreadMetadata {
    status: ThreadStatus; // Referenced from thread.interface.ts
    participantIds: string[];
    lastActivityAt: Timestamp;
    messageCount: number;
}

/**
 * Main message interface for the web client
 * Implements the core message structure with all required metadata
 */
export interface Message {
    /** Unique identifier for the message */
    id: string;
    
    /** ID of the chat room where the message belongs */
    chatId: string;
    
    /** ID of the user or AI agent who sent the message */
    senderId: string;
    
    /** Actual message content */
    content: string;
    
    /** Optional thread ID if message is part of a thread */
    threadId?: string;
    
    /** Timestamp when message was sent */
    timestamp: Timestamp;
    
    /** Message metadata including type, status, formatting and AI context */
    metadata: MessageMetadata;
    
    /** Thread metadata if message is part of a thread */
    threadMetadata?: ThreadMetadata;
}

/**
 * Type guard to check if a message is an AI response
 */
export const isAIResponse = (message: Message): boolean => {
    return message.metadata.type === MessageType.AI_RESPONSE;
};

/**
 * Type guard to check if a message is part of a thread
 */
export const isThreadMessage = (message: Message): boolean => {
    return !!message.threadId && !!message.threadMetadata;
};

/**
 * Type guard to check if a message contains mentions
 */
export const hasMentions = (message: Message): boolean => {
    return message.metadata.mentions.length > 0;
};

/**
 * Type guard to check if a message is in a failed state
 */
export const isFailedMessage = (message: Message): boolean => {
    return message.metadata.status === MessageStatus.FAILED;
};