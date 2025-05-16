import { Request, Response, NextFunction } from 'express';
import { RateLimiter, CSRFProtection, securityHeaders, createSecurityMiddleware } from '../security';

// Mock Express objects
const mockRequest = (overrides: any = {}): Partial<Request> => ({
  ip: '192.168.1.1',
  method: 'GET',
  headers: {},
  cookies: {},
  ...overrides
});

const mockResponse = (): Partial<Response> => {
  const res: any = {
    statusCode: 200,
    headers: new Map(),
    setHeader: jest.fn((name: string, value: string) => {
      res.headers.set(name, value);
    }),
    removeHeader: jest.fn((name: string) => {
      res.headers.delete(name);
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn(),
    cookie: jest.fn(),
    end: jest.fn()
  };
  return res;
};

const mockNext: NextFunction = jest.fn();

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow requests within limit', () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 10
    });
    
    const middleware = limiter.middleware();
    const req = mockRequest();
    const res = mockResponse();
    
    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      middleware(req as Request, res as Response, mockNext);
    }
    
    expect(mockNext).toHaveBeenCalledTimes(5);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block requests exceeding limit', () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 3
    });
    
    const middleware = limiter.middleware();
    const req = mockRequest();
    const res = mockResponse();
    
    // Make 4 requests
    for (let i = 0; i < 4; i++) {
      middleware(req as Request, res as Response, mockNext);
    }
    
    expect(mockNext).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'rate_limit_exceeded',
      error_description: 'Too many requests, please try again later',
      retry_after: expect.any(Number)
    });
  });

  it('should set rate limit headers', () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 10
    });
    
    const middleware = limiter.middleware();
    const req = mockRequest();
    const res = mockResponse();
    
    middleware(req as Request, res as Response, mockNext);
    
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('should use custom key generator', () => {
    const limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 1,
      keyGenerator: (req) => req.headers['x-api-key'] as string || 'anonymous'
    });
    
    const middleware = limiter.middleware();
    
    // Two requests with different API keys
    const req1 = mockRequest({ headers: { 'x-api-key': 'key1' } });
    const res1 = mockResponse();
    middleware(req1 as Request, res1 as Response, mockNext);
    
    const req2 = mockRequest({ headers: { 'x-api-key': 'key2' } });
    const res2 = mockResponse();
    middleware(req2 as Request, res2 as Response, mockNext);
    
    expect(mockNext).toHaveBeenCalledTimes(2);
    expect(res1.status).not.toHaveBeenCalled();
    expect(res2.status).not.toHaveBeenCalled();
  });
});

describe('CSRFProtection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip CSRF for safe methods', () => {
    const csrf = new CSRFProtection();
    const middleware = csrf.middleware();
    
    const req = mockRequest({ method: 'GET' });
    const res = mockResponse();
    
    middleware(req as Request, res as Response, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should skip CSRF for API key authenticated requests', () => {
    const csrf = new CSRFProtection();
    const middleware = csrf.middleware();
    
    const req = mockRequest({
      method: 'POST',
      auth: { type: 'api-key' }
    });
    const res = mockResponse();
    
    middleware(req as Request, res as Response, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should generate and validate CSRF tokens', () => {
    const csrf = new CSRFProtection();
    const generateMiddleware = csrf.generateTokenMiddleware();
    const validateMiddleware = csrf.middleware();
    
    // First request - generate token
    const req1 = mockRequest({ method: 'GET' });
    const res1 = mockResponse();
    
    generateMiddleware(req1 as Request, res1 as Response, mockNext);
    
    expect(res1.cookie).toHaveBeenCalledWith('sessionId', expect.any(String), expect.any(Object));
    expect(res1.cookie).toHaveBeenCalledWith('csrf-token', expect.any(String), expect.any(Object));
    expect(res1.setHeader).toHaveBeenCalledWith('X-CSRF-Token', expect.any(String));
    
    // Extract token from response
    const sessionId = (res1.cookie as jest.Mock).mock.calls[0][1];
    const csrfToken = (res1.cookie as jest.Mock).mock.calls[1][1];
    
    // Second request - validate token
    const req2 = mockRequest({
      method: 'POST',
      cookies: { sessionId },
      headers: { 'x-csrf-token': csrfToken }
    });
    const res2 = mockResponse();
    
    validateMiddleware(req2 as Request, res2 as Response, mockNext);
    
    expect(mockNext).toHaveBeenCalledTimes(2);
    expect(res2.status).not.toHaveBeenCalled();
  });

  it('should reject invalid CSRF tokens', () => {
    const csrf = new CSRFProtection();
    const validateMiddleware = csrf.middleware();
    
    const req = mockRequest({
      method: 'POST',
      cookies: { sessionId: 'test-session' },
      headers: { 'x-csrf-token': 'invalid-token' }
    });
    const res = mockResponse();
    
    validateMiddleware(req as Request, res as Response, mockNext);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'csrf_error',
      error_description: 'Invalid CSRF token'
    });
  });
});

describe('Security Headers', () => {
  it('should set security headers', () => {
    const middleware = securityHeaders();
    
    const req = mockRequest();
    const res = mockResponse();
    
    middleware(req as Request, res as Response, mockNext);
    
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'self'");
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(res.setHeader).toHaveBeenCalledWith('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('Combined Security Middleware', () => {
  it('should combine all security features', () => {
    const { middleware } = createSecurityMiddleware({
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      csrf: { cookieName: 'test-csrf' },
      headers: true
    });
    
    const req = mockRequest({ method: 'GET' });
    const res = mockResponse();
    
    middleware(req as Request, res as Response, mockNext);
    
    // Should have run through all middlewares
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(res.cookie).toHaveBeenCalledWith('sessionId', expect.any(String), expect.any(Object));
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should disable specific features', () => {
    const { middleware } = createSecurityMiddleware({
      csrf: false,
      headers: false
    });
    
    const req = mockRequest({ method: 'POST' });
    const res = mockResponse();
    
    middleware(req as Request, res as Response, mockNext);
    
    // Should not have CSRF or security headers
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(mockNext).toHaveBeenCalled();
  });
});