import * as os from 'os';
import * as process from 'process';
import EventEmitter from 'events';
import logger from '../utils/logger';

export interface PerformanceMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    system: number;
    user: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
  };
  system: {
    loadAverage: number[];
    freeMemory: number;
    totalMemory: number;
  };
  throughput: {
    requests: number;
    operations: number;
    errors: number;
  };
}

export interface PerformanceThresholds {
  cpuWarning?: number;
  cpuCritical?: number;
  memoryWarning?: number;
  memoryCritical?: number;
  errorRateWarning?: number;
}

export class PerformanceMonitor extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private lastCpuUsage: NodeJS.CpuUsage;
  private metricsHistory: PerformanceMetrics[] = [];
  private readonly maxHistorySize: number;
  private readonly updateInterval: number;
  private thresholds: PerformanceThresholds;
  
  // Counters
  private requestCount: number = 0;
  private operationCount: number = 0;
  private errorCount: number = 0;
  private lastMetricTime: number = Date.now();

  constructor(options: {
    updateInterval?: number;
    maxHistorySize?: number;
    thresholds?: PerformanceThresholds;
  } = {}) {
    super();
    this.updateInterval = options.updateInterval || 10000; // 10 seconds
    this.maxHistorySize = options.maxHistorySize || 360; // 1 hour of 10-second intervals
    this.thresholds = options.thresholds || {
      cpuWarning: 70,
      cpuCritical: 90,
      memoryWarning: 80,
      memoryCritical: 95,
      errorRateWarning: 5
    };
    this.lastCpuUsage = process.cpuUsage();
  }

  /**
   * Start monitoring performance
   */
  start(): void {
    if (this.interval) {
      logger.warn('Performance monitor already running');
      return;
    }

    logger.info('Starting performance monitoring', {
      updateInterval: this.updateInterval,
      thresholds: this.thresholds
    });

    this.collectMetrics(); // Collect initial metrics
    
    this.interval = setInterval(() => {
      this.collectMetrics();
    }, this.updateInterval);
  }

  /**
   * Stop monitoring performance
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Performance monitoring stopped');
    }
  }

  /**
   * Increment request counter
   */
  recordRequest(): void {
    this.requestCount++;
  }

  /**
   * Increment operation counter
   */
  recordOperation(): void {
    this.operationCount++;
  }

  /**
   * Increment error counter
   */
  recordError(): void {
    this.errorCount++;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): PerformanceMetrics | undefined {
    return this.metricsHistory[this.metricsHistory.length - 1];
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(count?: number): PerformanceMetrics[] {
    if (count) {
      return this.metricsHistory.slice(-count);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get average metrics over a time period
   */
  getAverageMetrics(minutes: number = 5): Partial<PerformanceMetrics> {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    const relevantMetrics = this.metricsHistory.filter(m => 
      m.timestamp.getTime() > cutoffTime
    );

    if (relevantMetrics.length === 0) {
      return {};
    }

    const avgCpu = relevantMetrics.reduce((sum, m) => sum + m.cpu.usage, 0) / relevantMetrics.length;
    const avgMemory = relevantMetrics.reduce((sum, m) => sum + m.memory.percentUsed, 0) / relevantMetrics.length;

    return {
      cpu: {
        usage: avgCpu,
        system: 0,
        user: 0
      },
      memory: {
        percentUsed: avgMemory,
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      }
    };
  }

  /**
   * Collect performance metrics
   */
  private collectMetrics(): void {
    const now = Date.now();
    const timeElapsed = (now - this.lastMetricTime) / 1000; // in seconds
    
    // CPU usage calculation
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpuTime / (timeElapsed * 1000000)) * 100;
    
    // Memory metrics
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = (usedMemory / totalMemory) * 100;
    
    // Calculate throughput
    const throughputRequests = this.requestCount / timeElapsed;
    const throughputOperations = this.operationCount / timeElapsed;
    const errorRate = (this.errorCount / Math.max(this.requestCount, 1)) * 100;
    
    const metrics: PerformanceMetrics = {
      timestamp: new Date(),
      cpu: {
        usage: Math.round(cpuPercent * 100) / 100,
        system: cpuUsage.system,
        user: cpuUsage.user
      },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        percentUsed: Math.round(memoryPercent * 100) / 100
      },
      system: {
        loadAverage: os.loadavg(),
        freeMemory,
        totalMemory
      },
      throughput: {
        requests: Math.round(throughputRequests * 100) / 100,
        operations: Math.round(throughputOperations * 100) / 100,
        errors: Math.round(errorRate * 100) / 100
      }
    };
    
    // Add to history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
    
    // Check thresholds
    this.checkThresholds(metrics);
    
    // Emit metrics
    this.emit('metrics', metrics);
    
    // Reset counters
    this.requestCount = 0;
    this.operationCount = 0;
    this.errorCount = 0;
    this.lastMetricTime = now;
    this.lastCpuUsage = process.cpuUsage();
    
    logger.debug('Performance metrics collected', {
      cpu: metrics.cpu.usage,
      memory: metrics.memory.percentUsed,
      throughput: metrics.throughput
    });
  }

  /**
   * Check if metrics exceed thresholds
   */
  private checkThresholds(metrics: PerformanceMetrics): void {
    const { cpu, memory, throughput } = metrics;
    
    // CPU threshold checks
    if (cpu.usage >= this.thresholds.cpuCritical!) {
      this.emit('alert', {
        level: 'critical',
        type: 'cpu',
        message: `CPU usage critical: ${cpu.usage}%`,
        value: cpu.usage,
        threshold: this.thresholds.cpuCritical
      });
      logger.error('Critical CPU usage', { usage: cpu.usage });
    } else if (cpu.usage >= this.thresholds.cpuWarning!) {
      this.emit('alert', {
        level: 'warning',
        type: 'cpu',
        message: `CPU usage high: ${cpu.usage}%`,
        value: cpu.usage,
        threshold: this.thresholds.cpuWarning
      });
      logger.warn('High CPU usage', { usage: cpu.usage });
    }
    
    // Memory threshold checks
    if (memory.percentUsed >= this.thresholds.memoryCritical!) {
      this.emit('alert', {
        level: 'critical',
        type: 'memory',
        message: `Memory usage critical: ${memory.percentUsed}%`,
        value: memory.percentUsed,
        threshold: this.thresholds.memoryCritical
      });
      logger.error('Critical memory usage', { usage: memory.percentUsed });
    } else if (memory.percentUsed >= this.thresholds.memoryWarning!) {
      this.emit('alert', {
        level: 'warning',
        type: 'memory',
        message: `Memory usage high: ${memory.percentUsed}%`,
        value: memory.percentUsed,
        threshold: this.thresholds.memoryWarning
      });
      logger.warn('High memory usage', { usage: memory.percentUsed });
    }
    
    // Error rate threshold checks
    if (throughput.errors >= this.thresholds.errorRateWarning!) {
      this.emit('alert', {
        level: 'warning',
        type: 'errors',
        message: `High error rate: ${throughput.errors}%`,
        value: throughput.errors,
        threshold: this.thresholds.errorRateWarning
      });
      logger.warn('High error rate', { rate: throughput.errors });
    }
  }

  /**
   * Get a performance report
   */
  getPerformanceReport(): {
    current: PerformanceMetrics | undefined;
    averages: {
      '5min': Partial<PerformanceMetrics>;
      '15min': Partial<PerformanceMetrics>;
      '60min': Partial<PerformanceMetrics>;
    };
    alerts: any[];
  } {
    return {
      current: this.getCurrentMetrics(),
      averages: {
        '5min': this.getAverageMetrics(5),
        '15min': this.getAverageMetrics(15),
        '60min': this.getAverageMetrics(60)
      },
      alerts: [] // Would need to implement alert history
    };
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Helper middleware for Express
export function performanceMiddleware() {
  return (req: any, res: any, next: any) => {
    performanceMonitor.recordRequest();
    
    // Track response time
    const startTime = Date.now();
    
    // Override end method to track when response completes
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - startTime;
      
      // Record error if status >= 400
      if (res.statusCode >= 400) {
        performanceMonitor.recordError();
      }
      
      // Log slow requests
      if (duration > 1000) {
        logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          status: res.statusCode
        });
      }
      
      return originalEnd.apply(res, args);
    };
    
    next();
  };
}