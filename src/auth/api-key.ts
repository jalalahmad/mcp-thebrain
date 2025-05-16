import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';
import { AuthenticationError } from '../utils/error-handler';

// API Key configuration
export interface ApiKeyConfig {
  keys: Map<string, ApiKeyData>;
  headerName?: string;
  hashAlgorithm?: string;
}

// API Key data
export interface ApiKeyData {
  id: string;
  name: string;
  hashedKey: string;
  permissions: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export class ApiKeyAuthProvider {
  private config: ApiKeyConfig;
  private headerName: string;
  private hashAlgorithm: string;

  constructor(config: ApiKeyConfig) {
    this.config = config;
    this.headerName = config.headerName || 'X-API-Key';
    this.hashAlgorithm = config.hashAlgorithm || 'sha256';
  }

  // Generate a new API key
  generateApiKey(name: string, permissions: string[], expiresIn?: number): { key: string; data: ApiKeyData } {
    const id = crypto.randomUUID();
    const key = `tbrain_${crypto.randomBytes(32).toString('base64url')}`;
    const hashedKey = this.hashKey(key);
    
    const data: ApiKeyData = {
      id,
      name,
      hashedKey,
      permissions,
      createdAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
    };
    
    this.config.keys.set(id, data);
    
    return { key, data };
  }

  // Hash an API key
  private hashKey(key: string): string {
    return crypto
      .createHash(this.hashAlgorithm)
      .update(key)
      .digest('hex');
  }

  // Validate an API key
  async validateApiKey(key: string): Promise<ApiKeyData | null> {
    if (!key.startsWith('tbrain_')) {
      return null;
    }
    
    const hashedKey = this.hashKey(key);
    
    // Find the key data by hash
    for (const [id, data] of this.config.keys.entries()) {
      if (data.hashedKey === hashedKey) {
        // Check expiration
        if (data.expiresAt && data.expiresAt < new Date()) {
          logger.warn('Expired API key used:', data.name);
          return null;
        }
        
        // Update last used timestamp
        data.lastUsedAt = new Date();
        
        return data;
      }
    }
    
    return null;
  }

  // Revoke an API key
  revokeApiKey(id: string): boolean {
    return this.config.keys.delete(id);
  }

  // List all API keys (without the actual key values)
  listApiKeys(): ApiKeyData[] {
    return Array.from(this.config.keys.values()).map(data => ({
      ...data,
      hashedKey: '***' // Don't expose the hash
    }));
  }

  // Check if a permission is granted
  hasPermission(keyData: ApiKeyData, permission: string): boolean {
    return keyData.permissions.includes('*') || keyData.permissions.includes(permission);
  }

  // Express middleware for API key authentication
  middleware(requiredPermission?: string): (req: Request, res: Response, next: NextFunction) => void {
    return async (req: Request, res: Response, next: NextFunction) => {
      const apiKey = req.headers[this.headerName.toLowerCase()] as string;
      
      if (!apiKey) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing API key'
        });
      }
      
      try {
        const keyData = await this.validateApiKey(apiKey);
        
        if (!keyData) {
          logger.warn('Invalid API key attempt');
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid API key'
          });
        }
        
        // Check specific permission if required
        if (requiredPermission && !this.hasPermission(keyData, requiredPermission)) {
          logger.warn('Insufficient permissions for API key:', keyData.name, 'required:', requiredPermission);
          return res.status(403).json({
            error: 'forbidden',
            error_description: 'Insufficient permissions'
          });
        }
        
        // Add key data to request
        (req as any).auth = {
          type: 'api-key',
          keyId: keyData.id,
          keyName: keyData.name,
          permissions: keyData.permissions,
          metadata: keyData.metadata
        };
        
        logger.info('API key authenticated:', keyData.name);
        next();
      } catch (error) {
        logger.error('API key middleware error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: 'An internal server error occurred'
        });
      }
    };
  }

  // Routes for API key management (optional)
  getManagementRoutes() {
    const router = require('express').Router();
    
    // Create new API key
    router.post('/keys', async (req: Request, res: Response) => {
      const { name, permissions, expiresIn } = req.body;
      
      if (!name || !permissions || !Array.isArray(permissions)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing or invalid parameters'
        });
      }
      
      try {
        const { key, data } = this.generateApiKey(name, permissions, expiresIn);
        
        res.status(201).json({
          id: data.id,
          key: key, // Only shown once
          name: data.name,
          permissions: data.permissions,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt
        });
      } catch (error) {
        logger.error('API key creation error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: 'Failed to create API key'
        });
      }
    });
    
    // List API keys
    router.get('/keys', (req: Request, res: Response) => {
      const keys = this.listApiKeys();
      res.json({ keys });
    });
    
    // Get specific API key info
    router.get('/keys/:id', (req: Request, res: Response) => {
      const key = this.config.keys.get(req.params.id);
      
      if (!key) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'API key not found'
        });
      }
      
      res.json({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        metadata: key.metadata
      });
    });
    
    // Revoke API key
    router.delete('/keys/:id', (req: Request, res: Response) => {
      const revoked = this.revokeApiKey(req.params.id);
      
      if (!revoked) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'API key not found'
        });
      }
      
      res.status(204).send();
    });
    
    return router;
  }
}

// Factory function to create API key auth from environment
export function createApiKeyAuth(): ApiKeyAuthProvider {
  const keys = new Map<string, ApiKeyData>();
  
  // Load API keys from environment variables
  // Format: API_KEY_1=name:key:permissions
  Object.keys(process.env).forEach(envKey => {
    if (envKey.startsWith('API_KEY_')) {
      const value = process.env[envKey];
      if (value) {
        const [name, key, ...permissions] = value.split(':');
        if (name && key && permissions.length > 0) {
          const id = crypto.randomUUID();
          const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
          
          keys.set(id, {
            id,
            name,
            hashedKey,
            permissions,
            createdAt: new Date()
          });
        }
      }
    }
  });
  
  // Also check for the primary API key from THEBRAIN_API_KEY
  if (process.env.THEBRAIN_API_KEY) {
    const id = 'primary';
    const hashedKey = crypto.createHash('sha256').update(process.env.THEBRAIN_API_KEY).digest('hex');
    
    keys.set(id, {
      id,
      name: 'Primary API Key',
      hashedKey,
      permissions: ['*'], // Full access
      createdAt: new Date()
    });
  }
  
  return new ApiKeyAuthProvider({ keys });
}