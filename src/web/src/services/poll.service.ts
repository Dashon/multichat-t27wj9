/**
 * @fileoverview Poll service for managing poll operations in the group chat platform.
 * Implements comprehensive poll lifecycle management with enhanced validation,
 * real-time updates, and analytics tracking.
 * @version 1.0.0
 */

import { ApiService } from './api.service';
import { 
  IPoll, 
  PollOption, 
  PollSettings, 
  PollStatus, 
  PollType,
  PollVisibility,
  isPoll 
} from '../types/poll';

/**
 * Error messages for poll operations
 */
const POLL_ERROR_MESSAGES = {
  INVALID_CHAT_ID: 'Invalid chat ID provided',
  INVALID_QUESTION: 'Question must be between 1 and 500 characters',
  INVALID_OPTIONS: 'Poll must have between 2 and 10 options',
  INVALID_SETTINGS: 'Invalid poll settings provided',
  INVALID_POLL_ID: 'Invalid poll ID provided',
  POLL_CLOSED: 'Poll is already closed',
  ALREADY_VOTED: 'User has already voted in this poll',
  VOTE_LIMIT_EXCEEDED: 'Vote limit exceeded for this poll',
  DEADLINE_PASSED: 'Poll deadline has passed',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions to perform this action'
} as const;

/**
 * Service class for managing poll operations with enhanced validation and analytics
 */
export class PollService {
  private readonly MAX_QUESTION_LENGTH = 500;
  private readonly MIN_OPTIONS = 2;
  private readonly MAX_OPTIONS = 10;
  private readonly ANALYTICS_UPDATE_INTERVAL = 60000; // 1 minute

  constructor(private readonly apiService: ApiService) {}

  /**
   * Creates a new poll with enhanced validation and analytics tracking
   * @param chatId - ID of the chat where poll is created
   * @param question - Poll question
   * @param options - Array of poll options
   * @param settings - Poll configuration settings
   * @returns Created poll with initialized analytics
   */
  public async createPoll(
    chatId: string,
    question: string,
    options: Omit<PollOption, 'id' | 'votes' | 'voters' | 'voteTimestamps'>[],
    settings: Partial<PollSettings>
  ): Promise<IPoll> {
    // Validate inputs
    this.validatePollCreation(chatId, question, options);

    // Initialize poll settings with defaults
    const pollSettings: PollSettings = {
      type: settings.type || PollType.SINGLE_CHOICE,
      visibility: settings.visibility || PollVisibility.ALL_MEMBERS,
      deadline: settings.deadline || null,
      allowAddOptions: settings.allowAddOptions ?? false,
      minVotes: settings.minVotes || 1,
      maxVotes: settings.maxVotes || 1,
      validation: {
        requireComment: settings.validation?.requireComment ?? false,
        minimumParticipants: settings.validation?.minimumParticipants || 1,
        votingTimeWindow: settings.validation?.votingTimeWindow,
        restrictedToRoles: settings.validation?.restrictedToRoles
      }
    };

    // Initialize analytics data
    const initialAnalytics = {
      totalParticipation: 0,
      participationRate: 0,
      averageTimeToVote: 0,
      completionRate: 0,
      deviceDistribution: new Map(),
      geographicDistribution: new Map()
    };

    try {
      const response = await this.apiService.post<IPoll>('/polls', {
        chatId,
        question,
        options: options.map(option => ({
          ...option,
          votes: 0,
          voters: [],
          voteTimestamps: new Map(),
          metadata: {
            category: option.metadata?.category || 'general',
            tags: option.metadata?.tags || [],
            analytics: {
              voteDistribution: {
                hourly: new Map(),
                daily: new Map()
              },
              engagementRate: 0,
              averageResponseTime: 0
            }
          }
        })),
        settings: pollSettings,
        status: PollStatus.ACTIVE,
        analytics: initialAnalytics
      });

      if (!isPoll(response)) {
        throw new Error('Invalid poll data received from server');
      }

      // Start analytics tracking
      this.startAnalyticsTracking(response.id);

      return response;
    } catch (error) {
      throw this.handlePollError(error);
    }
  }

