import logger from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: boolean;
  onRetry?: (error: any, attempt: number) => void;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = true,
    onRetry
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        throw error;
      }

      const retryDelay = backoff ? delay * Math.pow(2, attempt - 1) : delay;
      
      logger.debug('Retrying operation', { 
        attempt, 
        maxAttempts, 
        delay: retryDelay,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (onRetry) {
        onRetry(error, attempt);
      }

      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}