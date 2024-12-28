/**
 * @fileoverview Enhanced preference service implementing comprehensive preference tracking,
 * synchronization, caching, and intelligent recommendation features with type safety.
 * @version 1.0.0
 */

import { debounce } from 'lodash'; // v4.17.21
import { ApiService } from './api.service';
import { StorageUtils } from '../utils/storage.utils';
import {
  Preference,
  PreferenceType,
  PreferenceUpdate,
  ConfidenceScore,
  isPreferenceType,
  isValidConfidenceScore
} from '../types/preference';

// Constants for preference management
const API_BASE_PATH = '/api/v1/preferences';
const PREFERENCE_CACHE_TTL = 300000; // 5 minutes
const UPDATE_DEBOUNCE_MS = 1000; // 1 second

/**
 * Enhanced service class for managing user preferences with caching,
 * synchronization, and intelligent recommendations
 */
export class PreferenceService {
  private readonly apiService: ApiService;
  private readonly storageUtils: StorageUtils;
  private readonly preferenceCache: Map<string, Preference>;
  private readonly debouncedUpdate: (userId: string, data: PreferenceUpdate<any>) => Promise<void>;

  constructor(apiService: ApiService, storageUtils: StorageUtils) {
    this.apiService = apiService;
    this.storageUtils = storageUtils;
    this.preferenceCache = new Map();
    this.debouncedUpdate = debounce(this.syncPreferences.bind(this), UPDATE_DEBOUNCE_MS);
  }

  /**
   * Retrieves user preferences with caching and offline support
   * @param userId - User identifier
   * @param preferenceType - Type of preference to retrieve
   * @returns Promise resolving to user preferences
   */
  public async getUserPreferences<T>(
    userId: string,
    preferenceType: PreferenceType
  ): Promise<Preference<T>> {
    if (!isPreferenceType(preferenceType)) {
      throw new Error(`Invalid preference type: ${preferenceType}`);
    }

    const cacheKey = this.getCacheKey(userId, preferenceType);
    const cachedPreference = this.preferenceCache.get(cacheKey);

    // Return cached data if valid
    if (cachedPreference && this.isCacheValid(cachedPreference)) {
      return cachedPreference as Preference<T>;
    }

    try {
      // Attempt to fetch from API
      const response = await this.apiService.get<Preference<T>>(
        `${API_BASE_PATH}/${userId}/${preferenceType}`
      );

      // Update cache with new data
      this.preferenceCache.set(cacheKey, response);
      await this.updateLocalStorage(cacheKey, response);

      return response;
    } catch (error) {
      // Fallback to local storage on API failure
      const storedPreference = await this.getFromLocalStorage<T>(cacheKey);
      if (storedPreference) {
        this.preferenceCache.set(cacheKey, storedPreference);
        return storedPreference;
      }
      throw error;
    }
  }

  /**
   * Updates preferences with optimistic updates and synchronization
   * @param userId - User identifier
   * @param preferenceData - Updated preference data
   * @returns Promise resolving to updated preferences
   */
  public async updatePreferences<T>(
    userId: string,
    preferenceData: PreferenceUpdate<T>
  ): Promise<Preference<T>> {
    if (!preferenceData.preferenceType || !isPreferenceType(preferenceData.preferenceType)) {
      throw new Error('Invalid preference type in update data');
    }

    const cacheKey = this.getCacheKey(userId, preferenceData.preferenceType);
    const currentPreference = await this.getUserPreferences<T>(userId, preferenceData.preferenceType);

    // Calculate new confidence score based on update frequency and consistency
    const newConfidenceScore = this.calculateConfidenceScore(currentPreference, preferenceData);

    // Create optimistic update
    const optimisticUpdate: Preference<T> = {
      ...currentPreference,
      preferenceData: {
        ...currentPreference.preferenceData,
        ...preferenceData
      },
      confidenceScore: newConfidenceScore,
      lastUpdated: new Date(),
      version: currentPreference.version + 1,
      history: [
        ...currentPreference.history,
        {
          data: preferenceData,
          timestamp: new Date(),
          version: currentPreference.version + 1
        }
      ]
    };

    // Apply optimistic update to cache
    this.preferenceCache.set(cacheKey, optimisticUpdate);
    await this.updateLocalStorage(cacheKey, optimisticUpdate);

    // Trigger debounced sync with backend
    this.debouncedUpdate(userId, preferenceData);

    return optimisticUpdate;
  }

