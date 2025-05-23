import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { TransportManager, TransportType } from '../transport';
import * as http from 'http';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../utils/logger');

// Create a custom mock for express
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

// Create mocks for express middleware
const mockJson = jest.fn(() => jest.fn());
const mockUrlencoded = jest.fn(() => jest.fn());

// Replace express import with mock
jest.mock('express', () => {
  const express: any = jest.fn(() => mockApp);
  express.json = jest.fn(() => jest.fn()); // Return middleware function
  express.urlencoded = jest.fn(() => jest.fn()); // Return middleware function
  return express;
});

describe('TransportManager', () => {
  let server: Server;
  let transportManager: TransportManager;
  const originalEnv = process.env;
  const express = require('express');

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

  describe('Configuration', () => {
    it('should load default configuration', () => {
      // Clear environment variable to test true defaults
      delete process.env.TRANSPORT_TYPE;
      
      transportManager = new TransportManager(server);
      const config = transportManager.getConfig();
      
      expect(config.type).toBe(TransportType.STDIO);
      expect(config.httpPort).toBe(3000);
      expect(config.httpHost).toBe('0.0.0.0');
      expect(config.basePath).toBe('/api/v1');
    });

    it('should load configuration from environment variables', () => {
      process.env.TRANSPORT_TYPE = 'http';
      process.env.HTTP_PORT = '8080';
      process.env.HTTP_HOST = 'localhost';
      process.env.BASE_PATH = '/api/v2';
      
      transportManager = new TransportManager(server);
      const config = transportManager.getConfig();
      
      expect(config.type).toBe(TransportType.HTTP);
      expect(config.httpPort).toBe(8080);
      expect(config.httpHost).toBe('localhost');
      expect(config.basePath).toBe('/api/v2');
    });

    it('should throw error for invalid transport type', () => {
      process.env.TRANSPORT_TYPE = 'invalid';
      
      expect(() => new TransportManager(server)).toThrow('Invalid transport type: invalid');
    });
  });

  describe('Stdio Transport', () => {
    beforeEach(() => {
      // Set to stdio for these tests
      delete process.env.TRANSPORT_TYPE;
      transportManager = new TransportManager(server);
    });

    it('should start stdio transport', async () => {
      await transportManager.start();
      
      expect(server.connect).toHaveBeenCalled();
    });

    it('should identify as non-HTTP transport', () => {
      expect(transportManager.isHttpTransport()).toBe(false);
    });
  });

  describe('HTTP Transport', () => {
    beforeEach(() => {
      process.env.TRANSPORT_TYPE = 'http';
      transportManager = new TransportManager(server);
    });

    it('should start HTTP transport', async () => {
      await transportManager.start();
      
      expect(express).toHaveBeenCalled();
      expect(express.json).toHaveBeenCalledWith({ limit: '10mb' });
      expect(express.urlencoded).toHaveBeenCalledWith({ extended: true });
      expect(mockApp.use).toHaveBeenCalled();
      expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));
      expect(mockApp.listen).toHaveBeenCalledWith(3000, '0.0.0.0', expect.any(Function));
    });

    it('should setup MCP endpoints', async () => {
      await transportManager.start();
      
      expect(mockApp.get).toHaveBeenCalledWith('/api/v1/resources', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/api/v1/tools', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/api/v1/prompts', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/api/v1/tools/:toolName', expect.any(Function));
      expect(mockApp.post).toHaveBeenCalledWith('/api/v1/prompts/:promptName', expect.any(Function));
    });

    it('should identify as HTTP transport', () => {
      expect(transportManager.isHttpTransport()).toBe(true);
    });

    it('should return Express app', async () => {
      await transportManager.start();
      expect(transportManager.getExpressApp()).toBe(mockApp);
    });

    it('should return HTTP server', async () => {
      await transportManager.start();
      expect(transportManager.getHttpServer()).toBe(mockServer);
    });

    it('should handle health check endpoint', async () => {
      await transportManager.start();
      
      // Find the health check handler
      const healthCall = (mockApp.get as jest.Mock).mock.calls.find(
        call => call[0] === '/health'
      );
      expect(healthCall).toBeDefined();
      
      // Test the handler
      const mockReq = {};
      const mockRes = { json: jest.fn() };
      const handler = healthCall[1];
      
      handler(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          transport: 'http'
        })
      );
    });

    it('should handle server errors', async () => {
      // Mock the listen method to not call the callback immediately
      mockApp.listen.mockImplementationOnce((port: number, host: string, callback: Function) => {
        const errorMockServer = {
          on: jest.fn(),
          close: jest.fn()
        };
        
        // Don't call the callback - this simulates the promise being pending
        
        // Return the mock server
        return errorMockServer;
      });

      // Start the server (it will not resolve)
      const startPromise = transportManager.start();

      // Get the mock server instance
      const listenCall = mockApp.listen.mock.calls[0];
      const mockHttpServer = mockApp.listen.mock.results[0].value;

      // Now trigger the error handler after the promise is set up
      const onErrorCall = mockHttpServer.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      );
      expect(onErrorCall).toBeDefined();
      
      const errorHandler = onErrorCall[1];
      errorHandler(new Error('Port in use'));

      await expect(startPromise).rejects.toThrow('Port in use');
    });
  });

  describe('Shutdown', () => {
    it('should stop stdio transport', async () => {
      delete process.env.TRANSPORT_TYPE;
      transportManager = new TransportManager(server);
      await transportManager.start();
      await transportManager.stop();
      
      expect(server.close).toHaveBeenCalled();
    });

    it('should stop HTTP transport', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      transportManager = new TransportManager(server);
      await transportManager.start();
      await transportManager.stop();
      
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should handle HTTP server close errors', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      mockServer.close.mockImplementationOnce((callback: Function) => {
        callback(new Error('Close error'));
      });
      
      await expect(transportManager.stop()).rejects.toThrow('Close error');
    });
  });

  describe('Error Handling', () => {
    it('should setup error middleware for HTTP', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      // Verify error middleware was setup
      const errorMiddlewareCalls = (mockApp.use as jest.Mock).mock.calls.filter(
        call => call[0] && call[0].length === 4 // Error middleware has 4 parameters
      );
      
      expect(errorMiddlewareCalls.length).toBeGreaterThan(0);
    });

    it('should setup 404 handler for HTTP', async () => {
      process.env.TRANSPORT_TYPE = 'http';
      transportManager = new TransportManager(server);
      await transportManager.start();
      
      // Verify 404 handler was setup
      const notFoundHandlerCalls = (mockApp.use as jest.Mock).mock.calls.filter(
        call => call[0] && call[0].length === 2 // Regular middleware has 2 parameters
      );
      
      expect(notFoundHandlerCalls.length).toBeGreaterThan(0);
    });
  });
});