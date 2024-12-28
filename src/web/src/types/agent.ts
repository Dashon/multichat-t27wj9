/**
 * @fileoverview Defines TypeScript interfaces, types and enums for AI agents in the chat platform.
 * Ensures type safety and consistency across the application.
 * @version 1.0.0
 */

/**
 * Enumeration of available AI agent types based on their specializations.
 * Maps to the AI Agent Specialization Matrix defined in the technical specifications.
 */
export enum AgentType {
  EXPLORER = 'explorer',
  FOODIE = 'foodie',
  PLANNER = 'planner',
  BUDGET = 'budget',
  LOCAL = 'local'
}

/**
 * Enumeration of possible agent status states.
 * Reflects the real-time state of an AI agent in the system.
 */
export enum AgentStatus {
  ACTIVE = 'active',       // Agent is actively engaged in conversation
  RESPONDING = 'responding', // Agent is processing and generating a response
  AVAILABLE = 'available',   // Agent is online and ready to engage
  UNAVAILABLE = 'unavailable', // Agent is offline or not available for interaction
  ERROR = 'error'          // Agent has encountered an error state
}

/**
 * Interface defining the structure of an agent's capability.
 * Represents specific functionalities and integration points available to the agent.
 */
export interface AgentCapability {
  /** Name of the capability */
  name: string;
  
  /** Detailed description of what the capability provides */
  description: string;
  
  /** Array of integration points (APIs, services) used by this capability */
  integrations: string[];
}

/**
 * Main interface defining the structure and properties of an AI agent.
 * Encompasses all aspects of an agent's identity, capabilities, and current state.
 */
export interface Agent {
  /** Unique identifier for the agent */
  id: string;
  
  /** Display name of the agent */
  name: string;
  
  /** The specialized type of agent */
  type: AgentType;
  
  /** Current operational status of the agent */
  status: AgentStatus;
  
  /** URL or path to the agent's avatar image */
  avatar: string;
  
  /** Main area of expertise based on agent type */
  primaryExpertise: string;
  
  /** Additional areas of knowledge or capabilities */
  secondaryCapabilities: string[];
  
  /** Detailed array of agent capabilities and integrations */
  capabilities: AgentCapability[];
  
  /** Timestamp of the agent's last activity */
  lastActive: Date;
}