  /**
   * Retrieves intelligent recommendations based on preference history
   * @param userId - User identifier
   * @param recommendationType - Type of recommendation to retrieve
   * @param context - Additional context for recommendations
   * @returns Promise resolving to ranked recommendations
   */
  public async getRecommendations(
    userId: string,
    recommendationType: string,
    context: Record<string, any> = {}
  ): Promise<Array<any>> {
    try {
      const preferences = await this.getAllUserPreferences(userId);
      
      // Build recommendation context
      const recommendationContext = {
        ...context,
        preferences: preferences.map(pref => ({
          type: pref.preferenceType,
          data: pref.preferenceData,
          confidence: pref.confidenceScore
        })),
        history: preferences.flatMap(pref => pref.history)
      };

      // Request recommendations from API
      const recommendations = await this.apiService.post(
        `${API_BASE_PATH}/recommendations`,
        {
          userId,
          type: recommendationType,
          context: recommendationContext
        }
      );

      return recommendations;
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
      return [];
    }
  }

  /**
   * Synchronizes preferences with backend
   * @param userId - User identifier
   * @param data - Preference data to sync
   */
  private async syncPreferences(
    userId: string,
    data: PreferenceUpdate<any>
  ): Promise<void> {
    try {
      await this.apiService.put(
        `${API_BASE_PATH}/${userId}/${data.preferenceType}`,
        data
      );
    } catch (error) {
      // Handle sync failure - revert optimistic update if needed
      console.error('Preference sync failed:', error);
      const cacheKey = this.getCacheKey(userId, data.preferenceType);
      const storedPreference = await this.getFromLocalStorage(cacheKey);
      if (storedPreference) {
        this.preferenceCache.set(cacheKey, storedPreference);
      }
    }
  }

  /**
   * Retrieves all preferences for a user
   * @param userId - User identifier
   * @returns Promise resolving to all user preferences
   */
  private async getAllUserPreferences(userId: string): Promise<Array<Preference>> {
    try {
      return await this.apiService.get(`${API_BASE_PATH}/${userId}`);
    } catch (error) {
      console.error('Failed to fetch all preferences:', error);
      return [];
    }
  }

  /**
   * Calculates confidence score for preference updates
   * @param current - Current preference state
   * @param update - Preference update data
   * @returns Calculated confidence score
   */
  private calculateConfidenceScore(
    current: Preference,
    update: PreferenceUpdate<any>
  ): ConfidenceScore {
    const baseConfidence = current.confidenceScore;
    const historyLength = current.history.length;
    const consistencyBonus = this.calculateConsistencyBonus(current.history);
    
    let newScore = baseConfidence + (0.1 * consistencyBonus);
    
    // Adjust for update frequency
    if (historyLength > 10) {
      newScore += 0.05;
    }

    // Ensure score remains within valid range
    newScore = Math.min(Math.max(newScore, 0), 1);
    
    return newScore as ConfidenceScore;
  }

  /**
   * Calculates consistency bonus based on preference history
   * @param history - Preference history entries
   * @returns Consistency bonus factor
   */
  private calculateConsistencyBonus(
    history: ReadonlyArray<any>
  ): number {
    if (history.length < 2) return 0;
    
    // Calculate consistency based on similar consecutive updates
    let consistentUpdates = 0;
    for (let i = 1; i < history.length; i++) {
      const similar = this.areUpdatesSimlar(history[i-1], history[i]);
      if (similar) consistentUpdates++;
    }
    
    return consistentUpdates / (history.length - 1);
  }

  /**
   * Compares two preference updates for similarity
   * @param prev - Previous update
   * @param curr - Current update
   * @returns Boolean indicating similarity
   */
  private areUpdatesSimlar(prev: any, curr: any): boolean {
    const prevKeys = Object.keys(prev.data);
    const currKeys = Object.keys(curr.data);
    
    if (prevKeys.length !== currKeys.length) return false;
    
    return prevKeys.every(key => 
      JSON.stringify(prev.data[key]) === JSON.stringify(curr.data[key])
    );
  }

  /**
   * Generates cache key for preference storage
   * @param userId - User identifier
   * @param preferenceType - Preference type
   * @returns Cache key string
   */
  private getCacheKey(userId: string, preferenceType: PreferenceType): string {
    return `preference_${userId}_${preferenceType}`;
  }

  /**
   * Checks if cached preference data is still valid
   * @param preference - Cached preference data
   * @returns Boolean indicating cache validity
   */
  private isCacheValid(preference: Preference): boolean {
    const lastUpdated = new Date(preference.lastUpdated).getTime();
    return Date.now() - lastUpdated < PREFERENCE_CACHE_TTL;
  }

  /**
   * Updates preference data in local storage
   * @param key - Storage key
   * @param data - Preference data to store
   */
  private async updateLocalStorage<T>(
    key: string,
    data: Preference<T>
  ): Promise<void> {
    await this.storageUtils.setEncryptedItem(key, data, {
      expiresIn: PREFERENCE_CACHE_TTL * 2
    });
  }

  /**
   * Retrieves preference data from local storage
   * @param key - Storage key
   * @returns Promise resolving to stored preference data
   */
  private async getFromLocalStorage<T>(key: string): Promise<Preference<T> | null> {
    const result = await this.storageUtils.getEncryptedItem<Preference<T>>(key);
    return result.success ? result.data : null;
  }
}