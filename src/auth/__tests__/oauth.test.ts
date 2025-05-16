import { OAuth21Provider, OAuthConfig, PKCEParams } from '../oauth';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Mock fetch
global.fetch = jest.fn();

describe('OAuth21Provider', () => {
  let provider: OAuth21Provider;
  let config: OAuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:3000/callback',
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      scope: 'read write',
      allowedClients: new Set(['test-client', 'allowed-client'])
    };
    provider = new OAuth21Provider(config);
  });

  describe('PKCE Generation and Validation', () => {
    it('should generate valid PKCE parameters', () => {
      const pkce = provider.generatePKCE();
      
      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.challengeMethod).toBe('S256');
      
      // Verify the challenge is base64url encoded
      expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should validate correct PKCE code verifier', () => {
      const pkce = provider.generatePKCE();
      const isValid = provider.validatePKCE(pkce.codeVerifier, pkce.codeChallenge);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect PKCE code verifier', () => {
      const pkce = provider.generatePKCE();
      const wrongVerifier = 'wrong-verifier';
      const isValid = provider.validatePKCE(wrongVerifier, pkce.codeChallenge);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Authorization URL', () => {
    it('should generate correct authorization URL', () => {
      const params = {
        state: 'test-state',
        codeChallenge: 'test-challenge',
        challengeMethod: 'S256' as const,
        scope: 'custom-scope'
      };
      
      const url = provider.getAuthorizationUrl(params);
      const parsed = new URL(url);
      
      expect(parsed.origin).toBe('https://auth.example.com');
      expect(parsed.pathname).toBe('/authorize');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('client_id')).toBe('test-client');
      expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:3000/callback');
      expect(parsed.searchParams.get('state')).toBe('test-state');
      expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge');
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsed.searchParams.get('scope')).toBe('custom-scope');
    });

    it('should use default scope if not provided', () => {
      const params = {
        state: 'test-state',
        codeChallenge: 'test-challenge',
        challengeMethod: 'S256' as const
      };
      
      const url = provider.getAuthorizationUrl(params);
      const parsed = new URL(url);
      
      expect(parsed.searchParams.get('scope')).toBe('read write');
    });
  });

  describe('Token Validation', () => {
    it('should validate valid token', async () => {
      const tokenData = {
        accessToken: 'valid-token',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        scope: 'read',
        clientId: 'test-client'
      };
      
      // Store the token
      await provider.validateToken(tokenData.accessToken); // This returns null initially
      // We need to store it first through handleCallback or similar
      
      // Mock the internal token storage
      const validateMethod = provider.validateToken.bind(provider);
      (provider as any).tokens.set(tokenData.accessToken, tokenData);
      
      const result = await validateMethod(tokenData.accessToken);
      expect(result).toEqual(tokenData);
    });

    it('should reject expired token', async () => {
      const tokenData = {
        accessToken: 'expired-token',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        scope: 'read',
        clientId: 'test-client'
      };
      
      // Mock the internal token storage
      (provider as any).tokens.set(tokenData.accessToken, tokenData);
      
      const result = await provider.validateToken(tokenData.accessToken);
      expect(result).toBeNull();
    });

    it('should reject token from unauthorized client', async () => {
      const tokenData = {
        accessToken: 'unauthorized-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'read',
        clientId: 'unauthorized-client'
      };
      
      // Mock the internal token storage
      (provider as any).tokens.set(tokenData.accessToken, tokenData);
      
      const result = await provider.validateToken(tokenData.accessToken);
      expect(result).toBeNull();
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
      middleware = provider.middleware();
    });

    it('should reject request without authorization header', async () => {
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description: 'Missing or invalid authorization header'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid bearer token', async () => {
      mockReq.headers = { authorization: 'Invalid token' };
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description: 'Missing or invalid authorization header'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept valid token', async () => {
      const tokenData = {
        accessToken: 'valid-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'read',
        clientId: 'test-client'
      };
      
      // Mock the internal token storage
      (provider as any).tokens.set(tokenData.accessToken, tokenData);
      
      mockReq.headers = { authorization: 'Bearer valid-token' };
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).auth).toEqual({
        type: 'oauth',
        clientId: 'test-client',
        scope: 'read',
        expiresAt: tokenData.expiresAt
      });
    });
  });

  describe('Authorization Routes', () => {
    it('should handle authorization request', () => {
      const router = provider.getRoutes();
      const handlers = (router as any).stack.filter((layer: any) => layer.route?.path === '/authorize');
      
      expect(handlers).toHaveLength(1);
      
      const handler = handlers[0].route.stack[0].handle;
      const mockReq = {
        query: {
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
          state: 'test-state',
          code_challenge: 'test-challenge',
          code_challenge_method: 'S256',
          scope: 'read'
        }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        redirect: jest.fn()
      };
      
      handler(mockReq, mockRes);
      
      expect(mockRes.redirect).toHaveBeenCalled();
      const redirectUrl = mockRes.redirect.mock.calls[0][0];
      const parsed = new URL(redirectUrl);
      
      expect(parsed.searchParams.get('code')).toBeDefined();
      expect(parsed.searchParams.get('state')).toBe('test-state');
    });
  });

  describe('Token Exchange', () => {
    it('should exchange code for token', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        scope: 'read write'
      };
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      });
      
      // Generate proper PKCE parameters
      const pkce = provider.generatePKCE();
      
      // Set up authorization request with correct PKCE challenge
      const authRequest = {
        clientId: 'test-client',
        redirectUri: 'http://localhost:3000/callback',
        state: 'test-state',
        codeChallenge: pkce.codeChallenge,
        challengeMethod: 'S256' as const,
        scope: 'read'
      };
      
      (provider as any).authorizationRequests.set('test-state', authRequest);
      
      // Test token exchange with correct code verifier
      await provider.handleCallback('test-code', 'test-state', pkce.codeVerifier);
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });
  });
});