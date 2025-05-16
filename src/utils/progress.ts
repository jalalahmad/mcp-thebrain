import EventEmitter from 'events';
import logger from './logger';

export interface ProgressUpdate {
  taskId: string;
  operation: string;
  current: number;
  total: number;
  message?: string;
  metadata?: Record<string, any>;
}

export interface ProgressOptions {
  taskId?: string;
  operation: string;
  total: number;
  reportInterval?: number; // Minimum ms between progress reports
}

export class ProgressReporter extends EventEmitter {
  private progress: Map<string, ProgressUpdate>;
  private lastReportTime: Map<string, number>;
  private reportInterval: number;

  constructor(reportInterval: number = 100) {
    super();
    this.progress = new Map();
    this.lastReportTime = new Map();
    this.reportInterval = reportInterval;
  }

  /**
   * Start tracking progress for an operation
   */
  startOperation(options: ProgressOptions): string {
    const taskId = options.taskId || this.generateTaskId();
    const update: ProgressUpdate = {
      taskId,
      operation: options.operation,
      current: 0,
      total: options.total,
      message: 'Starting operation'
    };

    this.progress.set(taskId, update);
    this.lastReportTime.set(taskId, Date.now());
    this.emit('progress', update);

    logger.info('Progress tracking started', {
      taskId,
      operation: options.operation,
      total: options.total
    });

    return taskId;
  }

  /**
   * Update progress for an operation
   */
  updateProgress(taskId: string, current: number, message?: string, metadata?: Record<string, any>): void {
    const progress = this.progress.get(taskId);
    if (!progress) {
      logger.warn('Progress update for unknown task', { taskId });
      return;
    }

    progress.current = current;
    if (message) progress.message = message;
    if (metadata) progress.metadata = metadata;

    // Throttle progress updates
    const now = Date.now();
    const lastReport = this.lastReportTime.get(taskId) || 0;
    
    if (now - lastReport >= this.reportInterval || current === progress.total) {
      this.lastReportTime.set(taskId, now);
      this.emit('progress', progress);

      logger.debug('Progress update', {
        taskId,
        operation: progress.operation,
        current,
        total: progress.total,
        percentage: Math.round((current / progress.total) * 100)
      });
    }
  }

  /**
   * Complete an operation
   */
  completeOperation(taskId: string, message?: string): void {
    const progress = this.progress.get(taskId);
    if (!progress) {
      logger.warn('Complete called for unknown task', { taskId });
      return;
    }

    progress.current = progress.total;
    progress.message = message || 'Operation completed';
    
    this.emit('progress', progress);
    this.emit('complete', progress);
    
    this.progress.delete(taskId);
    this.lastReportTime.delete(taskId);

    logger.info('Operation completed', {
      taskId,
      operation: progress.operation
    });
  }

  /**
   * Report an error for an operation
   */
  reportError(taskId: string, error: Error): void {
    const progress = this.progress.get(taskId);
    if (!progress) {
      logger.warn('Error reported for unknown task', { taskId });
      return;
    }

    progress.message = `Error: ${error.message}`;
    
    this.emit('progress', progress);
    this.emit('error', { taskId, error });
    
    this.progress.delete(taskId);
    this.lastReportTime.delete(taskId);

    logger.error('Operation failed', {
      taskId,
      operation: progress.operation,
      error: error.message
    });
  }

  /**
   * Get current progress for a task
   */
  getProgress(taskId: string): ProgressUpdate | undefined {
    return this.progress.get(taskId);
  }

  /**
   * Get all active operations
   */
  getActiveOperations(): ProgressUpdate[] {
    return Array.from(this.progress.values());
  }

  /**
   * Generate a unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global progress reporter instance
export const progressReporter = new ProgressReporter();

// Helper function for operations with progress
export async function withProgress<T>(
  options: ProgressOptions,
  operation: (reporter: {
    update: (current: number, message?: string) => void;
    setTotal: (total: number) => void;
  }) => Promise<T>
): Promise<T> {
  const taskId = progressReporter.startOperation(options);
  
  try {
    const result = await operation({
      update: (current: number, message?: string) => {
        progressReporter.updateProgress(taskId, current, message);
      },
      setTotal: (total: number) => {
        const progress = progressReporter.getProgress(taskId);
        if (progress) {
          progress.total = total;
        }
      }
    });
    
    progressReporter.completeOperation(taskId);
    return result;
  } catch (error) {
    progressReporter.reportError(taskId, error as Error);
    throw error;
  }
}