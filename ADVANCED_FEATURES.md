# Advanced Features

This guide covers the advanced features of the TheBrain MCP Server, including progress reporting, performance monitoring, and enhanced error handling.

## Progress Reporting

The server provides real-time progress reporting for long-running operations, especially useful for bulk operations.

### Features

- Real-time progress updates during operations
- Task tracking with unique IDs
- Progress percentage calculation
- Detailed status messages
- Error reporting with context

### Using Progress Reporting

Progress reporting is automatically enabled for supported operations:

```javascript
// Example: Creating bulk thoughts
const result = await tool.execute('create_bulk_thoughts', {
  brainId: 'your-brain-id',
  thoughts: [
    { name: 'Thought 1', notes: 'Description 1' },
    { name: 'Thought 2', notes: 'Description 2' },
    // ... many more thoughts
  ],
  relationships: [
    { sourceId: 'temp1', targetId: 'temp2', relation: 'Parent' }
  ]
});
```

### Monitoring Progress

When using HTTP transport, you can monitor progress through these endpoints:

```bash
# Get all active operations
GET /operations

# Get specific operation progress
GET /operations/:taskId

# Response example
{
  "taskId": "task_1234567890_abc",
  "operation": "create_bulk_thoughts",
  "current": 15,
  "total": 50,
  "message": "Creating thought 15/50: Project Planning",
  "metadata": {
    "thoughtsCreated": 14,
    "linksCreated": 5
  }
}
```

### Custom Progress Implementation

Tools can use the progress reporting system:

```typescript
import { withProgress } from '../utils/progress';

async function longOperation() {
  return await withProgress(
    {
      operation: 'custom_operation',
      total: 100
    },
    async (reporter) => {
      for (let i = 0; i < 100; i++) {
        // Do work
        await doSomething(i);
        
        // Report progress
        reporter.update(i + 1, `Processing item ${i + 1}`);
      }
      
      return { success: true };
    }
  );
}
```

## Performance Monitoring

The server includes comprehensive performance monitoring to track resource usage and optimize performance.

### Metrics Collected

- **CPU Usage**: User, system, and total CPU percentage
- **Memory Usage**: Heap, RSS, and percentage used
- **System Metrics**: Load average, free memory
- **Throughput**: Requests per second, operations per second
- **Error Rate**: Percentage of failed requests

### Configuration

```bash
# Performance monitoring settings
PERFORMANCE_UPDATE_INTERVAL=10000  # 10 seconds
PERFORMANCE_HISTORY_SIZE=360       # 1 hour of data
PERFORMANCE_CPU_WARNING=70         # 70% CPU warning
PERFORMANCE_CPU_CRITICAL=90        # 90% CPU critical
PERFORMANCE_MEMORY_WARNING=80      # 80% memory warning
PERFORMANCE_MEMORY_CRITICAL=95     # 95% memory critical
```

### Monitoring Endpoints

```bash
# Get current performance metrics
GET /metrics

# Response example
{
  "current": {
    "timestamp": "2024-01-01T12:00:00Z",
    "cpu": {
      "usage": 45.5,
      "system": 12345678,
      "user": 98765432
    },
    "memory": {
      "heapUsed": 125829120,
      "heapTotal": 209715200,
      "external": 1234567,
      "rss": 314572800,
      "percentUsed": 65.2
    },
    "throughput": {
      "requests": 12.5,
      "operations": 8.3,
      "errors": 0.5
    }
  },
  "averages": {
    "5min": { ... },
    "15min": { ... },
    "60min": { ... }
  }
}

# Health check with performance data
GET /health

{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "performance": {
    "cpu": 45.5,
    "memory": 65.2,
    "throughput": {
      "requests": 12.5,
      "operations": 8.3,
      "errors": 0.5
    }
  }
}
```

### Performance Alerts

The system automatically generates alerts when thresholds are exceeded:

