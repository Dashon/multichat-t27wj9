import express, { Request, Response, NextFunction } from 'express';
import * as grpc from '@grpc/grpc-js';
import CircuitBreaker from 'circuit-breaker-js';
import Redis from 'ioredis';
import { defaultRateLimitConfig, authRateLimitConfig, aiRateLimitConfig } from '../config/rate-limit.config';

// External package versions:
// @grpc/grpc-js: ^1.8.0
// circuit-breaker-js: ^0.5.0
// ioredis: ^5.0.0
// express: ^4.18.0

interface ServiceHealthCheck {
  serviceName: string;
  status: 'HEALTHY' | 'UNHEALTHY';
  lastCheck: Date;
}

interface SecurityMetrics {
  requestCount: number;
  failedRequests: number;
  blockedRequests: number;
}

export class ProxyService {
  private grpcClients: Map<string, grpc.Client>;
  private circuitBreakers: Map<string, CircuitBreaker>;
  private rateLimitStore: Redis;
  private healthChecks: Map<string, ServiceHealthCheck>;
  private securityMetrics: SecurityMetrics;

  constructor(redisConfig: typeof REDIS_CONFIG, private readonly serviceRegistry = SERVICE_REGISTRY) {
    this.grpcClients = new Map();
    this.circuitBreakers = new Map();
    this.healthChecks = new Map();
    this.securityMetrics = {
      requestCount: 0,
      failedRequests: 0,
      blockedRequests: 0
    };

    // Initialize Redis store for rate limiting
    this.rateLimitStore = new Redis({
      ...redisConfig,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.initializeServices();
  }

  private async initializeServices(): Promise<void> {
    for (const [serviceName, address] of Object.entries(this.serviceRegistry)) {
      await this.createGrpcClient(serviceName, address);
    }
  }

  private async createGrpcClient(serviceName: string, address: string): Promise<void> {
    // Load service proto definition dynamically
    const protoPath = `${__dirname}/../../protos/${serviceName}.proto`;
    const packageDefinition = await grpc.loadPackageDefinition(protoPath);

    // Configure circuit breaker
    const breaker = new CircuitBreaker({
      windowDuration: 10000, // 10 seconds
      numBuckets: 10,
      timeoutDuration: 3000,
      errorThreshold: 50,
      volumeThreshold: 10
    });

    // Create secure credentials
    const credentials = grpc.credentials.createSsl();

    // Initialize gRPC client with credentials
    const client = new grpc.Client(address, credentials);

    // Set up health check monitoring
    this.healthChecks.set(serviceName, {
      serviceName,
      status: 'HEALTHY',
      lastCheck: new Date()
    });

    this.grpcClients.set(serviceName, client);
    this.circuitBreakers.set(serviceName, breaker);

    // Start health check interval
    this.startHealthCheck(serviceName);
  }

  private startHealthCheck(serviceName: string): void {
    setInterval(async () => {
      try {
        const client = this.grpcClients.get(serviceName);
        if (!client) return;

        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 5);

        await new Promise((resolve, reject) => {
          client.waitForReady(deadline, (error?: Error) => {
            if (error) {
              reject(error);
            } else {
              resolve(true);
            }
          });
        });

        this.healthChecks.set(serviceName, {
          serviceName,
          status: 'HEALTHY',
          lastCheck: new Date()
        });
      } catch (error) {
        console.error(`Health check failed for ${serviceName}:`, error);
        this.healthChecks.set(serviceName, {
          serviceName,
          status: 'UNHEALTHY',
          lastCheck: new Date()
        });
      }
    }, 30000); // Check every 30 seconds
  }

  public async handleRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const serviceName = this.getTargetService(req);

    try {
      // Increment request counter
      this.securityMetrics.requestCount++;

      // Apply rate limiting based on service type
      await this.applyRateLimit(req, serviceName);

      // Get circuit breaker for service
      const breaker = this.circuitBreakers.get(serviceName);
      if (!breaker) {
        throw new Error(`Service ${serviceName} not found`);
      }

      // Check service health
      const healthCheck = this.healthChecks.get(serviceName);
      if (healthCheck?.status === 'UNHEALTHY') {
        throw new Error(`Service ${serviceName} is unhealthy`);
      }

      // Execute request through circuit breaker
      await new Promise((resolve, reject) => {
        breaker.run(
          async () => {
            const client = this.grpcClients.get(serviceName);
            if (!client) {
              throw new Error(`gRPC client for ${serviceName} not found`);
            }

            // Transform request to gRPC format
            const grpcRequest = this.transformRequest(req);

            // Make gRPC call
            const response = await this.makeGrpcCall(client, grpcRequest);
            
            // Transform response back to REST format
            const transformedResponse = this.transformResponse(response);
            
            res.status(200).json(transformedResponse);
            resolve(true);
          },
          (err: Error) => {
            this.securityMetrics.failedRequests++;
            reject(err);
          }
        );
      });

      // Log request metrics
      this.logRequestMetrics(req, startTime, serviceName);

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  private async applyRateLimit(req: Request, serviceName: string): Promise<void> {
    let rateLimitConfig;

    switch (serviceName) {
      case 'authService':
        rateLimitConfig = authRateLimitConfig;
        break;
      case 'aiService':
        rateLimitConfig = aiRateLimitConfig;
        break;
      default:
        rateLimitConfig = defaultRateLimitConfig;
    }

    const key = rateLimitConfig.keyGenerator(req);
    const result = await this.rateLimitStore.incr(key);

    if (result > rateLimitConfig.max) {
      this.securityMetrics.blockedRequests++;
      throw new Error('Rate limit exceeded');
    }

    // Set expiry if this is the first request in the window
    if (result === 1) {
      await this.rateLimitStore.expire(key, rateLimitConfig.windowMs / 1000);
    }
  }

  private getTargetService(req: Request): string {
    // Extract service name from request path or header
    const path = req.path.split('/')[1];
    switch (path) {
      case 'auth':
        return 'authService';
      case 'messages':
        return 'messageService';
      case 'ai':
        return 'aiService';
      case 'preferences':
        return 'preferenceService';
      default:
        throw new Error('Invalid service path');
    }
  }

  private transformRequest(req: Request): any {
    // Transform REST request to gRPC format
    return {
      metadata: {
        userId: req.user?.id,
        timestamp: new Date().toISOString(),
        traceId: req.headers['x-trace-id']
      },
      payload: req.body
    };
  }

  private async makeGrpcCall(client: grpc.Client, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      client.makeUnaryRequest(
        request.method,
        request.payload,
        request.metadata,
        (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  private transformResponse(grpcResponse: any): any {
    // Transform gRPC response to REST format
    return {
      data: grpcResponse.payload,
      metadata: grpcResponse.metadata
    };
  }

  private logRequestMetrics(req: Request, startTime: number, serviceName: string): void {
    const duration = Date.now() - startTime;
    console.info({
      type: 'request_metrics',
      service: serviceName,
      method: req.method,
      path: req.path,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  private handleError(error: any, req: Request, res: Response, next: NextFunction): void {
    console.error('Proxy error:', error);

    if (error.message === 'Rate limit exceeded') {
      res.status(429).json({
        error: 'Too many requests, please try again later'
      });
    } else if (error.message.includes('unhealthy')) {
      res.status(503).json({
        error: 'Service temporarily unavailable'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error'
      });
    }

    next(error);
  }

  public getHealthStatus(): ServiceHealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  public getSecurityMetrics(): SecurityMetrics {
    return { ...this.securityMetrics };
  }
}

export default ProxyService;