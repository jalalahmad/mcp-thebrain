import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express, { Express, Request, Response, NextFunction } from 'express';
import * as http from 'http';
import logger from './utils/logger';
import { TheBrainError, errorMiddleware } from './utils/error-handler';
import { OAuth21Provider, OAuthConfig } from './auth/oauth';
import { ApiKeyAuthProvider, createApiKeyAuth } from './auth/api-key';
import { createSecurityMiddleware, RateLimiter, CSRFProtection } from './auth/security';
import { performanceMonitor, performanceMiddleware } from './monitoring/performance';
import { progressReporter } from './utils/progress';

export enum TransportType {
  STDIO = 'stdio',
  HTTP = 'http'
}

export interface TransportConfig {
  type: TransportType;
  httpPort?: number;
  httpHost?: string;
  basePath?: string;
  authType?: 'oauth' | 'api-key' | 'both' | 'none';
  oauthConfig?: OAuthConfig;
  enableRateLimit?: boolean;
  enableCsrf?: boolean;
  enableSecurityHeaders?: boolean;
}

export class TransportManager {
  private server: Server;
  private config: TransportConfig;
  private httpServer?: http.Server;
  private app?: Express;
  private oauthProvider?: OAuth21Provider;
  private apiKeyProvider?: ApiKeyAuthProvider;
  private rateLimiter?: RateLimiter;
  private csrfProtection?: CSRFProtection;

  constructor(server: Server) {
    this.server = server;
    this.config = this.loadConfig();
  }

  private loadConfig(): TransportConfig {
    const type = (process.env.TRANSPORT_TYPE || TransportType.STDIO) as TransportType;
    
    if (!Object.values(TransportType).includes(type)) {
      throw new Error(`Invalid transport type: ${type}`);
    }

    return {
      type,
      httpPort: parseInt(process.env.HTTP_PORT || '3000', 10),
      httpHost: process.env.HTTP_HOST || '0.0.0.0',
      basePath: process.env.BASE_PATH || '/api/v1',
      authType: (process.env.AUTH_TYPE || 'api-key') as 'oauth' | 'api-key' | 'both' | 'none',
      enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
      enableCsrf: process.env.ENABLE_CSRF !== 'false',
      enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false'
    };
  }

  async start(): Promise<void> {
    logger.info(`Starting transport: ${this.config.type}`);

    // Start performance monitoring if HTTP
    if (this.config.type === TransportType.HTTP) {
      performanceMonitor.start();
      logger.info('Performance monitoring started');
    }

    // Set up progress reporting listeners if needed
    this.setupProgressReporting();

    switch (this.config.type) {
      case TransportType.STDIO:
        await this.startStdio();
        break;
      case TransportType.HTTP:
        await this.startHttp();
        break;
      default:
        throw new Error(`Unsupported transport type: ${this.config.type}`);
    }
  }