  /**
   * Submit votes for a poll with validation and real-time updates
   * @param pollId - ID of the poll
   * @param optionIds - Array of selected option IDs
   * @returns Updated poll data with vote counts
   */
  public async vote(pollId: string, optionIds: string[]): Promise<IPoll> {
    try {
      // Validate poll status and voting eligibility
      const poll = await this.apiService.get<IPoll>(`/polls/${pollId}`);
      this.validateVoting(poll, optionIds);

      const response = await this.apiService.put<IPoll>(`/polls/${pollId}/vote`, {
        optionIds,
        timestamp: new Date(),
        deviceInfo: this.getDeviceInfo(),
        location: await this.getUserLocation()
      });

      if (!isPoll(response)) {
        throw new Error('Invalid poll data received from server');
      }

      // Update analytics
      this.updatePollAnalytics(response);

      return response;
    } catch (error) {
      throw this.handlePollError(error);
    }
  }

  /**
   * Close poll with result calculation and analytics
   * @param pollId - ID of the poll to close
   * @returns Final poll results with analytics
   */
  public async closePoll(pollId: string): Promise<IPoll> {
    try {
      const response = await this.apiService.put<IPoll>(`/polls/${pollId}/close`, {
        closedAt: new Date(),
        finalAnalytics: await this.generateFinalAnalytics(pollId)
      });

      if (!isPoll(response)) {
        throw new Error('Invalid poll data received from server');
      }

      // Stop analytics tracking
      this.stopAnalyticsTracking(pollId);

      return response;
    } catch (error) {
      throw this.handlePollError(error);
    }
  }

  /**
   * Validates poll creation parameters
   */
  private validatePollCreation(
    chatId: string,
    question: string,
    options: any[]
  ): void {
    if (!chatId || typeof chatId !== 'string') {
      throw new Error(POLL_ERROR_MESSAGES.INVALID_CHAT_ID);
    }

    if (!question || question.length > this.MAX_QUESTION_LENGTH) {
      throw new Error(POLL_ERROR_MESSAGES.INVALID_QUESTION);
    }

    if (!Array.isArray(options) || 
        options.length < this.MIN_OPTIONS || 
        options.length > this.MAX_OPTIONS) {
      throw new Error(POLL_ERROR_MESSAGES.INVALID_OPTIONS);
    }
  }

  /**
   * Validates voting eligibility and constraints
   */
  private validateVoting(poll: IPoll, optionIds: string[]): void {
    if (poll.status !== PollStatus.ACTIVE) {
      throw new Error(POLL_ERROR_MESSAGES.POLL_CLOSED);
    }

    if (poll.settings.deadline && new Date() > poll.settings.deadline) {
      throw new Error(POLL_ERROR_MESSAGES.DEADLINE_PASSED);
    }

    if (optionIds.length < poll.settings.minVotes || 
        optionIds.length > poll.settings.maxVotes) {
      throw new Error(POLL_ERROR_MESSAGES.VOTE_LIMIT_EXCEEDED);
    }
  }

  /**
   * Starts real-time analytics tracking for a poll
   */
  private startAnalyticsTracking(pollId: string): void {
    const intervalId = setInterval(
      () => this.updatePollAnalytics(pollId),
      this.ANALYTICS_UPDATE_INTERVAL
    );
    // Store interval ID for cleanup
    this.analyticsIntervals.set(pollId, intervalId);
  }

  /**
   * Stops analytics tracking for a poll
   */
  private stopAnalyticsTracking(pollId: string): void {
    const intervalId = this.analyticsIntervals.get(pollId);
    if (intervalId) {
      clearInterval(intervalId);
      this.analyticsIntervals.delete(pollId);
    }
  }

  /**
   * Updates poll analytics with real-time data
   */
  private async updatePollAnalytics(pollId: string): Promise<void> {
    try {
      await this.apiService.put(`/polls/${pollId}/analytics`, {
        timestamp: new Date(),
        metrics: await this.calculateCurrentMetrics(pollId)
      });
    } catch (error) {
      console.error('Failed to update poll analytics:', error);
    }
  }

  /**
   * Generates final analytics report for poll closure
   */
  private async generateFinalAnalytics(pollId: string): Promise<any> {
    const poll = await this.apiService.get<IPoll>(`/polls/${pollId}`);
    return {
      finalParticipationRate: this.calculateParticipationRate(poll),
      voteDistribution: this.calculateVoteDistribution(poll),
      timeAnalysis: this.calculateTimeAnalysis(poll),
      demographicData: await this.getDemographicData(poll)
    };
  }

  /**
   * Handles and formats poll-related errors
   */
  private handlePollError(error: any): Error {
    const message = error.response?.data?.message || error.message;
    return new Error(`Poll operation failed: ${message}`);
  }

  // Store intervals for analytics tracking
  private analyticsIntervals: Map<string, NodeJS.Timeout> = new Map();
}

// Export singleton instance
export const pollService = new PollService(new ApiService());