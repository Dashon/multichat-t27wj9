import { ThemeMode } from './theme';

/**
 * Enum defining available preference categories
 * @version 1.0.0
 */
export enum PreferenceType {
  CHAT = 'chat',
  AI_AGENT = 'ai_agent',
  UI = 'ui',
  NOTIFICATION = 'notification'
}

/**
 * Branded type for confidence scores between 0 and 1
 * Ensures type safety for preference learning confidence values
 */
export type ConfidenceScore = number & { readonly _brand: unique symbol };

/**
 * Message display mode options for chat interface
 */
export enum MessageDisplayMode {
  COMPACT = 'compact',
  COMFORTABLE = 'comfortable',
  EXPANDED = 'expanded'
}

/**
 * Font size options for chat messages
 */
export enum FontSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large'
}

/**
 * Message grouping strategy options
 */
export enum GroupingStrategy {
  TIME = 'time',
  SENDER = 'sender',
  TOPIC = 'topic',
  NONE = 'none'
}

/**
 * AI agent interaction style preferences
 */
export enum AIInteractionStyle {
  PROACTIVE = 'proactive',
  REACTIVE = 'reactive',
  BALANCED = 'balanced'
}

/**
 * Context retention period options for AI agents
 */
export enum RetentionPeriod {
  SHORT = '1_hour',
  MEDIUM = '1_day',
  LONG = '1_week',
  CUSTOM = 'custom'
}

/**
 * UI display density options
 */
export enum UIDisplayDensity {
  COMPACT = 'compact',
  COMFORTABLE = 'comfortable',
  SPACIOUS = 'spacious'
}

/**
 * Notification frequency settings
 */
export enum NotificationFrequency {
  REAL_TIME = 'real_time',
  BATCHED = 'batched',
  SCHEDULED = 'scheduled'
}

/**
 * Type-safe preference data based on preference type
 */
export type ValidatedPreferenceData<T> = T & {
  readonly _validated: unique symbol;
};

/**
 * Interface for tracking preference history with versioning
 */
export interface PreferenceHistoryEntry {
  readonly data: Record<string, any>;
  readonly timestamp: Date;
  readonly version: number;
}

/**
 * Accessibility settings interface
 */
export interface AccessibilitySettings {
  readonly highContrast: boolean;
  readonly reduceMotion: boolean;
  readonly screenReader: boolean;
  readonly fontSize: FontSize;
}

/**
 * Quiet hours configuration
 */
export interface QuietHoursSettings {
  readonly enabled: boolean;
  readonly startTime: string; // 24-hour format HH:mm
  readonly endTime: string; // 24-hour format HH:mm
  readonly timezone: string;
  readonly days: ReadonlyArray<number>; // 0-6, where 0 is Sunday
}

/**
 * Main preference interface with type safety and validation
 */
export interface Preference<T = any> {
  readonly preferenceId: string;
  readonly userId: string;
  readonly preferenceType: PreferenceType;
  readonly preferenceData: ValidatedPreferenceData<T>;
  readonly history: ReadonlyArray<PreferenceHistoryEntry>;
  readonly confidenceScore: ConfidenceScore;
  readonly createdAt: Date;
  readonly lastUpdated: Date;
  readonly version: number;
}

/**
 * Chat-specific preferences interface
 */
export interface ChatPreferences {
  readonly messageDisplay: MessageDisplayMode;
  readonly fontSize: FontSize;
  readonly showTimestamps: boolean;
  readonly messageGrouping: GroupingStrategy;
}

/**
 * AI agent-specific preferences interface
 */
export interface AIAgentPreferences {
  readonly preferredAgents: ReadonlyArray<string>;
  readonly autoSuggestions: boolean;
  readonly contextRetention: RetentionPeriod;
  readonly interactionStyle: AIInteractionStyle;
}

/**
 * UI-specific preferences interface
 */
export interface UIPreferences {
  readonly theme: ThemeMode;
  readonly density: UIDisplayDensity;
  readonly animations: boolean;
  readonly accessibility: AccessibilitySettings;
}

/**
 * Notification-specific preferences interface
 */
export interface NotificationPreferences {
  readonly email: boolean;
  readonly push: boolean;
  readonly mentions: boolean;
  readonly frequency: NotificationFrequency;
  readonly quietHours: QuietHoursSettings;
}

/**
 * Type guard to check if a value is a valid PreferenceType
 */
export const isPreferenceType = (value: any): value is PreferenceType => {
  return Object.values(PreferenceType).includes(value as PreferenceType);
};

/**
 * Type guard to validate confidence score range
 */
export const isValidConfidenceScore = (value: number): value is ConfidenceScore => {
  return value >= 0 && value <= 1;
};

/**
 * Helper type for preference updates
 */
export type PreferenceUpdate<T> = Partial<T> & {
  readonly version: number;
};