```javascript
performanceMonitor.on('alert', (alert) => {
  console.log(`[${alert.level}] ${alert.type}: ${alert.message}`);
  // Example: [critical] cpu: CPU usage critical: 92%
});
```

### Using Performance Data

```typescript
import { performanceMonitor } from '../monitoring/performance';

// Record custom operations
performanceMonitor.recordOperation();
performanceMonitor.recordRequest();
performanceMonitor.recordError();

// Get current metrics
const metrics = performanceMonitor.getCurrentMetrics();
console.log(`CPU: ${metrics.cpu.usage}%`);
console.log(`Memory: ${metrics.memory.percentUsed}%`);

// Get historical data
const last5Min = performanceMonitor.getAverageMetrics(5);
console.log(`5-min average CPU: ${last5Min.cpu.usage}%`);
```

## Enhanced Error Handling

The server provides sophisticated error handling with user-friendly messages and detailed logging.

### Error Types

- **ValidationError**: Invalid input data
- **AuthenticationError**: Authentication failures
- **AuthorizationError**: Permission denied
- **NotFoundError**: Resource not found
- **ConflictError**: Data conflicts
- **RateLimitError**: Too many requests
- **ServiceUnavailableError**: Temporary failures
- **TheBrainAPIError**: External API errors

### Error Features

1. **Correlation IDs**: Unique identifiers for tracking errors
2. **User-Friendly Messages**: Safe, helpful messages for clients
3. **Detailed Logging**: Full context logged server-side
4. **Sensitive Data Protection**: Automatic redaction of secrets
5. **Development Mode**: Extra details in development

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data. Please check your input.",
    "correlationId": "1234567890-abc",
    "support": {
      "message": "If this problem persists, please contact support with the correlation ID.",
      "correlationId": "1234567890-abc"
    }
  }
}
```

### Development Mode

In development, errors include additional information:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data. Please check your input.",
    "correlationId": "1234567890-abc",
    "details": {
      "field": "brainId",
      "value": null,
      "constraint": "required"
    },
    "internalMessage": "brainId cannot be null",
    "stack": "Error: brainId cannot be null\n    at ..."
  }
}
```

### Custom Error Handling

```typescript
import { ValidationError, handleError } from '../utils/error-handler';

// Throw user-friendly errors
throw new ValidationError(
  'Internal: brainId validation failed',  // Logged internally
  { field: 'brainId', value: null },      // Details for debugging
  'Please provide a valid brain ID.'      // Shown to user
);

// Handle errors consistently
try {
  await riskyOperation();
} catch (error) {
  // Automatically logs and wraps the error appropriately
  throw handleError(error);
}
```

### Error Logging

All errors are logged with full context:

```
ERROR [2024-01-01 12:00:00] Request error {
  correlationId: '1234567890-abc',
  error: 'brainId validation failed',
  code: 'VALIDATION_ERROR',
  statusCode: 400,
  method: 'POST',
  url: '/api/v1/tools/create_thought',
  headers: { ... },
  body: { ... },
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
}
```

## Integration Example

Here's a complete example using all advanced features:

```typescript
// Tool with progress reporting and error handling
async function importDataset(args: { brainId: string; data: any[] }) {
  return await withProgress(
    {
      operation: 'import_dataset',
      total: args.data.length
    },
    async (reporter) => {
      performanceMonitor.recordOperation();
      const results = [];
      
      try {
        for (let i = 0; i < args.data.length; i++) {
          const item = args.data[i];
          
          // Report progress
          reporter.update(i, `Importing item ${i + 1}: ${item.name}`);
          
          try {
            // Validate data
            if (!item.name) {
              throw new ValidationError(
                'Item missing name',
                { index: i, item },
                `Item at index ${i} is missing a required name.`
              );
            }
            
            // Create thought
            const thought = await createThought({
              brainId: args.brainId,
              name: item.name,
              notes: item.description
            });
            
            results.push({ success: true, thought });
            
          } catch (error) {
            performanceMonitor.recordError();
            results.push({ 
              success: false, 
              error: error.message,
              index: i 
            });
            
            // Log but continue processing
            logger.error('Failed to import item', { 
              index: i, 
              error 
            });
          }
        }
        
        return {
          success: true,
          results,
          summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }
        };
        
      } catch (error) {
        performanceMonitor.recordError();
        throw handleError(error);
      }
    }
  );
}
```

