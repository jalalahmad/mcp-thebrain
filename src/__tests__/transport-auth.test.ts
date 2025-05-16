import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { TransportManager, TransportType } from '../transport';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../utils/logger');
jest.mock('../auth/oauth');
jest.mock('../auth/api-key');

// Mock Express app
const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  listen: jest.fn((port: number, host: string, callback: Function) => {
    callback();
    return mockServer;
  })
};

const mockServer = {
  on: jest.fn(),
  close: jest.fn((callback: Function) => callback())
};

// Mock Express
jest.mock('express', () => {
  const express: any = jest.fn(() => mockApp);
  express.json = jest.fn(() => jest.fn());
  express.urlencoded = jest.fn(() => jest.fn());
  express.Router = jest.fn(() => ({ 
    get: jest.fn(), 
    post: jest.fn(),
    use: jest.fn(),
    delete: jest.fn()
  }));
  return express;
});

describe('TransportManager with Authentication', () => {
  let server: Server;
  let transportManager: TransportManager;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    server = new Server(
      { name: 'test', vendor: 'test', version: '1.0.0' },
      { capabilities: {} }
    );
    (server.connect as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (server.close as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authentication Configuration', () => {
    it('should default to api-key authentication', () => {
      process.env.TRANSPORT_TYPE = 'http';
      transportManager = new TransportManager(server);
      const config = transportManager.getConfig();
      
      expect(config.authType).toBe('api-key');
    });

    it('should configure oauth authentication', () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'oauth';
      transportManager = new TransportManager(server);
      const config = transportManager.getConfig();
      
      expect(config.authType).toBe('oauth');
    });

    it('should configure both authentication types', () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'both';
      transportManager = new TransportManager(server);
      const config = transportManager.getConfig();
      
      expect(config.authType).toBe('both');
    });

    it('should configure no authentication', () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'none';
      transportManager = new TransportManager(server);
      const config = transportManager.getConfig();
      
      expect(config.authType).toBe('none');
    });
  });

  describe('OAuth Integration', () => {
    beforeEach(() => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'oauth';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';
    });

    it('should initialize OAuth provider', async () => {
      const { OAuth21Provider } = require('../auth/oauth');
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      expect(OAuth21Provider).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'test-client',
        clientSecret: 'test-secret'
      }));
    });

    it('should setup OAuth routes', async () => {
      const { OAuth21Provider } = require('../auth/oauth');
      const mockOAuthProvider = {
        getRoutes: jest.fn().mockReturnValue({ use: jest.fn() }),
        middleware: jest.fn().mockReturnValue(jest.fn())
      };
      OAuth21Provider.mockImplementation(() => mockOAuthProvider);
      
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      expect(mockOAuthProvider.getRoutes).toHaveBeenCalled();
      expect(mockApp.use).toHaveBeenCalledWith('/oauth', expect.any(Object));
    });
  });

  describe('API Key Integration', () => {
    beforeEach(() => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'api-key';
      process.env.THEBRAIN_API_KEY = 'test-api-key';
    });

    it('should initialize API key provider', async () => {
      const { createApiKeyAuth } = require('../auth/api-key');
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      expect(createApiKeyAuth).toHaveBeenCalled();
    });

    it('should setup API key management routes when enabled', async () => {
      process.env.ENABLE_API_KEY_MANAGEMENT = 'true';
      process.env.ADMIN_API_KEY = 'admin-key';
      
      const { createApiKeyAuth } = require('../auth/api-key');
      const mockApiKeyProvider = {
        getManagementRoutes: jest.fn().mockReturnValue({ use: jest.fn() }),
        middleware: jest.fn().mockReturnValue(jest.fn())
      };
      createApiKeyAuth.mockReturnValue(mockApiKeyProvider);
      
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      expect(mockApiKeyProvider.getManagementRoutes).toHaveBeenCalled();
      expect(mockApp.use).toHaveBeenCalledWith('/api-keys', expect.any(Function), expect.any(Object));
    });
  });

  describe('Authentication Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        headers: {},
        path: '/api/v1/resources'
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      mockNext = jest.fn();
    });

    it('should skip auth for health endpoint', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'api-key';
      
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      // Find the auth middleware
      const authMiddlewareCall = (mockApp.use as jest.Mock).mock.calls.find(
        call => call[0] === '/api/v1'
      );
      expect(authMiddlewareCall).toBeDefined();
      
      const authMiddleware = authMiddlewareCall[1];
      
      // Create a new mock request with the path property
      const healthReq = {
        ...mockReq,
        path: '/health'
      };
      
      await authMiddleware(healthReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should require auth for protected endpoints', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'api-key';
      
      // Mock the API key provider to return 401 for missing key
      const mockApiKeyProvider = {
        middleware: jest.fn().mockReturnValue((req: Request, res: Response, next: NextFunction) => {
          if (!req.headers['x-api-key']) {
            return res.status(401).json({ error: 'unauthorized', error_description: 'Missing API key' });
          }
          next();
        })
      };
      
      const { createApiKeyAuth } = require('../auth/api-key');
      createApiKeyAuth.mockReturnValue(mockApiKeyProvider);
      
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      // Find the auth middleware
      const authMiddlewareCall = (mockApp.use as jest.Mock).mock.calls.find(
        call => call[0] === '/api/v1'
      );
      const authMiddleware = authMiddlewareCall[1];
      
      // Test with a regular protected endpoint (not health)
      const protectedReq = {
        ...mockReq,
        path: '/api/v1/resources',
        headers: {} // No auth headers
      };
      
      await authMiddleware(protectedReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should try API key first in both mode', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'both';
      
      const { createApiKeyAuth } = require('../auth/api-key');
      const { OAuth21Provider } = require('../auth/oauth');
      
      const mockApiKeyMiddleware = jest.fn((req: Request, res: Response, next: NextFunction) => next());
      const mockOAuthMiddleware = jest.fn((req: Request, res: Response, next: NextFunction) => next());
      
      const mockApiKeyProvider = {
        middleware: jest.fn().mockReturnValue(mockApiKeyMiddleware)
      };
      const mockOAuthProvider = {
        middleware: jest.fn().mockReturnValue(mockOAuthMiddleware),
        getRoutes: jest.fn().mockReturnValue({ use: jest.fn() })
      };
      
      createApiKeyAuth.mockReturnValue(mockApiKeyProvider);
      OAuth21Provider.mockImplementation(() => mockOAuthProvider);
      
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      // Find the auth middleware
      const authMiddlewareCall = (mockApp.use as jest.Mock).mock.calls.find(
        call => call[0] === '/api/v1'
      );
      const authMiddleware = authMiddlewareCall[1];
      
      mockReq.headers = { 'x-api-key': 'test-key' };
      
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockApiKeyProvider.middleware).toHaveBeenCalled();
      expect(mockApiKeyMiddleware).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should try OAuth if no API key in both mode', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.AUTH_TYPE = 'both';
      
      const { createApiKeyAuth } = require('../auth/api-key');
      const { OAuth21Provider } = require('../auth/oauth');
      
      const mockOAuthMiddleware = jest.fn((req: Request, res: Response, next: NextFunction) => next());
      
      const mockApiKeyProvider = {
        middleware: jest.fn().mockReturnValue(jest.fn())
      };
      const mockOAuthProvider = {
        middleware: jest.fn().mockReturnValue(mockOAuthMiddleware),
        getRoutes: jest.fn().mockReturnValue({ use: jest.fn() })
      };
      
      createApiKeyAuth.mockReturnValue(mockApiKeyProvider);
      OAuth21Provider.mockImplementation(() => mockOAuthProvider);
      
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      // Find the auth middleware
      const authMiddlewareCall = (mockApp.use as jest.Mock).mock.calls.find(
        call => call[0] === '/api/v1'
      );
      const authMiddleware = authMiddlewareCall[1];
      
      mockReq.headers = { authorization: 'Bearer token' };
      
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockOAuthProvider.middleware).toHaveBeenCalled();
      expect(mockOAuthMiddleware).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});