# Transport Configuration

The TheBrain MCP server supports multiple transport mechanisms for communication. You can configure the transport type through environment variables.

## Transport Types

### 1. Stdio Transport (Default)

Used for local CLI-based usage. This is the default transport type.

```bash
# Use stdio transport (default)
TRANSPORT_TYPE=stdio node dist/index.js
```

### 2. HTTP Transport

Used for network access with an Express-based HTTP server.

```bash
# Use HTTP transport
TRANSPORT_TYPE=http node dist/index.js
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TRANSPORT_TYPE` | Transport type (`stdio` or `http`) | `stdio` | No |
| `HTTP_PORT` | Port for HTTP server | `3000` | No (only for HTTP) |
| `HTTP_HOST` | Host for HTTP server | `0.0.0.0` | No (only for HTTP) |
| `BASE_PATH` | Base path for API endpoints | `/api/v1` | No (only for HTTP) |

## HTTP Endpoints

When using HTTP transport, the following endpoints are available:

### Health Check
```
GET /health
```

Returns server health status:
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T00:00:00.000Z",
  "transport": "http",
  "version": "1.0.0"
}
```

### API Info
```
GET /api/v1/info
```

Returns server information and capabilities:
```json
{
  "name": "TheBrain MCP Server",
  "version": "1.0.0",
  "transport": "http",
  "capabilities": {
    "resources": true,
    "tools": true,
    "prompts": true
  }
}
```

### Resources
```
GET /api/v1/resources
GET /api/v1/resources/:resourceType
GET /api/v1/resources/:resourceType/:resourceId
```

### Tools
```
GET /api/v1/tools
POST /api/v1/tools/:toolName
```

### Prompts
```
GET /api/v1/prompts
POST /api/v1/prompts/:promptName
```

## Usage Examples

### Running with Stdio (Local CLI)
```bash
THEBRAIN_API_KEY=your-api-key node dist/index.js
```

### Running with HTTP Server
```bash
TRANSPORT_TYPE=http \
HTTP_PORT=8080 \
HTTP_HOST=localhost \
THEBRAIN_API_KEY=your-api-key \
node dist/index.js
```

### Docker with HTTP
```bash
docker run -p 8080:8080 \
  -e TRANSPORT_TYPE=http \
  -e HTTP_PORT=8080 \
  -e THEBRAIN_API_KEY=your-api-key \
  thebrain-mcp:latest
```

## Security Considerations

- The HTTP transport is designed to be used behind a reverse proxy or API gateway
- Authentication integration is prepared but needs to be implemented
- Use HTTPS in production environments
- Consider using environment-specific configurations

## Development

### Testing HTTP Transport
```bash
# Start server with HTTP transport
TRANSPORT_TYPE=http npm run dev

# In another terminal, test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/info
```

### Debugging
```bash
# Enable debug logging
DEBUG=thebrain:* TRANSPORT_TYPE=http npm run dev
```

## Future Enhancements

1. WebSocket support for real-time communication
2. gRPC transport option
3. Built-in authentication mechanisms
4. Rate limiting and request throttling
5. Metrics and monitoring endpoints