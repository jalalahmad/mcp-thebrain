# Docker Support for TheBrain MCP Server

This project includes full Docker support for both development and production environments.

## Quick Start

### Production

```bash
# Quick start production environment
./scripts/prod.sh

# Or use docker-compose directly
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# Deploy with health checks
./scripts/deploy.sh
```

### Development

```bash
# Quick start development environment
./scripts/dev.sh

# Or use docker-compose directly
docker-compose -f docker-compose.dev.yml up --build

# Run in background
docker-compose -f docker-compose.dev.yml up -d --build

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop development environment
docker-compose -f docker-compose.dev.yml down
```

## Available Scripts

### Convenience Scripts
- `./scripts/dev.sh` - Start development environment
- `./scripts/prod.sh` - Start production environment
- `./scripts/deploy.sh` - Deploy with health checks

### Docker Compose Commands
```bash
# Development
docker compose -f docker-compose.dev.yml up       # Start
docker compose -f docker-compose.dev.yml down     # Stop
docker compose -f docker-compose.dev.yml logs -f  # Logs

# Production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d   # Start
docker compose --env-file .env.production -f docker-compose.prod.yml down    # Stop
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f # Logs
```

## Environment Variables

### Development Environment
Create `.env.development` or use the provided `.env.docker`:

```env
THEBRAIN_API_KEY=test-api-key-12345
THEBRAIN_API_URL=https://api.bra.in
TRANSPORT_TYPE=http
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
BASE_PATH=/api/v1
AUTH_TYPE=api-key
LOG_LEVEL=debug
NODE_ENV=development
```

### Production Environment
Copy `.env.production.example` to `.env.production` and update:

```env
THEBRAIN_API_KEY=your-actual-api-key
THEBRAIN_API_URL=https://api.bra.in
TRANSPORT_TYPE=http
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
BASE_PATH=/api/v1
AUTH_TYPE=api-key
LOG_LEVEL=info
NODE_ENV=production
```

## Docker Images

### Production Image (`thebrain-mcp:latest`)

- Multi-stage build for minimal size (~150MB)
- Runs as non-root user (nodejs:1001)
- Only production dependencies
- Health check configured
- Security hardened
- Optimized for performance

### Development Image (`thebrain-mcp:dev`)

- Includes all dependencies
- Hot reload enabled with nodemon
- Source code mounted as volume
- TypeScript compilation with ts-node
- Debug port exposed (9229)
- Ideal for local development

## Deployment

### Using Docker Compose

1. Copy `docker-compose.prod.yml` to your deployment server
2. Copy `.env.production.example` to `.env.production`
3. Update `.env.production` with production credentials
4. Run deployment:
   ```bash
   # Using convenience script
   ./scripts/deploy.sh
   
   # Or manually
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d
   ```

### Using Kubernetes

Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: thebrain-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: thebrain-mcp
  template:
    metadata:
      labels:
        app: thebrain-mcp
    spec:
      containers:
      - name: thebrain-mcp
        image: thebrain-mcp:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: THEBRAIN_API_KEY
          valueFrom:
            secretKeyRef:
              name: thebrain-secrets
              key: api-key
```

## Security Considerations

- Never commit `.env` files or credentials
- Use secrets management in production
- The container runs as non-root user
- Only necessary ports are exposed
- Production builds exclude development files

## Networking

### Development
- Network: `thebrain_thebrain-net`
- Port: 3000 (mapped to host)
- Debug port: 9229 (mapped to host)

### Production
- Network: `thebrain_thebrain-net`
- Port: 3000 (configurable via HTTP_PORT)
- Health check endpoint: `/api/v1/info`

## Volumes

### Development
- `./src:/app/src` - Source code (hot reload)
- `./logs:/app/logs` - Log files
- `./package.json:/app/package.json` - Dependencies
- `./tsconfig.json:/app/tsconfig.json` - TypeScript config

### Production
- `./logs:/app/logs` - Log files
- `/var/run/docker.sock:/var/run/docker.sock:ro` - Docker socket (optional)

## Troubleshooting

### Container fails to start

1. Check logs: `docker logs <container-id>`
2. Verify environment variables are set
3. Ensure proper permissions on mounted volumes
4. Check for port conflicts

### Cannot connect to container

1. For stdio transport, ensure `stdin_open: true` and `tty: true` are set
2. For HTTP transport, verify port mapping
3. Check container is running: `docker ps`
4. Test health endpoint: `curl http://localhost:3000/api/v1/info`

### Development hot reload not working

1. Ensure source directory is properly mounted
2. Check nodemon configuration
3. Verify file watching is enabled in Docker
4. Check TypeScript compilation errors

### Production health check failing

1. Verify the server is listening on the correct port
2. Check application logs for startup errors
3. Test health endpoint manually
4. Adjust health check timing in docker-compose.prod.yml
