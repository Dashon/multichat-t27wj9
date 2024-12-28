import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import supertest, { SuperTest, Test } from 'supertest';
import axios from 'axios';
import { defaultRateLimitConfig, authRateLimitConfig, aiRateLimitConfig } from '../../../backend/api-gateway/src/config/rate-limit.config';
import { authenticate } from '../../../backend/api-gateway/src/middleware/auth.middleware';

/**
 * Test suite for API Gateway rate limit bypass protection
 * Version: 1.0.0
 * Tests security controls against rate limit bypass attempts
 */

class RateLimitBypassTests {
    private request: SuperTest<Test>;
    private readonly baseUrl: string = 'http://localhost:3000';
    private readonly testConfigs = {
        defaultLimit: {
            windowMs: defaultRateLimitConfig.windowMs,
            max: defaultRateLimitConfig.max
        },
        authLimit: {
            windowMs: authRateLimitConfig.windowMs,
            max: authRateLimitConfig.max
        },
        aiLimit: {
            windowMs: aiRateLimitConfig.windowMs,
            max: aiRateLimitConfig.max
        }
    };

    constructor() {
        this.request = supertest(this.baseUrl);
    }

    /**
     * Generates parallel requests for rate limit testing
     * @param endpoint - API endpoint to test
     * @param count - Number of requests to generate
     * @param options - Request options including headers
     */
    private async generateParallelRequests(
        endpoint: string,
        count: number,
        options: { headers?: Record<string, string> } = {}
    ): Promise<{ responses: any[], timings: number[] }> {
        const requests = Array(count).fill(null).map(() => ({
            startTime: Date.now(),
            request: axios.get(`${this.baseUrl}${endpoint}`, {
                headers: options.headers,
                validateStatus: () => true
            })
        }));

        const results = await Promise.all(requests.map(async ({ startTime, request }) => {
            try {
                const response = await request;
                return {
                    response,
                    timing: Date.now() - startTime
                };
            } catch (error) {
                return {
                    response: error.response,
                    timing: Date.now() - startTime
                };
            }
        }));

        return {
            responses: results.map(r => r.response),
            timings: results.map(r => r.timing)
        };
    }

    /**
     * Tests default rate limit cannot be bypassed
     */
    @describe('Default Rate Limit Tests')
    public async testDefaultRateLimit(): Promise<void> {
        const endpoint = '/api/v1/messages';
        const { max, windowMs } = this.testConfigs.defaultLimit;

        // Test normal request flow
        test('Should allow requests within limit', async () => {
            const { responses } = await this.generateParallelRequests(endpoint, max - 1);
            responses.forEach(response => {
                expect(response.status).not.toBe(429);
            });
        });

        // Test rate limit enforcement
        test('Should block requests exceeding limit', async () => {
            const { responses } = await this.generateParallelRequests(endpoint, max + 10);
            const blockedResponses = responses.filter(r => r.status === 429);
            expect(blockedResponses.length).toBeGreaterThan(0);
            expect(blockedResponses[0].data).toHaveProperty('retryAfter');
        });

        // Test rate limit reset
        test('Should reset rate limit after window', async () => {
            await new Promise(resolve => setTimeout(resolve, windowMs));
            const { responses } = await this.generateParallelRequests(endpoint, 1);
            expect(responses[0].status).not.toBe(429);
        });
    }

    /**
     * Tests authentication endpoint rate limit with lockout
     */
    @describe('Authentication Rate Limit Tests')
    public async testAuthRateLimit(): Promise<void> {
        const endpoint = '/api/v1/auth/login';
        const { max, windowMs } = this.testConfigs.authLimit;

        // Test strict auth rate limiting
        test('Should enforce strict rate limit on auth endpoints', async () => {
            const { responses } = await this.generateParallelRequests(endpoint, max + 1);
            const lastResponse = responses[responses.length - 1];
            expect(lastResponse.status).toBe(429);
            expect(lastResponse.data.error).toContain('authentication attempts');
        });

        // Test IP-based tracking
        test('Should track rate limits by IP', async () => {
            const headers = { 'X-Forwarded-For': '192.168.1.1' };
            const { responses: firstBatch } = await this.generateParallelRequests(
                endpoint,
                max + 1,
                { headers }
            );
            expect(firstBatch[max].status).toBe(429);

            const differentIpHeaders = { 'X-Forwarded-For': '192.168.1.2' };
            const { responses: secondBatch } = await this.generateParallelRequests(
                endpoint,
                1,
                { headers: differentIpHeaders }
            );
            expect(secondBatch[0].status).not.toBe(429);
        });
    }

