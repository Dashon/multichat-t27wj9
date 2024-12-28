/**
 * @fileoverview Mongoose model definition for messages in the chat platform.
 * Implements comprehensive schema validation, indexing, and query methods
 * for efficient real-time message handling and AI integration.
 * @version 1.0.0
 */

import mongoose, { Schema, model, Document, QueryOptions } from 'mongoose'; // v7.x
import { IMessage, MessageType } from '../interfaces/message.interface';

/**
 * Interface for message filtering options
 */
interface MessageFilter {
  type?: MessageType;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  includeDeleted?: boolean;
}

/**
 * Interface for pagination options
 */
interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Extended Message document interface for Mongoose
 */
interface MessageDocument extends IMessage, Document {
  schemaVersion: number;
  deleted: boolean;
  deletedAt?: Date;
}

// Schema definition with strict validation and indexing
const messageSchema = new Schema<MessageDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    immutable: true
  },
  chatId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: (v: string) => /^[a-f\d]{24}$/i.test(v),
      message: 'Invalid chatId format'
    }
  },
  senderId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: (v: string) => /^[a-f\d]{24}$/i.test(v),
      message: 'Invalid senderId format'
    }
  },
  content: {
    type: String,
    required: true,
    maxlength: [10000, 'Content exceeds maximum length of 10000 characters']
  },
  threadId: {
    type: String,
    required: false,
    index: true,
    validate: {
      validator: (v: string) => !v || /^[a-f\d]{24}$/i.test(v),
      message: 'Invalid threadId format'
    }
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  schemaVersion: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  deleted: {
    type: Boolean,
    required: true,
    default: false
  },
  deletedAt: {
    type: Date,
    required: false
  },
  metadata: {
    type: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
      default: MessageType.TEXT
    },
    formatting: {
      type: Map,
      of: String,
      required: false
    },
    mentions: {
      type: [String],
      required: false,
      default: [],
      validate: {
        validator: (v: string[]) => v.every(id => /^[a-f\d]{24}$/i.test(id)),
        message: 'Invalid mention ID format'
      }
    },
    aiContext: {
      type: Map,
      of: String,
      required: false
    },
    temporary: {
      type: Boolean,
      required: false,
      default: false
    },
    expiresAt: {
      type: Date,
      required: false,
      validate: {
        validator: (v: Date) => !v || v > new Date(),
        message: 'Expiration date must be in the future'
      }
    }
  }
}, {
  timestamps: true,
  strict: true,
  collection: 'messages'
});

// Compound indexes for efficient querying
messageSchema.index({ chatId: 1, timestamp: -1 }, { background: true });
messageSchema.index({ threadId: 1, timestamp: 1 }, { background: true });
messageSchema.index({ 'metadata.expiresAt': 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ 'metadata.mentions': 1 }, { background: true });

// Configure sharding key
messageSchema.set('shardKey', { chatId: 1 });

// Pre-save middleware for validation and processing
messageSchema.pre('save', function(next) {
  if (this.isNew) {
    this.schemaVersion = 1;
  }
  if (this.metadata?.temporary && !this.metadata.expiresAt) {
    this.metadata.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default
  }
  next();
});

/**
 * Static methods for message querying and manipulation
 */
messageSchema.statics = {
  /**
   * Find messages in a chat with pagination and filtering
   */
  async findByChatId(
    chatId: string,
    options: PaginationOptions,
    filter?: MessageFilter
  ): Promise<IMessage[]> {
    const query: any = { chatId, deleted: filter?.includeDeleted || false };
    
    if (filter?.type) {
      query['metadata.type'] = filter.type;
    }
    if (filter?.fromTimestamp) {
      query.timestamp = { $gte: filter.fromTimestamp };
    }
    if (filter?.toTimestamp) {
      query.timestamp = { ...query.timestamp, $lte: filter.toTimestamp };
    }

    return this.find(query)
      .sort({ timestamp: -1 })
      .skip(options.offset)
      .limit(options.limit)
      .lean();
  },

  /**
   * Find messages in a thread with pagination
   */
  async findByThreadId(
    threadId: string,
    options: PaginationOptions
  ): Promise<IMessage[]> {
    return this.find({
      threadId,
      deleted: false
    })
      .sort({ timestamp: 1 })
      .skip(options.offset)
      .limit(options.limit)
      .lean();
  },

  /**
   * Soft delete a message
   */
  async softDelete(messageId: string): Promise<void> {
    await this.updateOne(
      { id: messageId },
      {
        $set: {
          deleted: true,
          deletedAt: new Date()
        }
      }
    );
  }
};

// Create and export the model
export const MessageModel = model<MessageDocument>('Message', messageSchema);