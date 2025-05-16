import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';
import { AuthenticationError } from '../utils/error-handler';

// OAuth 2.1 configuration
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scope?: string;
  allowedClients?: Set<string>;
}

// Token storage interface
export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
  clientId: string;
}

// PKCE parameters
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  challengeMethod: 'S256';
}

// Authorization request
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  challengeMethod: string;
  scope?: string;
}

export class OAuth21Provider {
  private config: OAuthConfig;
  private authorizationRequests: Map<string, AuthorizationRequest>;
  private tokens: Map<string, TokenData>;
  private allowedClients: Set<string>;

  constructor(config: OAuthConfig) {
    this.config = config;
    this.authorizationRequests = new Map();
    this.tokens = new Map();
    this.allowedClients = config.allowedClients || new Set([config.clientId]);
  }

  // Generate PKCE code verifier and challenge
  generatePKCE(): PKCEParams {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return {
      codeVerifier,
      codeChallenge,
      challengeMethod: 'S256'
    };
  }

  // Validate PKCE code verifier against challenge
  validatePKCE(codeVerifier: string, codeChallenge: string): boolean {
    const computedChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return computedChallenge === codeChallenge;
  }

  // Generate authorization URL
  getAuthorizationUrl(params: {
    state: string;
    codeChallenge: string;
    challengeMethod: string;
    scope?: string;
  }): string {
    const url = new URL(this.config.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', params.challengeMethod);
    
    const scope = params.scope || this.config.scope;
    if (scope) {
      url.searchParams.set('scope', scope);
    }
    
    return url.toString();
  }

  // Handle authorization callback
  async handleCallback(code: string, state: string, codeVerifier: string): Promise<TokenData> {
    const authRequest = this.authorizationRequests.get(state);
    
    if (!authRequest) {
      throw new AuthenticationError('Invalid state parameter');
    }
    
    // Validate PKCE
    if (!this.validatePKCE(codeVerifier, authRequest.codeChallenge)) {
      throw new AuthenticationError('Invalid PKCE code verifier');
    }
    
    // Exchange code for token
    const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier);
    
    // Store token
    const tokenData: TokenData = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      scope: tokenResponse.scope || authRequest.scope || this.config.scope || '',
      clientId: authRequest.clientId
    };
    
    this.tokens.set(tokenData.accessToken, tokenData);
    
    // Clean up authorization request
    this.authorizationRequests.delete(state);
    
