/**
 * @fileoverview TypeScript type definitions for recommendation-related data structures.
 * Implements the recommendation management system as specified in the technical requirements.
 * @version 1.0.0
 */

import { AgentType } from './agent';
import { User } from './user';

/**
 * Enumeration of recommendation types based on the AI Agent Specialization Matrix.
 * Maps to different categories of recommendations that can be provided by agents.
 */
export enum RecommendationType {
  DINING = 'dining',
  ACTIVITY = 'activity',
  VENUE = 'venue',
  ITINERARY = 'itinerary'
}

/**
 * Enumeration of possible recommendation status states.
 * Tracks the lifecycle state of each recommendation.
 */
export enum RecommendationStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  EXPIRED = 'expired'
}

/**
 * Interface defining additional metadata associated with a recommendation.
 * Provides supplementary information to enhance recommendation context.
 */
export interface RecommendationMetadata {
  /** Physical location or address associated with the recommendation */
  location: string | null;
  
  /** Price indicator (e.g., "$", "$$", "$$$") */
  price: string | null;
  
  /** Categorization and searchable tags */
  tags: string[];
  
  /** External reference URL for more information */
  url: string | null;
  
  /** URL to associated image content */
  imageUrl: string | null;
}

/**
 * Main interface defining the structure of a recommendation.
 * Implements comprehensive recommendation data model for the platform.
 */
export interface Recommendation {
  /** Unique identifier for the recommendation */
  id: string;
  
  /** Short descriptive title */
  title: string;
  
  /** Detailed description of the recommendation */
  description: string;
  
  /** Category classification */
  type: RecommendationType;
  
  /** Current lifecycle status */
  status: RecommendationStatus;
  
  /** Type of AI agent that generated the recommendation */
  agentType: AgentType;
  
  /** Numerical rating (0-5 scale, supporting half points) */
  rating: number;
  
  /** Additional contextual information */
  metadata: RecommendationMetadata;
  
  /** Timestamp of creation */
  createdAt: Date;
  
  /** Optional expiration timestamp */
  expiresAt: Date | null;
}

/**
 * Interface defining filter criteria for recommendation queries.
 * Supports flexible filtering of recommendations based on multiple attributes.
 */
export interface RecommendationFilter {
  /** Filter by recommendation category */
  type: RecommendationType | null;
  
  /** Filter by source AI agent type */
  agentType: AgentType | null;
  
  /** Filter by current status */
  status: RecommendationStatus | null;
  
  /** Filter by minimum rating threshold */
  minRating: number | null;
}

/**
 * Type guard to check if a value is a valid RecommendationType
 */
export const isRecommendationType = (value: any): value is RecommendationType => {
  return Object.values(RecommendationType).includes(value as RecommendationType);
};

/**
 * Type guard to check if a value is a valid RecommendationStatus
 */
export const isRecommendationStatus = (value: any): value is RecommendationStatus => {
  return Object.values(RecommendationStatus).includes(value as RecommendationStatus);
};

/**
 * Type guard to check if an object is a valid Recommendation
 */
export const isRecommendation = (value: any): value is Recommendation => {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    isRecommendationType(value.type) &&
    isRecommendationStatus(value.status) &&
    typeof value.rating === 'number' &&
    value.rating >= 0 &&
    value.rating <= 5 &&
    value.metadata !== null &&
    typeof value.metadata === 'object' &&
    value.createdAt instanceof Date
  );
};