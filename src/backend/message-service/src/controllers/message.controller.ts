/**
 * @fileoverview REST API controller for message operations with comprehensive validation,
 * rate limiting, and error handling. Implements real-time message delivery and threading.
 * @version 1.0.0
 */

// External imports - versions specified as per requirements
import { injectable } from 'inversify'; // v6.0.1
import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  UsePipes 
} from 'routing-controllers'; // v0.10.4
import { 
  IsString, 
  IsUUID, 
  IsOptional, 
  ValidateNested, 
  Length, 
  IsObject 
} from 'class-validator'; // v0.14.0
import { 
  ApiOperation, 
  ApiResponse, 
  ApiTags 
} from '@nestjs/swagger'; // v6.0.0
import { ValidationPipe } from '@nestjs/common'; // v9.0.0
import { RateLimitGuard } from '@nestjs/throttler'; // v4.0.0
import { Type } from 'class-transformer';
import { Logger } from '@nestjs/common';

// Internal imports
import { IMessage } from '../interfaces/message.interface';
import { MessageService } from '../services/message.service';

/**
 * DTO for creating a new message
 */
class CreateMessageDto {
  @IsUUID()
  chatId: string;

  @IsString()
  @Length(1, 10000)
  content: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => MessageMetadataDto)
  metadata: MessageMetadataDto;
}

/**
 * DTO for message metadata
 */
class MessageMetadataDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  formatting?: Record<string, string>;

  @IsOptional()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsObject()
  aiContext?: Record<string, string>;
}

/**
 * DTO for pagination options
 */
class PaginationOptionsDto {
  @IsOptional()
  @Type(() => Number)
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  offset: number = 0;
}

/**
 * Response type for message operations
 */
class MessageResponse implements IMessage {
  @ApiProperty()
  id: string;

  @ApiProperty()
  chatId: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ required: false })
  threadId?: string;

  @ApiProperty()
  metadata: MessageMetadataDto;

  @ApiProperty()
  timestamp: Date;
}

@injectable()
@Controller('/api/messages')
@ApiTags('messages')
@UseGuards(RateLimitGuard)
@UsePipes(new ValidationPipe({ transform: true }))
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly logger: Logger
  ) {
    this.logger.setContext('MessageController');
  }

  /**
   * Creates and sends a new message
   */
  @Post('/')
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: 'Send new message' })
  @ApiResponse({ status: 201, type: MessageResponse })
  async sendMessage(@Body() messageData: CreateMessageDto): Promise<IMessage> {
    try {
      this.logger.debug(`Sending message to chat ${messageData.chatId}`);

      const message = await this.messageService.sendMessage({
        ...messageData,
        id: undefined, // Will be generated by service
        senderId: undefined, // Will be set from auth context
        timestamp: new Date()
      });

      this.logger.debug(`Message ${message.id} sent successfully`);
      return message;
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Retrieves paginated messages for a chat
   */
  @Get('/chat/:chatId')
  @ApiOperation({ summary: 'Get chat messages' })
  @ApiResponse({ status: 200, type: [MessageResponse] })
  async getChatMessages(
    @Param('chatId') chatId: string,
    @Query() options: PaginationOptionsDto
  ): Promise<{ messages: IMessage[]; total: number }> {
    try {
      this.logger.debug(`Fetching messages for chat ${chatId}`);

      const messages = await this.messageService.getMessagesByChatId(
        chatId,
        {
          limit: Math.min(options.limit, 100), // Enforce maximum limit
          offset: Math.max(options.offset, 0)  // Ensure non-negative offset
        }
      );

      return {
        messages,
        total: messages.length
      };
    } catch (error) {
      this.logger.error(`Error fetching chat messages: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Retrieves paginated messages in a thread
   */
  @Get('/thread/:threadId')
  @ApiOperation({ summary: 'Get thread messages' })
  @ApiResponse({ status: 200, type: [MessageResponse] })
  async getThreadMessages(
    @Param('threadId') threadId: string,
    @Query() options: PaginationOptionsDto
  ): Promise<{ messages: IMessage[]; total: number }> {
    try {
      this.logger.debug(`Fetching messages for thread ${threadId}`);

      const messages = await this.messageService.getMessagesByThreadId(
        threadId,
        {
          limit: Math.min(options.limit, 100),
          offset: Math.max(options.offset, 0)
        }
      );

      return {
        messages,
        total: messages.length
      };
    } catch (error) {
      this.logger.error(`Error fetching thread messages: ${error.message}`, error.stack);
      throw error;
    }
  }
}