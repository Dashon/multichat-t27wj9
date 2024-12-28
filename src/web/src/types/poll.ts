import { User } from './user';

/**
 * Defines available poll types for voting behavior
 */
export enum PollType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE'
}

/**
 * Defines possible states of a poll
 */
export enum PollStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  EXPIRED = 'EXPIRED'
}

/**
 * Defines poll visibility options
 */
export enum PollVisibility {
  ALL_MEMBERS = 'ALL_MEMBERS',
  SELECTED_MEMBERS = 'SELECTED_MEMBERS'
}

/**
 * Interface for analytics tracking of individual poll options
 */
interface OptionAnalytics {
  voteDistribution: {
    hourly: Map<number, number>;
    daily: Map<string, number>;
  };
  engagementRate: number;
  averageResponseTime: number;
}

/**
 * Interface for poll-wide analytics
 */
interface PollAnalytics {
  totalParticipation: number;
  participationRate: number;
  averageTimeToVote: number;
  completionRate: number;
  deviceDistribution: Map<string, number>;
  geographicDistribution?: Map<string, number>;
}

/**
 * Interface for accessibility settings
 */
interface PollAccessibility {
  screenReaderDescription: string;
  keyboardShortcuts: boolean;
  highContrastMode: boolean;
  textScaling: number;
}

/**
 * Interface for poll validation rules
 */
interface PollValidation {
  requireComment: boolean;
  minimumParticipants: number;
  votingTimeWindow?: {
    start: Date;
    end: Date;
  };
  restrictedToRoles?: string[];
}

/**
 * Interface for metadata associated with poll options
 */
export interface PollOptionMetadata {
  category: string;
  tags: string[];
  analytics: OptionAnalytics;
}

/**
 * Interface for individual poll options with enhanced tracking
 */
export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters: string[];
  voteTimestamps: Map<string, Date>;
  metadata: PollOptionMetadata;
}

/**
 * Interface for poll configuration settings with validation rules
 */
export interface PollSettings {
  type: PollType;
  visibility: PollVisibility;
  deadline: Date | null;
  allowAddOptions: boolean;
  minVotes: number;
  maxVotes: number;
  validation: PollValidation;
}

/**
 * Main interface for poll data structure with enhanced features
 * Implements comprehensive polling system based on technical specifications
 */
export interface IPoll {
  readonly id: string;
  readonly chatId: string;
  readonly creator: User;
  question: string;
  options: PollOption[];
  settings: PollSettings;
  status: PollStatus;
  participantIds: string[];
  readonly createdAt: Date;
  updatedAt: Date;
  analytics: PollAnalytics;
  accessibility: PollAccessibility;
}

/**
 * Type guard to check if a value is a valid PollType
 */
export const isPollType = (value: any): value is PollType => {
  return Object.values(PollType).includes(value as PollType);
};

/**
 * Type guard to check if a value is a valid PollStatus
 */
export const isPollStatus = (value: any): value is PollStatus => {
  return Object.values(PollStatus).includes(value as PollStatus);
};

/**
 * Type guard to check if a value is a valid PollVisibility
 */
export const isPollVisibility = (value: any): value is PollVisibility => {
  return Object.values(PollVisibility).includes(value as PollVisibility);
};

/**
 * Type guard to check if an object is a valid Poll
 */
export const isPoll = (value: any): value is IPoll => {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.chatId === 'string' &&
    typeof value.question === 'string' &&
    Array.isArray(value.options) &&
    isPollType(value.settings?.type) &&
    isPollStatus(value.status) &&
    value.creator && typeof value.creator === 'object' &&
    value.createdAt instanceof Date &&
    value.updatedAt instanceof Date
  );
};