/**
 * @fileoverview Thread model implementation with enhanced scalability and validation.
 * Provides MongoDB schema and methods for thread management in the chat platform.
 * @version 1.0.0
 */

// External imports - v7.x
import mongoose, { Schema, Document, Model } from 'mongoose';

// Internal imports
import { IThread, ThreadStatus, ThreadMetadata } from '../interfaces/thread.interface';

/**
 * Interface for pagination options
 */
interface PaginationOptions {
  limit: number;
  offset: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Interface extending IThread with Mongoose Document features
 */
interface IThreadDocument extends IThread, Document {
  schemaVersion: number;
  updatedAt: Date;
}

/**
 * Interface for Thread model static methods
 */
interface IThreadModel extends Model<IThreadDocument> {
  findByChatId(chatId: string, options: PaginationOptions): Promise<IThread[]>;
  findByParentMessageId(parentMessageId: string): Promise<IThread | null>;
  updateThreadStatus(threadId: string, status: ThreadStatus): Promise<IThread>;
}

/**
 * Schema definition for Thread model with validation and indexing
 */
const threadSchema = new Schema<IThreadDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  parentMessageId: {
    type: String,
    required: true,
    index: true,
  },
  chatId: {
    type: String,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  schemaVersion: {
    type: Number,
    required: true,
    default: 1,
  },
  metadata: {
    type: {
      status: {
        type: String,
        enum: Object.values(ThreadStatus),
        required: true,
        default: ThreadStatus.ACTIVE,
        validate: {
          validator: function(status: ThreadStatus) {
            if (this.isNew) return true;
            return validateStatusTransition(this.metadata.status, status);
          },
          message: 'Invalid status transition'
        }
      },
      participantIds: {
        type: [String],
        required: true,
        default: [],
        validate: {
          validator: function(participants: string[]) {
            return participants.length > 0 && new Set(participants).size === participants.length;
          },
          message: 'Participants array must be non-empty and contain unique IDs'
        }
      },
      lastActivityAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
      messageCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      }
    },
    required: true,
  }
}, {
  timestamps: true,
  versionKey: 'schemaVersion'
});

/**
 * Compound indexes for efficient querying
 */
threadSchema.index(
  { chatId: 1, 'metadata.lastActivityAt': -1 },
  { background: true, name: 'thread_chat_activity' }
);

threadSchema.index(
  { parentMessageId: 1 },
  { unique: true, background: true, name: 'thread_parent_message' }
);

/**
 * Configure sharding key
 */
threadSchema.set('shardKey', { chatId: 1 });

/**
 * Validates thread status transitions
 */
function validateStatusTransition(currentStatus: ThreadStatus, newStatus: ThreadStatus): boolean {
  const validTransitions = {
    [ThreadStatus.ACTIVE]: [ThreadStatus.ARCHIVED, ThreadStatus.LOCKED],
    [ThreadStatus.ARCHIVED]: [ThreadStatus.ACTIVE],
    [ThreadStatus.LOCKED]: []
  };
  
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * Static method implementations
 */
threadSchema.statics.findByChatId = async function(
  chatId: string,
  options: PaginationOptions
): Promise<IThread[]> {
  const { limit = 20, offset = 0, sortBy = 'metadata.lastActivityAt', sortOrder = 'desc' } = options;
  
  return this.find({ chatId })
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .skip(offset)
    .limit(limit)
    .lean()
    .exec();
};

threadSchema.statics.findByParentMessageId = async function(
  parentMessageId: string
): Promise<IThread | null> {
  return this.findOne({ parentMessageId })
    .lean()
    .exec();
};

threadSchema.statics.updateThreadStatus = async function(
  threadId: string,
  status: ThreadStatus
): Promise<IThread> {
  const thread = await this.findOne({ id: threadId });
  if (!thread) {
    throw new Error('Thread not found');
  }

  if (!validateStatusTransition(thread.metadata.status, status)) {
    throw new Error('Invalid status transition');
  }

  return this.findOneAndUpdate(
    { id: threadId },
    {
      $set: {
        'metadata.status': status,
        'metadata.lastActivityAt': new Date(),
      }
    },
    { new: true, runValidators: true }
  ).exec();
};

/**
 * Pre-save middleware for updating timestamps
 */
threadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.isModified('metadata')) {
    this.metadata.lastActivityAt = new Date();
  }
  next();
});

/**
 * Export the Thread model
 */
export const ThreadModel = mongoose.model<IThreadDocument, IThreadModel>('Thread', threadSchema);