  private async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Stdio transport started');
  }

  private async startHttp(): Promise<void> {
    this.app = express();
    
    // Middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Initialize authentication providers
    this.initializeAuth();
    
    // Apply security middleware
    this.applySecurityMiddleware();
    
    // Apply performance monitoring middleware
    this.app.use(performanceMiddleware());
    
    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      const originalEnd = res.end;
      
      res.end = function(...args: any[]) {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
          userAgent: req.get('user-agent')
        });
        return (originalEnd as any).apply(res, args);
      } as any;
      
      next();
    });

    // Public endpoints (no auth required)
    this.app.get('/health', (req, res) => {
      const metrics = performanceMonitor.getCurrentMetrics();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        transport: this.config.type,
        version: process.env.npm_package_version || '1.0.0',
        performance: metrics ? {
          cpu: metrics.cpu.usage,
          memory: metrics.memory.percentUsed,
          throughput: metrics.throughput
        } : undefined
      });
    });

    // API info endpoint (public)
    this.app.get(`${this.config.basePath}/info`, (req, res) => {
      res.json({
        name: 'TheBrain MCP Server',
        version: process.env.npm_package_version || '1.0.0',
        transport: this.config.type,
        capabilities: {
          resources: true,
          tools: true,
          prompts: true
        }
      });
    });

    // Setup auth routes if enabled
    this.setupAuthRoutes();
    
    // Setup monitoring endpoints
    this.setupMonitoringEndpoints();
    
    // Apply authentication middleware to protected routes
    if (this.config.authType !== 'none' && this.config.basePath) {
      this.app.use(this.config.basePath, this.getAuthMiddleware());
    }
    
    // MCP endpoints (protected by auth)
    this.setupMcpEndpoints();

    // Error handling middleware (use enhanced error handler)
    this.app.use(errorMiddleware);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: {
          type: 'NotFound',
          message: `Endpoint not found: ${req.method} ${req.url}`
        }
      });
    });

    // Start server
    return new Promise((resolve, reject) => {
      this.httpServer = this.app!.listen(this.config.httpPort!, this.config.httpHost!, () => {
        logger.info('HTTP transport started', {
          host: this.config.httpHost,
          port: this.config.httpPort,
          basePath: this.config.basePath
        });
        resolve();
      });

      this.httpServer.on('error', (err) => {
        logger.error('HTTP server error:', err);
        reject(err);
      });
    });
  }

  private setupMcpEndpoints(): void {
    const basePath = this.config.basePath!;

    // Resources endpoint
    this.app!.get(`${basePath}/resources`, async (req, res, next) => {
      try {
        // This would be connected to the MCP server's resource listing
        // For now, we'll return a placeholder
        res.json({
          resources: [
            { type: 'brains', description: 'List available brains' },
            { type: 'thought', description: 'Get specific thought' },
            { type: 'search', description: 'Search thoughts' },
            { type: 'children', description: 'Get child thoughts' }
          ]
        });
      } catch (error) {
        next(error);
      }
    });

    // Tools endpoint
    this.app!.get(`${basePath}/tools`, async (req, res, next) => {
      try {
        // This would be connected to the MCP server's tool listing
        res.json({
          tools: [
            { name: 'create_thought', description: 'Create a new thought' },
            { name: 'update_thought', description: 'Update existing thought' },
            { name: 'create_link', description: 'Create link between thoughts' }
          ]
        });
      } catch (error) {
        next(error);
      }
    });

    // Prompts endpoint
    this.app!.get(`${basePath}/prompts`, async (req, res, next) => {
      try {
        // This would be connected to the MCP server's prompt listing
        res.json({
          prompts: [
            { name: 'search_thoughts', description: 'Guide for searching' },
            { name: 'create_structured_thought', description: 'Guide for creating thoughts' }
          ]
        });
      } catch (error) {
        next(error);
      }
    });

    // Execute tool endpoint
    this.app!.post(`${basePath}/tools/:toolName`, async (req, res, next) => {
      try {
        const { toolName } = req.params;
        const args = req.body;
        
        // This would be connected to the MCP server's tool execution
        // For now, we'll return a placeholder
        res.json({
          result: {
            success: true,
            message: `Tool ${toolName} executed`,
            args
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // Get resource endpoint - with ID
    this.app!.get(`${basePath}/resources/:resourceType/:resourceId`, async (req, res, next) => {
      try {
        const { resourceType, resourceId } = req.params;
        
        // This would be connected to the MCP server's resource retrieval
        res.json({
          resource: {
            type: resourceType,
            id: resourceId,
            content: `Resource content for ${resourceType}/${resourceId}`
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // Get resource endpoint - without ID (list)
    this.app!.get(`${basePath}/resources/:resourceType`, async (req, res, next) => {
      try {
        const { resourceType } = req.params;
        
        // This would be connected to the MCP server's resource listing
        res.json({
          resources: [
            {
              type: resourceType,
              id: 'example-1',
              content: `Example resource 1 of type ${resourceType}`
            },
            {
              type: resourceType,
              id: 'example-2',
              content: `Example resource 2 of type ${resourceType}`
            }
          ]
        });
      } catch (error) {
        next(error);
      }
    });

    // Execute prompt endpoint
    this.app!.post(`${basePath}/prompts/:promptName`, async (req, res, next) => {
      try {
        const { promptName } = req.params;
        const args = req.body;
        
        // This would be connected to the MCP server's prompt execution
        res.json({
          result: {
            content: `Prompt ${promptName} executed with args`,
            args
          }
        });
      } catch (error) {
        next(error);
      }
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping transport...');

    // Stop performance monitoring
    if (this.config.type === TransportType.HTTP) {
      performanceMonitor.stop();
      logger.info('Performance monitoring stopped');
    }

    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) {
            logger.error('Error stopping HTTP server:', err);
            reject(err);
          } else {
            logger.info('HTTP transport stopped');
            resolve();
          }
        });
      });
    }

    await this.server.close();
    logger.info('Transport stopped');
  }

  getConfig(): TransportConfig {
    return { ...this.config };
  }

  isHttpTransport(): boolean {
    return this.config.type === TransportType.HTTP;
  }

  getHttpServer(): http.Server | undefined {
    return this.httpServer;
  }

  getExpressApp(): Express | undefined {
    return this.app;
  }

  private initializeAuth(): void {
    if (this.config.authType === 'none') {
      return;
    }

    // Initialize OAuth provider
    if (this.config.authType === 'oauth' || this.config.authType === 'both') {
      const oauthConfig: OAuthConfig = this.config.oauthConfig || {
        clientId: process.env.OAUTH_CLIENT_ID || '',
        clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
        redirectUri: process.env.OAUTH_REDIRECT_URI || `http://localhost:${this.config.httpPort}/oauth/callback`,
        authorizationEndpoint: process.env.OAUTH_AUTH_ENDPOINT || '/oauth/authorize',
        tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT || '/oauth/token',
        scope: process.env.OAUTH_SCOPE,
        allowedClients: new Set(process.env.OAUTH_ALLOWED_CLIENTS?.split(',') || [])
      };

      this.oauthProvider = new OAuth21Provider(oauthConfig);
    }

    // Initialize API key provider
    if (this.config.authType === 'api-key' || this.config.authType === 'both') {
      this.apiKeyProvider = createApiKeyAuth();
    }
  }

  private setupAuthRoutes(): void {
    if (!this.app) return;

    // OAuth routes
    if (this.oauthProvider) {
      this.app.use('/oauth', this.oauthProvider.getRoutes());
    }

    // API key management routes (if enabled)
    if (this.apiKeyProvider && process.env.ENABLE_API_KEY_MANAGEMENT === 'true') {
      // These should be protected by admin auth
      this.app.use('/api-keys', this.requireAdminAuth(), this.apiKeyProvider.getManagementRoutes());
    }
  }

  private getAuthMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip auth for certain paths
      if (req.path === '/health' || req.path === `${this.config.basePath}/info`) {
        return next();
      }

      switch (this.config.authType) {
        case 'oauth':
          if (this.oauthProvider) {
            return this.oauthProvider.middleware()(req, res, next);
          }
          break;
        case 'api-key':
          if (this.apiKeyProvider) {
            return this.apiKeyProvider.middleware()(req, res, next);
          }
          break;
        case 'both':
          // Try API key first, then OAuth
          if (this.apiKeyProvider && req.headers['x-api-key']) {
            return this.apiKeyProvider.middleware()(req, res, next);
          } else if (this.oauthProvider && req.headers.authorization) {
            return this.oauthProvider.middleware()(req, res, next);
          } else {
            return res.status(401).json({
              error: 'unauthorized',
              error_description: 'Authentication required'
            });
          }
        default:
          next();
      }
    };
  }

  private requireAdminAuth(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      // Check for admin API key
      const adminKey = process.env.ADMIN_API_KEY;
      const providedKey = req.headers['x-admin-key'] as string;

      if (!adminKey || !providedKey || providedKey !== adminKey) {
        return res.status(403).json({
          error: 'forbidden',
          error_description: 'Admin access required'
        });
      }

      next();
    };
  }

  private applySecurityMiddleware(): void {
    if (!this.app) return;

    const security = createSecurityMiddleware({
      rateLimit: this.config.enableRateLimit ? {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true'
      } : undefined,
      csrf: this.config.enableCsrf ? {
        cookieName: process.env.CSRF_COOKIE_NAME || 'csrf-token',
        headerName: process.env.CSRF_HEADER_NAME || 'X-CSRF-Token'
      } : false,
      headers: this.config.enableSecurityHeaders
    });

    // Apply combined security middleware
    this.app.use(security.middleware);

    // Store references for testing or management
    this.rateLimiter = security.rateLimiter;
    this.csrfProtection = security.csrfProtection;

    logger.info('Security middleware applied', {
      rateLimit: this.config.enableRateLimit,
      csrf: this.config.enableCsrf,
      headers: this.config.enableSecurityHeaders
    });
  }

  private setupProgressReporting(): void {
    // Set up progress reporting listeners
    progressReporter.on('progress', (update) => {
      logger.info('Progress update', {
        taskId: update.taskId,
        operation: update.operation,
        progress: `${update.current}/${update.total}`,
        message: update.message
      });

      // If using HTTP, we could send this via WebSocket or SSE
      if (this.config.type === TransportType.HTTP) {
        // TODO: Implement WebSocket/SSE for real-time progress updates
      }
    });

    progressReporter.on('complete', (update) => {
      logger.info('Operation completed', {
        taskId: update.taskId,
        operation: update.operation
      });
    });

    progressReporter.on('error', ({ taskId, error }) => {
      logger.error('Operation failed', {
        taskId,
        error: error.message
      });
    });
  }

  // New endpoints for monitoring and progress
  private setupMonitoringEndpoints(): void {
    if (!this.app) return;

    // Performance metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const report = performanceMonitor.getPerformanceReport();
      res.json(report);
    });

    // Active operations endpoint
    this.app.get('/operations', (req, res) => {
      const operations = progressReporter.getActiveOperations();
      res.json({ operations });
    });

    // Progress updates for specific operation
    this.app.get('/operations/:taskId', (req, res) => {
      const progress = progressReporter.getProgress(req.params.taskId);
      if (progress) {
        res.json(progress);
      } else {
        res.status(404).json({
          error: 'Operation not found'
        });
      }
    });
  }
}