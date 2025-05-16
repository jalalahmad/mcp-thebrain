import { ApiKeyAuthProvider, ApiKeyConfig, ApiKeyData, createApiKeyAuth } from '../api-key';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

describe('ApiKeyAuthProvider', () => {
  let provider: ApiKeyAuthProvider;
  let config: ApiKeyConfig;

  beforeEach(() => {
    config = {
      keys: new Map(),
      headerName: 'X-API-Key',
      hashAlgorithm: 'sha256'
    };
    provider = new ApiKeyAuthProvider(config);
  });

  describe('API Key Generation', () => {
    it('should generate valid API key', () => {
      const { key, data } = provider.generateApiKey('Test Key', ['read', 'write']);
      
      expect(key).toMatch(/^tbrain_[A-Za-z0-9_-]+$/);
      expect(data.name).toBe('Test Key');
      expect(data.permissions).toEqual(['read', 'write']);
      expect(data.hashedKey).toBeDefined();
      expect(data.createdAt).toBeInstanceOf(Date);
      expect(data.id).toBeDefined();
    });

    it('should generate API key with expiration', () => {
      const expiresIn = 3600; // 1 hour
      const { key, data } = provider.generateApiKey('Expiring Key', ['read'], expiresIn);
      
      expect(data.expiresAt).toBeDefined();
      expect(data.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(data.expiresAt!.getTime()).toBeLessThan(Date.now() + expiresIn * 1000 + 1000);
    });

    it('should store generated key', () => {
      const { key, data } = provider.generateApiKey('Stored Key', ['read']);
      
      expect(config.keys.has(data.id)).toBe(true);
      expect(config.keys.get(data.id)).toEqual(data);
    });
  });

  describe('API Key Validation', () => {
    it('should validate correct API key', async () => {
      const { key, data } = provider.generateApiKey('Valid Key', ['read']);
      
      const result = await provider.validateApiKey(key);
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe(data.id);
      expect(result?.name).toBe('Valid Key');
      expect(result?.lastUsedAt).toBeDefined();
    });

    it('should reject invalid API key', async () => {
      const result = await provider.validateApiKey('tbrain_invalid_key');
      
      expect(result).toBeNull();
    });

    it('should reject non-tbrain prefixed key', async () => {
      const result = await provider.validateApiKey('invalid_prefix_key');
      
      expect(result).toBeNull();
    });

    it('should reject expired API key', async () => {
      const { key, data } = provider.generateApiKey('Expired Key', ['read'], -3600); // Expired 1 hour ago
      
      const result = await provider.validateApiKey(key);
      
      expect(result).toBeNull();
    });

    it('should update last used timestamp', async () => {
      const { key, data } = provider.generateApiKey('Used Key', ['read']);
      const initialLastUsed = data.lastUsedAt;
      
      // Wait a bit to ensure timestamp differs
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await provider.validateApiKey(key);
      
      expect(result?.lastUsedAt).toBeDefined();
      expect(result?.lastUsedAt?.getTime()).toBeGreaterThan(initialLastUsed?.getTime() || 0);
    });
  });

  describe('API Key Revocation', () => {
    it('should revoke API key', () => {
      const { key, data } = provider.generateApiKey('To Revoke', ['read']);
      
      const revoked = provider.revokeApiKey(data.id);
      
      expect(revoked).toBe(true);
      expect(config.keys.has(data.id)).toBe(false);
    });

    it('should return false for non-existent key', () => {
      const revoked = provider.revokeApiKey('non-existent-id');
      
      expect(revoked).toBe(false);
    });
  });

  describe('Permission Checking', () => {
    it('should grant permission if key has it', () => {
      const data: ApiKeyData = {
        id: 'test-id',
        name: 'Test Key',
        hashedKey: 'hashed',
        permissions: ['read', 'write'],
        createdAt: new Date()
      };
      
      expect(provider.hasPermission(data, 'read')).toBe(true);
      expect(provider.hasPermission(data, 'write')).toBe(true);
    });

    it('should deny permission if key lacks it', () => {
      const data: ApiKeyData = {
        id: 'test-id',
        name: 'Test Key',
        hashedKey: 'hashed',
        permissions: ['read'],
        createdAt: new Date()
      };
      
      expect(provider.hasPermission(data, 'write')).toBe(false);
    });

    it('should grant all permissions with wildcard', () => {
      const data: ApiKeyData = {
        id: 'test-id',
        name: 'Admin Key',
        hashedKey: 'hashed',
        permissions: ['*'],
        createdAt: new Date()
      };
      
      expect(provider.hasPermission(data, 'read')).toBe(true);
      expect(provider.hasPermission(data, 'write')).toBe(true);
      expect(provider.hasPermission(data, 'delete')).toBe(true);
    });
  });

  describe('Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let middleware: (req: Request, res: Response, next: NextFunction) => void;

    beforeEach(() => {
      mockReq = {
        headers: {}
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      mockNext = jest.fn();
    });

    it('should reject request without API key', async () => {
      middleware = provider.middleware();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description: 'Missing API key'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept valid API key', async () => {
      const { key, data } = provider.generateApiKey('Valid Key', ['read']);
      mockReq.headers = { 'x-api-key': key };
      
      middleware = provider.middleware();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).auth).toEqual({
        type: 'api-key',
        keyId: data.id,
        keyName: 'Valid Key',
        permissions: ['read'],
        metadata: undefined
      });
    });

    it('should check required permission', async () => {
      const { key, data } = provider.generateApiKey('Limited Key', ['read']);
      mockReq.headers = { 'x-api-key': key };
      
      middleware = provider.middleware('write');
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'forbidden',
        error_description: 'Insufficient permissions'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow request with required permission', async () => {
      const { key, data } = provider.generateApiKey('Full Key', ['read', 'write']);
      mockReq.headers = { 'x-api-key': key };
      
      middleware = provider.middleware('write');
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('List API Keys', () => {
    it('should list all keys without exposing hashes', () => {
      provider.generateApiKey('Key 1', ['read']);
      provider.generateApiKey('Key 2', ['write']);
      
      const keys = provider.listApiKeys();
      
      expect(keys).toHaveLength(2);
      expect(keys[0].hashedKey).toBe('***');
      expect(keys[1].hashedKey).toBe('***');
      expect(keys.some(k => k.name === 'Key 1')).toBe(true);
      expect(keys.some(k => k.name === 'Key 2')).toBe(true);
    });
  });

  describe('createApiKeyAuth Factory', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create provider from environment variables', () => {
      process.env.API_KEY_1 = 'Test Key:test_key_value:read:write';
      process.env.API_KEY_2 = 'Admin Key:admin_key_value:*';
      process.env.THEBRAIN_API_KEY = 'primary_key_value';
      
      const provider = createApiKeyAuth();
      
      // Test primary key
      const primaryResult = provider.validateApiKey('primary_key_value');
      expect(primaryResult).toBeTruthy();
      
      // Test that keys are properly hashed and stored
      const keys = provider.listApiKeys();
      expect(keys.some(k => k.name === 'Test Key')).toBe(true);
      expect(keys.some(k => k.name === 'Admin Key')).toBe(true);
      expect(keys.some(k => k.name === 'Primary API Key')).toBe(true);
    });
  });
});