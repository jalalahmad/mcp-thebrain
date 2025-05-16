import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';

// Rate limiting configuration
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

// CSRF protection configuration
export interface CSRFConfig {
  cookieName?: string;
  headerName?: string;
  tokenLength?: number;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

// Rate limiter class
export class RateLimiter {
  private config: RateLimitConfig;
  private requests: Map<string, { count: number; resetTime: number }>;

  constructor(config: RateLimitConfig) {
    const defaults = {
      windowMs: 60000, // 1 minute default
      maxRequests: 100,
      skipSuccessfulRequests: false,
      message: 'Too many requests, please try again later'
    };
    this.config = { ...defaults, ...config };
    this.requests = new Map();
  }

  private getKey(req: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }
    // Default to IP-based rate limiting
    return req.ip || 'unknown';
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, data] of this.requests.entries()) {
      if (data.resetTime < now) {
        this.requests.delete(key);
      }
    }
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();
      
      // Clean up expired entries periodically
      if (Math.random() < 0.1) {
        this.cleanupExpired();
      }

      let requestData = this.requests.get(key);
      
      if (!requestData || requestData.resetTime < now) {
        requestData = {
          count: 0,
          resetTime: now + this.config.windowMs
        };
        this.requests.set(key, requestData);
      }

      requestData.count++;

      if (requestData.count > this.config.maxRequests) {
        const retryAfter = Math.ceil((requestData.resetTime - now) / 1000);
        
        res.setHeader('Retry-After', retryAfter.toString());
        res.setHeader('X-RateLimit-Limit', this.config.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(requestData.resetTime).toISOString());
        
        logger.warn('Rate limit exceeded for:', key);
        
        return res.status(429).json({
          error: 'rate_limit_exceeded',
          error_description: this.config.message,
          retry_after: retryAfter
        });
      }

      const remaining = this.config.maxRequests - requestData.count;
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', new Date(requestData.resetTime).toISOString());

      // If skipSuccessfulRequests is enabled, decrement count on successful completion
      if (this.config.skipSuccessfulRequests) {
        const originalEnd = res.end;
        res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void): Response {
          if (res.statusCode < 400) {
            requestData!.count--;
          }
          if (typeof encoding === 'function') {
            cb = encoding;
            encoding = undefined;
          }
          return originalEnd.call(res, chunk, encoding as BufferEncoding, cb) as Response;
        };
      }

      next();
    };
  }
}

// CSRF protection class
export class CSRFProtection {
  private config: CSRFConfig;
  private tokens: Map<string, { token: string; createdAt: Date }>;

  constructor(config: CSRFConfig = {}) {
    this.config = {
      cookieName: 'csrf-token',
      headerName: 'X-CSRF-Token',
      tokenLength: 32,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      ...config
    };
    this.tokens = new Map();
  }

  generateToken(): string {
    return crypto.randomBytes(this.config.tokenLength!).toString('base64url');
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [sessionId, data] of this.tokens.entries()) {
      if (now - data.createdAt.getTime() > maxAge) {
        this.tokens.delete(sessionId);
      }
    }
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip CSRF for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      // Skip CSRF for API key authenticated requests
      if ((req as any).auth?.type === 'api-key') {
        return next();
      }

      // Clean up expired tokens periodically
      if (Math.random() < 0.1) {
        this.cleanupExpiredTokens();
      }

      const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string;
      
      if (!sessionId) {
        return res.status(403).json({
          error: 'csrf_error',
          error_description: 'Missing session identifier'
        });
      }

      const tokenData = this.tokens.get(sessionId);
      const headerToken = req.headers[this.config.headerName!.toLowerCase()] as string;
      const cookieToken = req.cookies?.[this.config.cookieName!];

      if (!tokenData || !headerToken || headerToken !== tokenData.token) {
        logger.warn('CSRF token validation failed');
        return res.status(403).json({
          error: 'csrf_error',
          error_description: 'Invalid CSRF token'
        });
      }

      next();
    };
  }

  // Middleware to generate and set CSRF token
  generateTokenMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip for API key authenticated requests
      if ((req as any).auth?.type === 'api-key') {
        return next();
      }

      let sessionId = req.cookies?.sessionId || req.headers['x-session-id'] as string;
      
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        res.cookie('sessionId', sessionId, {
          httpOnly: true,
          secure: this.config.secure,
          sameSite: this.config.sameSite
        });
      }

      let tokenData = this.tokens.get(sessionId);
      
      if (!tokenData) {
        const token = this.generateToken();
        tokenData = { token, createdAt: new Date() };
        this.tokens.set(sessionId, tokenData);
      }

      // Set CSRF token in cookie and expose in response header for client access
      res.cookie(this.config.cookieName!, tokenData.token, {
        httpOnly: false, // Client needs to read this
        secure: this.config.secure,
        sameSite: this.config.sameSite
      });
      
      res.setHeader('X-CSRF-Token', tokenData.token);
      
      next();
    };
  }
}

// Security headers middleware
export function securityHeaders(): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent content type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy (formerly Feature Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Remove powered by header
    res.removeHeader('X-Powered-By');
    
    next();
  };
}

// Combined security middleware factory
export interface SecurityConfig {
  rateLimit?: RateLimitConfig;
  csrf?: CSRFConfig | false;
  headers?: boolean;
}

export function createSecurityMiddleware(config: SecurityConfig = {}): {
  rateLimiter?: RateLimiter;
  csrfProtection?: CSRFProtection;
  middleware: (req: Request, res: Response, next: NextFunction) => void;
} {
  const middlewares: ((req: Request, res: Response, next: NextFunction) => void)[] = [];
  
  let rateLimiter: RateLimiter | undefined;
  let csrfProtection: CSRFProtection | undefined;
  
  // Add rate limiting
  if (config.rateLimit) {
    rateLimiter = new RateLimiter(config.rateLimit);
    middlewares.push(rateLimiter.middleware());
  }
  
  // Add CSRF protection
  if (config.csrf !== false) {
    csrfProtection = new CSRFProtection(config.csrf);
    middlewares.push(csrfProtection.generateTokenMiddleware());
    middlewares.push(csrfProtection.middleware());
  }
  
  // Add security headers
  if (config.headers !== false) {
    middlewares.push(securityHeaders());
  }
  
  // Combine all middlewares
  const combinedMiddleware = (req: Request, res: Response, next: NextFunction) => {
    let index = 0;
    
    const runNext = (err?: any): void => {
      if (err) {
        return next(err);
      }
      
      if (index >= middlewares.length) {
        return next();
      }
      
      const middleware = middlewares[index++];
      middleware(req, res, runNext);
    };
    
    runNext();
  };
  
  return {
    rateLimiter,
    csrfProtection,
    middleware: combinedMiddleware
  };
}