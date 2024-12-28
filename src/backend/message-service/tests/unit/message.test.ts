/**
 * @fileoverview Unit tests for MessageService covering real-time messaging,
 * threading, caching, and AI agent integration.
 * @version 1.0.0
 */

// External imports - versions specified in comments
import { jest } from '@jest/globals'; // v29.x
import { Server as SocketServer, Socket } from 'socket.io'; // v4.7.2
import Redis from 'ioredis-mock'; // v8.x
import { Timestamp } from 'google-protobuf'; // v3.0.0

// Internal imports
import { MessageService } from '../../src/services/message.service';
import { IMessage, MessageType, MessageMetadata } from '../../src/interfaces/message.interface';
import { MessageRepository } from '../../src/repositories/message.repository';

describe('MessageService', () => {
  let messageService: MessageService;
  let messageRepository: jest.Mocked<MessageRepository>;
  let redisClient: Redis;
  let socketServer: jest.Mocked<SocketServer>;
  let mockSocket: jest.Mocked<Socket>;

  // Mock data
  const mockMessage: IMessage = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    chatId: '123e4567-e89b-12d3-a456-426614174001',
    senderId: '123e4567-e89b-12d3-a456-426614174002',
    content: 'Test message with @foodie mention',
    threadId: '',
    timestamp: Timestamp.fromDate(new Date()),
    metadata: {
      type: MessageType.TEXT,
      formatting: {},
      mentions: [],
      aiContext: {}
    }
  };

  beforeEach(() => {
    // Setup mocks
    messageRepository = {
      createMessage: jest.fn(),
      findMessagesByChatId: jest.fn(),
      findMessagesByThreadId: jest.fn(),
      archiveMessages: jest.fn()
    } as any;

    redisClient = new Redis();
    
    mockSocket = {
      join: jest.fn(),
      leave: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    } as any;

    socketServer = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    } as any;

    messageService = new MessageService(
      messageRepository,
      redisClient as any,
      socketServer
    );

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should create and deliver message with AI mention', async () => {
      // Setup
      const expectedAiMentions = ['foodie'];
      const enrichedMessage = {
        ...mockMessage,
        metadata: {
          ...mockMessage.metadata,
          type: MessageType.AI_RESPONSE,
          mentions: expectedAiMentions,
          aiContext: { requestedAgents: expectedAiMentions }
        }
      };

      messageRepository.createMessage.mockResolvedValue(enrichedMessage);

      // Execute
      const startTime = Date.now();
      const result = await messageService.sendMessage(mockMessage);
      const endTime = Date.now();

      // Verify
      expect(result).toEqual(enrichedMessage);
      expect(messageRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockMessage.content,
          metadata: expect.objectContaining({
            mentions: expectedAiMentions
          })
        })
      );
      expect(socketServer.to).toHaveBeenCalledWith(`chat:${mockMessage.chatId}`);
      expect(socketServer.emit).toHaveBeenCalledWith('new-message', enrichedMessage);
      
      // Verify performance SLA
      expect(endTime - startTime).toBeLessThan(2000); // 2s SLA
    });

    it('should handle message delivery failure and retry', async () => {
      // Setup
      const error = new Error('Delivery failed');
      messageRepository.createMessage
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockMessage);

      // Execute
      const result = await messageService.sendMessage(mockMessage);

      // Verify
      expect(messageRepository.createMessage).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockMessage);
    });

    it('should cache message after successful delivery', async () => {
      // Setup
      const redisSpy = jest.spyOn(redisClient, 'setex');
      messageRepository.createMessage.mockResolvedValue(mockMessage);

      // Execute
      await messageService.sendMessage(mockMessage);

      // Verify
      expect(redisSpy).toHaveBeenCalledWith(
        `message:${mockMessage.id}`,
        3600,
        JSON.stringify(mockMessage)
      );
    });
  });

  describe('getMessagesByChatId', () => {
    const paginationOptions = { limit: 50, offset: 0 };

    it('should return cached messages when available', async () => {
      // Setup
      const cachedMessages = [mockMessage];
      await redisClient.setex(
        `messages:chat:${mockMessage.chatId}:0:50`,
        3600,
        JSON.stringify(cachedMessages)
      );

      // Execute
      const startTime = Date.now();
      const result = await messageService.getMessagesByChatId(
        mockMessage.chatId,
        paginationOptions
      );
      const endTime = Date.now();

      // Verify
      expect(result).toEqual(cachedMessages);
      expect(messageRepository.findMessagesByChatId).not.toHaveBeenCalled();
      expect(endTime - startTime).toBeLessThan(100); // 100ms SLA for cache hits
    });

    it('should fetch and cache messages when cache misses', async () => {
      // Setup
      const dbMessages = [mockMessage];
      messageRepository.findMessagesByChatId.mockResolvedValue(dbMessages);

      // Execute
      const result = await messageService.getMessagesByChatId(
        mockMessage.chatId,
        paginationOptions
      );

      // Verify
      expect(result).toEqual(dbMessages);
      expect(messageRepository.findMessagesByChatId).toHaveBeenCalledWith(
        mockMessage.chatId,
        paginationOptions
      );

      // Verify caching
      const cachedResult = await redisClient.get(
        `messages:chat:${mockMessage.chatId}:0:50`
      );
      expect(JSON.parse(cachedResult!)).toEqual(dbMessages);
    });
  });

  describe('getMessagesByThreadId', () => {
    const threadId = '123e4567-e89b-12d3-a456-426614174003';
    const paginationOptions = { limit: 20, offset: 0 };

    it('should handle thread message pagination correctly', async () => {
      // Setup
      const threadMessages = Array(25).fill(mockMessage).map((msg, i) => ({
        ...msg,
        id: `${msg.id}-${i}`,
        threadId
      }));
      messageRepository.findMessagesByThreadId.mockResolvedValue(
        threadMessages.slice(0, 20)
      );

      // Execute
      const result = await messageService.getMessagesByThreadId(
        threadId,
        paginationOptions
      );

      // Verify
      expect(result).toHaveLength(20);
      expect(messageRepository.findMessagesByThreadId).toHaveBeenCalledWith(
        threadId,
        paginationOptions
      );
    });
  });

  describe('archiveMessages', () => {
    it('should archive messages and invalidate cache', async () => {
      // Setup
      const cutoffDate = new Date();
      const archiveOptions = {
        batchSize: 100,
        deleteAfterArchive: true
      };

      // Execute
      await messageService.archiveMessages(cutoffDate, archiveOptions);

      // Verify
      expect(messageRepository.archiveMessages).toHaveBeenCalledWith(
        cutoffDate,
        archiveOptions
      );

      // Verify cache invalidation
      const cacheKeys = await redisClient.keys('messages:*');
      expect(cacheKeys).toHaveLength(0);
    });
  });

  // WebSocket connection handling tests
  describe('WebSocket handling', () => {
    it('should handle socket room joining', () => {
      // Setup
      const connectionHandler = socketServer.on.mock.calls[0][1];
      
      // Execute
      connectionHandler(mockSocket);
      const joinHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'join-chat'
      )[1];
      joinHandler(mockMessage.chatId);

      // Verify
      expect(mockSocket.join).toHaveBeenCalledWith(
        `chat:${mockMessage.chatId}`
      );
    });

    it('should handle socket room leaving', () => {
      // Setup
      const connectionHandler = socketServer.on.mock.calls[0][1];
      
      // Execute
      connectionHandler(mockSocket);
      const leaveHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'leave-chat'
      )[1];
      leaveHandler(mockMessage.chatId);

      // Verify
      expect(mockSocket.leave).toHaveBeenCalledWith(
        `chat:${mockMessage.chatId}`
      );
    });
  });
});