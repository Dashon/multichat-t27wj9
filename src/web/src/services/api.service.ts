/**
 * @fileoverview Core API service for the AI-Enhanced Group Chat Platform web client.
 * Implements enterprise-grade request handling, security, caching, and fault tolerance.
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'; // v1.6.0
import CircuitBreaker from 'circuit-breaker-js'; // v0.0.1
import { apiConfig } from '../config/api.config';
import { getAccessToken } from '../utils/auth.utils';
import { formatApiError } from '../utils/api.utils';

/**
 * Request cache entry interface
 */
interface CacheEntry {
  data: any;
  timestamp: number;
  expiresAt: number;
}

/**
 * API service configuration interface
 */
interface ApiServiceConfig {
  cacheTimeout: number;
  maxRetries: number;
  retryDelay: number;
  circuitBreakerTimeout: number;
  circuitBreakerThreshold: number;
}

/**
 * Enhanced API service class implementing comprehensive request handling
 */
export class ApiService {
  private static instance: ApiService;
  private apiInstance: AxiosInstance;
  private cache: Map<string, CacheEntry>;
  private circuitBreaker: any;
  private requestQueue: Array<() => Promise<any>>;
  private config: ApiServiceConfig;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.config = {
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerTimeout: 10000,
      circuitBreakerThreshold: 5
    };

    this.cache = new Map();
    this.requestQueue = [];
    this.initializeApiInstance();
    this.initializeCircuitBreaker();
  }

  /**
   * Get singleton instance of ApiService
   */
  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Initialize axios instance with enhanced configuration
   */
  private initializeApiInstance(): void {
    this.apiInstance = axios.create({
      ...apiConfig,
      validateStatus: (status) => status >= 200 && status < 500
    });

    // Request interceptor for authentication and security
    this.apiInstance.interceptors.request.use(
      async (config) => {
        const token = await getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Add security headers
        config.headers = {
          ...config.headers,
          ...apiConfig.securityHeaders,
          'X-Request-ID': this.generateRequestId()
        };

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling and transformation
    this.apiInstance.interceptors.response.use(
      (response) => this.handleResponse(response),
      (error) => this.handleError(error)
    );
  }

  /**
   * Initialize circuit breaker for fault tolerance
   */
  private initializeCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreaker({
      windowDuration: this.config.circuitBreakerTimeout,
      failureThreshold: this.config.circuitBreakerThreshold,
      resetTimeout: this.config.circuitBreakerTimeout * 2
    });
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle successful response with caching
   */
  private handleResponse(response: AxiosResponse): any {
    const cacheKey = this.getCacheKey(response.config);
    
    if (this.isCacheable(response.config)) {
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.config.cacheTimeout
      });
    }

    return response.data;
  }

  /**
   * Handle request error with retry logic
   */
  private async handleError(error: AxiosError): Promise<any> {
    const formattedError = formatApiError(error, {
      timestamp: Date.now(),
      requestId: error.config?.headers?.['X-Request-ID'] as string
    });

    if (this.shouldRetry(error, formattedError.context.retryCount)) {
      formattedError.context.retryCount = (formattedError.context.retryCount || 0) + 1;
      await this.delay(this.getRetryDelay(formattedError.context.retryCount));
      return this.executeRequest(error.config!);
    }

    throw formattedError;
  }

  /**
   * Execute request with circuit breaker
   */
  private async executeRequest(config: AxiosRequestConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      this.circuitBreaker.run(
        () => this.apiInstance.request(config),
        resolve,
        reject
      );
    });
  }

  /**
   * Check if request should be retried
   */
  private shouldRetry(error: AxiosError, retryCount: number): boolean {
    return (
      retryCount < this.config.maxRetries &&
      (!error.response || error.response.status >= 500 || error.response.status === 429)
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private getRetryDelay(retryCount: number): number {
    return Math.min(
      this.config.retryDelay * Math.pow(2, retryCount),
      10000
    );
  }

  /**
   * Delay helper function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(config: AxiosRequestConfig): string {
    return `${config.method}-${config.url}-${JSON.stringify(config.params || {})}-${JSON.stringify(config.data || {})}`;
  }

  /**
   * Check if request is cacheable
   */
  private isCacheable(config: AxiosRequestConfig): boolean {
    return config.method?.toLowerCase() === 'get' && !config.headers?.['x-no-cache'];
  }

  /**
   * Enhanced GET request with caching
   */
  public async get<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    const cacheKey = this.getCacheKey({ ...config, url, method: 'get' });
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    return this.executeRequest({ ...config, url, method: 'get' });
  }

  /**
   * Enhanced POST request
   */
  public async post<T>(url: string, data?: any, config: AxiosRequestConfig = {}): Promise<T> {
    return this.executeRequest({ ...config, url, method: 'post', data });
  }

  /**
   * Enhanced PUT request
   */
  public async put<T>(url: string, data?: any, config: AxiosRequestConfig = {}): Promise<T> {
    return this.executeRequest({ ...config, url, method: 'put', data });
  }

  /**
   * Enhanced DELETE request
   */
  public async delete<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    return this.executeRequest({ ...config, url, method: 'delete', ...config });
  }

  /**
   * Clear cache entries
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset circuit breaker
   */
  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}

// Export singleton instance
export const apiService = ApiService.getInstance();