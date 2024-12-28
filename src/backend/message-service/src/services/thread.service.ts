/**
 * @fileoverview Thread service implementation for managing message threads
 * with real-time updates, caching, and AI integration support.
 * @version 1.0.0
 */

// External imports
import { injectable } from 'inversify'; // v6.0.1
import { Logger } from 'winston'; // v3.11.0
import { createLogger, format, transports } from 'winston';

// Internal imports
import { IThread, ThreadStatus, ThreadMetadata } from '../interfaces/thread.interface';
import { ThreadRepository } from '../repositories/thread.repository';
import { MessageEvents } from '../events/message.events';
import { IMessage } from '../interfaces/message.interface';

/**
 * Service class implementing business logic for thread management
 * with comprehensive error handling and real-time updates
 */
@injectable()
export class ThreadService {
    private readonly logger: Logger;

    constructor(
        private readonly threadRepository: ThreadRepository,
        private readonly messageEvents: MessageEvents
    ) {
        // Initialize logger with proper formatting and transports
        this.logger = createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: format.combine(
                format.timestamp(),
                format.json()
            ),
            transports: [
                new transports.Console(),
                new transports.File({ filename: 'thread-service-error.log', level: 'error' }),
                new transports.File({ filename: 'thread-service-combined.log' })
            ]
        });

        this.initializeErrorHandlers();
    }

    /**
     * Creates a new message thread with validation and real-time updates
     * @param threadData Initial thread data
     * @returns Newly created thread
     */
    async createThread(threadData: Partial<IThread>): Promise<IThread> {
        try {
            this.logger.debug('Creating new thread', { threadData });

            // Validate thread data
            this.validateThreadData(threadData);

            // Initialize thread metadata
            const metadata: ThreadMetadata = {
                status: ThreadStatus.ACTIVE,
                participantIds: threadData.metadata?.participantIds || [],
                lastActivityAt: new Date(),
                messageCount: 0
            };

            // Create thread with initialized metadata
            const thread = await this.threadRepository.createThread({
                ...threadData,
                metadata
            });

            this.logger.info('Thread created successfully', { threadId: thread.id });

            // Emit thread creation event for real-time updates
            await this.emitThreadUpdate('thread-created', thread);

            return thread;
        } catch (error) {
            this.logger.error('Error creating thread', { error, threadData });
            throw this.handleServiceError(error);
        }
    }

    /**
     * Retrieves a thread by its ID with caching support
     * @param threadId Thread identifier
     * @returns Thread if found, null otherwise
     */
    async getThreadById(threadId: string): Promise<IThread | null> {
        try {
            this.logger.debug('Fetching thread', { threadId });

            if (!threadId?.trim()) {
                throw new Error('Invalid thread ID');
            }

            const thread = await this.threadRepository.findThreadById(threadId);
            
            if (!thread) {
                this.logger.debug('Thread not found', { threadId });
                return null;
            }

            return thread;
        } catch (error) {
            this.logger.error('Error fetching thread', { error, threadId });
            throw this.handleServiceError(error);
        }
    }

    /**
     * Updates the status of a thread with validation and real-time updates
     * @param threadId Thread identifier
     * @param status New thread status
     * @returns Updated thread
     */
    async updateThreadStatus(threadId: string, status: ThreadStatus): Promise<IThread> {
        try {
            this.logger.debug('Updating thread status', { threadId, status });

            // Validate inputs
            if (!threadId?.trim()) {
                throw new Error('Invalid thread ID');
            }
            if (!Object.values(ThreadStatus).includes(status)) {
                throw new Error('Invalid thread status');
            }

            // Update thread status
            const updatedThread = await this.threadRepository.updateThread(threadId, {
                'metadata.status': status,
                'metadata.lastActivityAt': new Date()
            });

            if (!updatedThread) {
                throw new Error('Thread not found');
            }

            this.logger.info('Thread status updated successfully', { 
                threadId, 
                status 
            });

            // Emit thread update event
            await this.emitThreadUpdate('thread-updated', updatedThread);

            return updatedThread;
        } catch (error) {
            this.logger.error('Error updating thread status', { error, threadId, status });
            throw this.handleServiceError(error);
        }
    }

    /**
     * Adds a new message to an existing thread with metadata updates
     * @param threadId Thread identifier
     * @param messageData Message to be added
     */
    async addMessageToThread(threadId: string, messageData: IMessage): Promise<void> {
        try {
            this.logger.debug('Adding message to thread', { threadId, messageId: messageData.id });

            // Validate inputs
            if (!threadId?.trim()) {
                throw new Error('Invalid thread ID');
            }
            if (!messageData?.id) {
                throw new Error('Invalid message data');
            }

            // Update thread metadata
            const thread = await this.threadRepository.updateThread(threadId, {
                $inc: { 'metadata.messageCount': 1 },
                $set: { 'metadata.lastActivityAt': new Date() },
                $addToSet: { 'metadata.participantIds': messageData.senderId }
            });

            if (!thread) {
                throw new Error('Thread not found');
            }

            // Emit message added event
            await this.messageEvents.handleNewMessage(messageData);

            this.logger.info('Message added to thread successfully', {
                threadId,
                messageId: messageData.id
            });
        } catch (error) {
            this.logger.error('Error adding message to thread', {
                error,
                threadId,
                messageId: messageData.id
            });
            throw this.handleServiceError(error);
        }
    }

    /**
     * Validates thread data before creation
     * @param threadData Thread data to validate
     */
    private validateThreadData(threadData: Partial<IThread>): void {
        if (!threadData.parentMessageId?.trim()) {
            throw new Error('Parent message ID is required');
        }
        if (!threadData.chatId?.trim()) {
            throw new Error('Chat ID is required');
        }
        if (threadData.metadata?.participantIds?.length === 0) {
            throw new Error('Thread must have at least one participant');
        }
    }

    /**
     * Emits thread-related events for real-time updates
     * @param eventType Type of thread event
     * @param thread Thread data to emit
     */
    private async emitThreadUpdate(eventType: string, thread: IThread): Promise<void> {
        try {
            await this.messageEvents.handleNewMessage({
                id: `${eventType}-${thread.id}`,
                chatId: thread.chatId,
                senderId: 'system',
                content: JSON.stringify(thread),
                threadId: thread.id,
                timestamp: new Date(),
                metadata: {
                    type: 'SYSTEM',
                    formatting: {},
                    mentions: [],
                    aiContext: {}
                }
            });
        } catch (error) {
            this.logger.error('Error emitting thread update', { error, eventType, threadId: thread.id });
            // Don't throw here to prevent main operation failure
        }
    }

    /**
     * Initializes error handlers for the service
     */
    private initializeErrorHandlers(): void {
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Rejection at:', {
                promise,
                reason
            });
        });

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception:', { error });
            process.exit(1);
        });
    }

    /**
     * Handles and transforms service errors
     * @param error Error to handle
     * @returns Transformed error
     */
    private handleServiceError(error: any): Error {
        if (error.name === 'ValidationError') {
            return new Error(`Validation error: ${error.message}`);
        }
        if (error.name === 'MongoError' && error.code === 11000) {
            return new Error('Duplicate thread ID');
        }
        return error;
    }
}