    /**
     * Tests AI service endpoint rate limit with cooldown
     */
    @describe('AI Service Rate Limit Tests')
    public async testAIServiceRateLimit(): Promise<void> {
        const endpoint = '/api/v1/ai/query';
        const { max, windowMs } = this.testConfigs.aiLimit;

        // Test AI service rate limiting
        test('Should enforce AI service rate limits', async () => {
            const { responses, timings } = await this.generateParallelRequests(endpoint, max + 5);
            
            expect(responses.some(r => r.status === 429)).toBeTruthy();
            expect(Math.max(...timings)).toBeLessThan(5000); // Response time SLA
        });

        // Test service degradation
        test('Should handle service degradation gracefully', async () => {
            const { responses } = await this.generateParallelRequests(endpoint, max * 2);
            const errorResponses = responses.filter(r => r.status === 429);
            
            errorResponses.forEach(response => {
                expect(response.data).toHaveProperty('error');
                expect(response.data).toHaveProperty('retryAfter');
            });
        });
    }

    /**
     * Tests rate limit bypass through header manipulation
     */
    @describe('Header Manipulation Tests')
    public async testHeaderManipulation(): Promise<void> {
        const endpoint = '/api/v1/messages';

        // Test X-Forwarded-For spoofing
        test('Should prevent X-Forwarded-For spoofing', async () => {
            const spoofedHeaders = {
                'X-Forwarded-For': '1.1.1.1, 2.2.2.2, 3.3.3.3'
            };

            const { responses } = await this.generateParallelRequests(
                endpoint,
                this.testConfigs.defaultLimit.max + 1,
                { headers: spoofedHeaders }
            );

            expect(responses[responses.length - 1].status).toBe(429);
        });

        // Test User-Agent rotation
        test('Should detect User-Agent rotation attempts', async () => {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            ];

            const results = await Promise.all(
                userAgents.map(ua => 
                    this.generateParallelRequests(endpoint, 
                        this.testConfigs.defaultLimit.max, 
                        { headers: { 'User-Agent': ua } }
                    )
                )
            );

            const totalRequests = results.reduce((sum, { responses }) => 
                sum + responses.filter(r => r.status !== 429).length, 0);

            expect(totalRequests).toBeLessThanOrEqual(this.testConfigs.defaultLimit.max * 1.5);
        });
    }

    /**
     * Tests distributed rate limit bypass attempts
     */
    @describe('Distributed Attack Tests')
    public async testDistributedAttack(): Promise<void> {
        const endpoint = '/api/v1/messages';

        // Test cluster-wide rate limiting
        test('Should enforce cluster-wide rate limits', async () => {
            const proxyIps = Array(5).fill(null).map((_, i) => `10.0.0.${i + 1}`);
            
            const results = await Promise.all(
                proxyIps.map(ip => 
                    this.generateParallelRequests(endpoint, 
                        Math.ceil(this.testConfigs.defaultLimit.max / 2),
                        { headers: { 'X-Forwarded-For': ip } }
                    )
                )
            );

            const totalSuccessful = results.reduce((sum, { responses }) => 
                sum + responses.filter(r => r.status !== 429).length, 0);

            expect(totalSuccessful).toBeLessThanOrEqual(this.testConfigs.defaultLimit.max * 1.2);
        });

        // Test rate limit persistence
        test('Should maintain rate limits across restarts', async () => {
            const { responses: firstBatch } = await this.generateParallelRequests(
                endpoint,
                this.testConfigs.defaultLimit.max
            );

            // Simulate service restart
            await new Promise(resolve => setTimeout(resolve, 1000));

            const { responses: secondBatch } = await this.generateParallelRequests(
                endpoint,
                5
            );

            expect(secondBatch.some(r => r.status === 429)).toBeTruthy();
        });
    }
}

export default RateLimitBypassTests;