    return tokenData;
  }

  // Exchange authorization code for token
  private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier
    });
    
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
        },
        body: params.toString()
      });
      
      if (!response.ok) {
        let errorMessage = 'Token exchange failed';
        try {
          const error: any = await response.json();
          errorMessage = `Token exchange failed: ${error.error_description || error.error}`;
        } catch {
          // If JSON parsing fails, use default error message
        }
        throw new AuthenticationError(errorMessage);
      }
      
      return await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope?: string;
      };
    } catch (error) {
      logger.error('Token exchange error:', error);
      throw new AuthenticationError('Failed to exchange code for token');
    }
  }

  // Validate access token
  async validateToken(token: string): Promise<TokenData | null> {
    const tokenData = this.tokens.get(token);
    
    if (!tokenData) {
      return null;
    }
    
    // Check expiration
    if (tokenData.expiresAt < new Date()) {
      this.tokens.delete(token);
      return null;
    }
    
    // Validate client
    if (!this.allowedClients.has(tokenData.clientId)) {
      logger.warn('Token from unauthorized client:', tokenData.clientId);
      return null;
    }
    
    return tokenData;
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<TokenData | null> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId
      });
      
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
        },
        body: params.toString()
      });
      
      if (!response.ok) {
        return null;
      }
      
      const tokenResponse = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope?: string;
      };
      
      const tokenData: TokenData = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        scope: tokenResponse.scope || this.config.scope || '',
        clientId: this.config.clientId
      };
      
      this.tokens.set(tokenData.accessToken, tokenData);
      
      return tokenData;
    } catch (error) {
      logger.error('Token refresh error:', error);
      return null;
    }
  }

  // Revoke token
  async revokeToken(token: string): Promise<void> {
    this.tokens.delete(token);
    
    // Call revocation endpoint if available
    if (this.config.tokenEndpoint.includes('/token')) {
      const revocationEndpoint = this.config.tokenEndpoint.replace('/token', '/revoke');
      
      try {
        await fetch(revocationEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
          },
          body: new URLSearchParams({
            token,
            token_type_hint: 'access_token'
          }).toString()
        });
      } catch (error) {
        logger.error('Token revocation error:', error);
      }
    }
  }

  // Express middleware for OAuth authentication
  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return async (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing or invalid authorization header'
        });
      }
      
      const token = authHeader.substring(7);
      
      try {
        const tokenData = await this.validateToken(token);
        
        if (!tokenData) {
          return res.status(401).json({
            error: 'invalid_token',
            error_description: 'The access token is invalid or expired'
          });
        }
        
        // Add token data to request
        (req as any).auth = {
          type: 'oauth',
          clientId: tokenData.clientId,
          scope: tokenData.scope,
          expiresAt: tokenData.expiresAt
        };
        
        next();
      } catch (error) {
        logger.error('OAuth middleware error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: 'An internal server error occurred'
        });
      }
    };
  }

  // Routes for OAuth flow
  getRoutes() {
    const router = require('express').Router();
    
    // Authorization endpoint
    router.get('/authorize', (req: Request, res: Response) => {
      const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;
      
      // Validate parameters
      if (!client_id || !redirect_uri || !state || !code_challenge || !code_challenge_method) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters'
        });
      }
      
      if (code_challenge_method !== 'S256') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Only S256 code challenge method is supported'
        });
      }
      
      if (!this.allowedClients.has(client_id as string)) {
        return res.status(400).json({
          error: 'unauthorized_client',
          error_description: 'Client is not authorized'
        });
      }
      
      // Store authorization request
      const authRequest: AuthorizationRequest = {
        clientId: client_id as string,
        redirectUri: redirect_uri as string,
        state: state as string,
        codeChallenge: code_challenge as string,
        challengeMethod: code_challenge_method as string,
        scope: scope as string
      };
      
      this.authorizationRequests.set(state as string, authRequest);
      
      // In a real implementation, this would redirect to a login page
      // For now, we'll just generate a code
      const code = crypto.randomBytes(32).toString('base64url');
      
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.set('code', code);
      redirectUrl.searchParams.set('state', state as string);
      
      res.redirect(redirectUrl.toString());
    });
    
    // Token endpoint
    router.post('/token', async (req: Request, res: Response) => {
      const { grant_type, code, code_verifier, refresh_token } = req.body;
      
      try {
        if (grant_type === 'authorization_code') {
          if (!code || !code_verifier) {
            return res.status(400).json({
              error: 'invalid_request',
              error_description: 'Missing code or code_verifier'
            });
          }
          
          // Find the authorization request by code
          const authRequest = Array.from(this.authorizationRequests.values()).find(
            req => req.state === code // In a real implementation, we'd have a proper code-to-state mapping
          );
          
          if (!authRequest) {
            return res.status(400).json({
              error: 'invalid_grant',
              error_description: 'Invalid authorization code'
            });
          }
          
          const tokenData = await this.handleCallback(code, authRequest.state, code_verifier);
          
          res.json({
            access_token: tokenData.accessToken,
            token_type: 'Bearer',
            expires_in: Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000),
            scope: tokenData.scope,
            refresh_token: tokenData.refreshToken
          });
        } else if (grant_type === 'refresh_token') {
          if (!refresh_token) {
            return res.status(400).json({
              error: 'invalid_request',
              error_description: 'Missing refresh_token'
            });
          }
          
          const tokenData = await this.refreshToken(refresh_token);
          
          if (!tokenData) {
            return res.status(400).json({
              error: 'invalid_grant',
              error_description: 'Invalid refresh token'
            });
          }
          
          res.json({
            access_token: tokenData.accessToken,
            token_type: 'Bearer',
            expires_in: Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000),
            scope: tokenData.scope,
            refresh_token: tokenData.refreshToken
          });
        } else {
          return res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: 'Grant type not supported'
          });
        }
      } catch (error) {
        logger.error('Token endpoint error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: 'An internal server error occurred'
        });
      }
    });
    
    // Revocation endpoint
    router.post('/revoke', async (req: Request, res: Response) => {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing token parameter'
        });
      }
      
      await this.revokeToken(token);
      res.status(200).send();
    });
    
    return router;
  }
}