## Monitoring Dashboard

For production deployments, consider setting up a monitoring dashboard that displays:

1. **Real-time Metrics**: CPU, memory, throughput graphs
2. **Active Operations**: Progress bars for running tasks
3. **Error Rates**: Trending error percentages
4. **Performance Alerts**: Critical warnings
5. **System Health**: Overall status indicators

Example dashboard implementation:

```javascript
// WebSocket connection for real-time updates
const ws = new WebSocket('ws://localhost:3000/monitoring');

ws.on('message', (data) => {
  const update = JSON.parse(data);
  
  switch (update.type) {
    case 'metrics':
      updateMetricsChart(update.data);
      break;
    case 'progress':
      updateProgressBar(update.data);
      break;
    case 'alert':
      showAlert(update.data);
      break;
  }
});
```

## Best Practices

1. **Use Progress Reporting** for operations that:
   - Process multiple items
   - Take longer than 5 seconds
   - Have clear phases or steps

2. **Monitor Performance** to:
   - Identify bottlenecks
   - Optimize resource usage
   - Predict scaling needs

3. **Handle Errors Gracefully**:
   - Use specific error types
   - Provide helpful user messages
   - Log detailed context
   - Use correlation IDs for tracking

4. **Set Appropriate Thresholds**:
   - Adjust based on your infrastructure
   - Consider peak usage patterns
   - Plan for growth

5. **Regular Monitoring**:
   - Check metrics endpoint regularly
   - Set up alerts for critical thresholds
   - Review error logs for patterns
   - Monitor long-running operations

## Troubleshooting

### High CPU Usage

1. Check active operations: `GET /operations`
2. Review performance metrics: `GET /metrics`
3. Look for error spikes in logs
4. Consider rate limiting adjustments

### Memory Leaks

1. Monitor memory trends over time
2. Check for uncompleted operations
3. Review error handling for proper cleanup
4. Use heap snapshots for debugging

### Slow Operations

1. Enable progress reporting to identify bottlenecks
2. Check network latency to TheBrain API
3. Review batch size for bulk operations
4. Consider implementing caching

### Error Tracking

1. Use correlation IDs to trace errors
2. Check both client and server logs
3. Review error patterns in metrics
4. Monitor specific error types

## Configuration Reference

```bash
# Progress Reporting
PROGRESS_REPORT_INTERVAL=100      # Minimum ms between updates

# Performance Monitoring
PERFORMANCE_UPDATE_INTERVAL=10000  # Update interval in ms
PERFORMANCE_HISTORY_SIZE=360       # Number of historical points
PERFORMANCE_CPU_WARNING=70         # CPU warning threshold %
PERFORMANCE_CPU_CRITICAL=90        # CPU critical threshold %
PERFORMANCE_MEMORY_WARNING=80      # Memory warning threshold %
PERFORMANCE_MEMORY_CRITICAL=95     # Memory critical threshold %
PERFORMANCE_ERROR_WARNING=5        # Error rate warning %

# Error Handling
NODE_ENV=production               # production/development
LOG_LEVEL=info                    # debug/info/warn/error
ERROR_STACK_TRACES=false          # Show stack traces in responses
```

## Future Enhancements

Planned improvements for advanced features:

1. **WebSocket Support**: Real-time progress updates
2. **Metrics Export**: Prometheus/Grafana integration
3. **Distributed Tracing**: OpenTelemetry support
4. **Advanced Caching**: Redis integration
5. **Request Queuing**: Better handling of concurrent operations
6. **Auto-scaling**: Dynamic resource allocation