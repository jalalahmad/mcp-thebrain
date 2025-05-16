import logger from './logger';

// Base error class for TheBrain MCP with enhanced features
export class TheBrainError extends Error {
  public code: string;
  public statusCode: number;
  public details?: any;
  public userMessage?: string;
  public correlationId: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: any,
    userMessage?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.userMessage = userMessage;
    this.correlationId = this.generateCorrelationId();
    Error.captureStackTrace(this, this.constructor);
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get a safe error message for the client
   */
  getClientMessage(): string {
    return this.userMessage || this.getDefaultUserMessage();
  }

  /**
   * Get default user-friendly message based on error type
   */
  private getDefaultUserMessage(): string {
    switch (this.statusCode) {
      case 400:
        return 'The request contains invalid data. Please check your input.';
      case 401:
        return 'Authentication is required to access this resource.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'The request conflicts with the current state.';
      case 429:
        return 'Too many requests. Please try again later.';
      case 503:
        return 'The service is temporarily unavailable. Please try again later.';
      case 500:
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }
}

// Specific error types with user-friendly messages
export class AuthenticationError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'AUTHENTICATION_ERROR',
      401,
      details,
      userMessage || 'Authentication failed. Please check your credentials.'
    );
  }
}

export class AuthorizationError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'AUTHORIZATION_ERROR',
      403,
      details,
      userMessage || 'You are not authorized to access this resource.'
    );
  }
}

export class ValidationError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'VALIDATION_ERROR',
      400,
      details,
      userMessage || 'Invalid input provided. Please check your data.'
    );
  }
}

export class NotFoundError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'NOT_FOUND',
      404,
      details,
      userMessage || 'The requested resource could not be found.'
    );
  }
}

export class ConflictError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'CONFLICT',
      409,
      details,
      userMessage || 'The request conflicts with existing data.'
    );
  }
}

export class RateLimitError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'RATE_LIMIT_EXCEEDED',
      429,
      details,
      userMessage || 'Too many requests. Please slow down and try again.'
    );
  }
}

export class ServiceUnavailableError extends TheBrainError {
  constructor(message: string, details?: any, userMessage?: string) {
    super(
      message,
      'SERVICE_UNAVAILABLE',
      503,
      details,
      userMessage || 'The service is temporarily unavailable. Please try again later.'
    );
  }
}

export class TheBrainAPIError extends TheBrainError {
  constructor(message: string, statusCode: number, details?: any, userMessage?: string) {
    super(
      message,
      'THEBRAIN_API_ERROR',
      statusCode,
      details,
      userMessage || 'An error occurred while communicating with TheBrain API.'
    );
  }
}

// Enhanced error handler
export function handleError(error: Error | TheBrainError): never {
  const correlationId = error instanceof TheBrainError ? error.correlationId : generateCorrelationId();
  
  if (error instanceof TheBrainError) {
    logger.error('Application error', {
      correlationId,
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      details: error.details,
      stack: error.stack,
    });
    
    throw error;
  }
  
  logger.error('Unexpected error', {
    correlationId,
    message: error.message,
    stack: error.stack,
  });
  
  throw new TheBrainError(
    error.message || 'An unexpected error occurred',
    'UNEXPECTED_ERROR',
    500,
    { originalError: error.message },
    'An unexpected error occurred. Please try again later.'
  );
}

// Enhanced async wrapper
export function wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      return handleError(error as Error);
    }
  }) as T;
}

// Enhanced error handler middleware for Express
export function errorMiddleware(
  error: Error | TheBrainError,
  req: any,
  res: any,
  next: any
) {
  // Generate correlation ID for tracking
  const correlationId = error instanceof TheBrainError 
    ? error.correlationId 
    : generateCorrelationId();
  
  // Log the error with full context (server-side only)
  logger.error('Request error', {
    correlationId,
    error: error.message,
    stack: error.stack,
    code: error instanceof TheBrainError ? error.code : 'UNKNOWN',
    statusCode: error instanceof TheBrainError ? error.statusCode : 500,
    method: req.method,
    url: req.url,
    headers: sanitizeHeaders(req.headers),
    body: req.body,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Prepare client response
  let statusCode = 500;
  let errorResponse: any;

  if (error instanceof TheBrainError) {
    statusCode = error.statusCode;
    errorResponse = {
      error: {
        code: error.code,
        message: error.getClientMessage(),
        correlationId,
        ...(process.env.NODE_ENV === 'development' && {
          details: error.details,
          internalMessage: error.message,
          stack: error.stack
        })
      }
    };
  } else {
    // Handle standard errors
    errorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal server error occurred. Please try again later.',
        correlationId,
        ...(process.env.NODE_ENV === 'development' && {
          internalMessage: error.message,
          stack: error.stack
        })
      }
    };
  }

  // Add support information
  errorResponse.error.support = {
    message: 'If this problem persists, please contact support with the correlation ID.',
    correlationId
  };

  res.status(statusCode).json(errorResponse);
}

// Helper functions
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// Sanitize error messages for client
export function sanitizeErrorMessage(message: string): string {
  // Remove sensitive patterns
  const patterns = [
    /password[\s\S]*?[\s,;]/gi,
    /token[\s\S]*?[\s,;]/gi,
    /key[\s\S]*?[\s,;]/gi,
    /secret[\s\S]*?[\s,;]/gi,
    /\/[a-zA-Z0-9\/\-_]+\.(js|ts|json)/g, // File paths
    /[a-zA-Z]:[\\/].*/g, // Windows paths
    /\/home\/[^\/]+/g, // Unix home paths
    /mongodb:\/\/[^\/]+/g, // MongoDB URLs
    /https?:\/\/[^\/]+:[^@]+@/g, // URLs with credentials
  ];

  let sanitized = message;
  patterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });

  return sanitized;
}