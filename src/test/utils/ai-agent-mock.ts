/**
 * @fileoverview Enhanced mock implementations of AI agents for testing purposes
 * Provides comprehensive test utilities for simulating AI agent behaviors
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.0.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0
import { TestContext } from './test-helpers';
import { ai_responses } from '../fixtures/ai-responses.json';
import { MessageType, IMessage } from '../../backend/message-service/src/interfaces/message.interface';
import { Timestamp } from 'google-protobuf';

// Constants for agent validation and timing
const RESPONSE_TIMEOUT = 2000; // 2 seconds SLA requirement
const MIN_CONFIDENCE_SCORE = 0.85;
const MAX_CONTEXT_SIZE = 1000;
const SUPPORTED_AGENT_TYPES = ['explorer', 'foodie', 'planner', 'budget', 'local'];

/**
 * Interface for agent performance metrics tracking
 */
interface AgentPerformanceMetrics {
  responseTime: number[];
  confidenceScores: number[];
  successRate: number;
  requestCount: number;
  contextSize: number;
}

/**
 * Interface for agent context data
 */
interface AgentContext {
  tokens: string[];
  relevantHistory: string[];
  userPreferences: Record<string, any>;
  expiresAt: number;
}

/**
 * Enhanced mock implementation of an AI agent for testing
 */
export class MockAgent {
  private agentId: string;
  private context: Map<string, AgentContext>;
  private performanceMetrics: Map<string, AgentPerformanceMetrics>;
  private responseCache: Map<string, IMessage>;

  constructor(
    private agentType: string,
    private specialties: string[]
  ) {
    if (!SUPPORTED_AGENT_TYPES.includes(agentType)) {
      throw new Error(`Unsupported agent type: ${agentType}`);
    }

    this.agentId = uuidv4();
    this.context = new Map();
    this.performanceMetrics = new Map();
    this.responseCache = new Map();
    this.initializeMetrics();
  }

  /**
   * Processes a message and returns a mock response with timing validation
   */
  async processMessage(
    message: string,
    chatId: string,
    metadata: Record<string, any>
  ): Promise<IMessage> {
    const startTime = Date.now();

    try {
      // Validate input parameters
      if (!message || !chatId) {
        throw new Error('Invalid message or chatId');
      }

      // Find matching pre-defined response
      const response = this.findMatchingResponse(message, metadata);
      
      // Validate response timing
      const processingTime = Date.now() - startTime;
      if (processingTime > RESPONSE_TIMEOUT) {
        throw new Error(`Response time ${processingTime}ms exceeded SLA ${RESPONSE_TIMEOUT}ms`);
      }

      // Update metrics
      this.updateMetrics(chatId, processingTime, response.metadata.confidence_score);

      // Format and return response
      return this.formatResponse(response, chatId, message);

    } catch (error) {
      this.updateMetrics(chatId, Date.now() - startTime, 0, false);
      throw error;
    }
  }

  /**
   * Updates the agent's context with enhanced group dynamics
   */
  updateContext(chatId: string, newContext: Record<string, any>): void {
    const existingContext = this.context.get(chatId) || {
      tokens: [],
      relevantHistory: [],
      userPreferences: {},
      expiresAt: Date.now() + 3600000 // 1 hour TTL
    };

    // Validate context size
    if (existingContext.tokens.length > MAX_CONTEXT_SIZE) {
      existingContext.tokens = existingContext.tokens.slice(-MAX_CONTEXT_SIZE);
    }

    // Merge new context
    const updatedContext = {
      ...existingContext,
      ...newContext,
      expiresAt: Date.now() + 3600000
    };

    this.context.set(chatId, updatedContext);
  }

  /**
   * Retrieves agent performance metrics
   */
  getPerformanceMetrics(chatId?: string): Record<string, any> {
    if (chatId) {
      return this.performanceMetrics.get(chatId) || this.getEmptyMetrics();
    }

    // Aggregate metrics across all chats
    const aggregateMetrics = this.getEmptyMetrics();
    this.performanceMetrics.forEach(metrics => {
      aggregateMetrics.responseTime.push(...metrics.responseTime);
      aggregateMetrics.confidenceScores.push(...metrics.confidenceScores);
      aggregateMetrics.requestCount += metrics.requestCount;
      aggregateMetrics.successRate = (aggregateMetrics.successRate + metrics.successRate) / 2;
    });

    return aggregateMetrics;
  }

  /**
   * Finds a matching pre-defined response based on message content and context
   */
  private findMatchingResponse(message: string, metadata: Record<string, any>): any {
    const responses = ai_responses.filter(r => r.metadata.agent_type === this.agentType);
    
    if (!responses.length) {
      throw new Error(`No pre-defined responses for agent type: ${this.agentType}`);
    }

    // Find best matching response based on context
    const bestMatch = responses.reduce((best, current) => {
      const currentScore = this.calculateMatchScore(current, message, metadata);
      const bestScore = this.calculateMatchScore(best, message, metadata);
      return currentScore > bestScore ? current : best;
    });

    if (bestMatch.metadata.confidence_score < MIN_CONFIDENCE_SCORE) {
      throw new Error(`Confidence score ${bestMatch.metadata.confidence_score} below threshold ${MIN_CONFIDENCE_SCORE}`);
    }

    return bestMatch;
  }

  /**
   * Formats the AI response according to the message interface
   */
  private formatResponse(response: any, chatId: string, originalMessage: string): IMessage {
    return {
      id: uuidv4(),
      chatId,
      senderId: this.agentId,
      content: response.content,
      threadId: response.messageId,
      timestamp: Timestamp.fromDate(new Date()),
      metadata: {
        type: MessageType.AI_RESPONSE,
        formatting: {
          bold: 'false',
          italic: 'false',
          underline: 'false',
          code: 'false'
        },
        mentions: [originalMessage],
        aiContext: {
          confidence: response.metadata.confidence_score.toString(),
          domain: this.agentType,
          context: JSON.stringify(response.metadata.context)
        }
      }
    };
  }

  /**
   * Initializes performance metrics tracking
   */
  private initializeMetrics(): void {
    this.performanceMetrics.set('global', this.getEmptyMetrics());
  }

  /**
   * Updates performance metrics after each response
   */
  private updateMetrics(
    chatId: string,
    responseTime: number,
    confidenceScore: number,
    success: boolean = true
  ): void {
    const metrics = this.performanceMetrics.get(chatId) || this.getEmptyMetrics();
    
    metrics.responseTime.push(responseTime);
    metrics.confidenceScores.push(confidenceScore);
    metrics.requestCount++;
    metrics.successRate = (metrics.successRate * (metrics.requestCount - 1) + (success ? 100 : 0)) / metrics.requestCount;

    this.performanceMetrics.set(chatId, metrics);
  }

  /**
   * Creates empty metrics object
   */
  private getEmptyMetrics(): AgentPerformanceMetrics {
    return {
      responseTime: [],
      confidenceScores: [],
      successRate: 100,
      requestCount: 0,
      contextSize: 0
    };
  }

  /**
   * Calculates match score for response selection
   */
  private calculateMatchScore(response: any, message: string, metadata: Record<string, any>): number {
    let score = response.metadata.confidence_score;

    // Adjust score based on context matching
    if (response.metadata.context.tokens.some(token => message.includes(token))) {
      score += 0.1;
    }

    // Adjust score based on specialty matching
    if (this.specialties.includes(response.metadata.agent_type)) {
      score += 0.1;
    }

    return score;
  }
}

/**
 * Factory class for creating and managing mock agents
 */
export class MockAgentFactory {
  private agents: Map<string, MockAgent> = new Map();
  private metrics: Map<string, any> = new Map();

  /**
   * Creates a new mock agent instance
   */
  createAgent(agentType: string): MockAgent {
    if (!SUPPORTED_AGENT_TYPES.includes(agentType)) {
      throw new Error(`Unsupported agent type: ${agentType}`);
    }

    const agent = new MockAgent(agentType, [agentType]);
    this.agents.set(agent['agentId'], agent);
    return agent;
  }

  /**
   * Resets all mock agents and their metrics
   */
  async bulkReset(): Promise<void> {
    this.agents.clear();
    this.metrics.clear();
  }

  /**
   * Retrieves aggregated metrics for all agents
   */
  getAggregateMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    this.agents.forEach((agent, id) => {
      metrics[id] = agent.getPerformanceMetrics();
    });
    return metrics;
  }
}