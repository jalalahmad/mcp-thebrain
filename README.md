# TheBrain MCP Server

An implementation of the Model Context Protocol (MCP) server that exposes TheBrain's knowledge management functionality to AI assistants.

## Documentation

- [API Reference](./THEBRAIN_API_REFERENCE.md) - Complete API endpoint documentation
- [Implementation Status](./IMPLEMENTATION_PLAN.md) - Current implementation status and roadmap
- [API Schema Comparison](./API_SCHEMA_COMPARISON.md) - Schema differences and updates needed
- [Attachment API Guide](./ATTACHMENT_API_IMPLEMENTATION.md) - Attachment operations documentation

## Features

- 🧠 **TheBrain Integration**: Full API integration with TheBrain for managing thoughts, links, and relationships
- 🔌 **MCP Support**: Complete Model Context Protocol implementation with resources, tools, and prompts
- 🚀 **Multiple Transports**: Support for both stdio (local) and HTTP (network) communication
- 🔐 **Security**: OAuth 2.1 and API key authentication with rate limiting and CSRF protection
- 📊 **Monitoring**: Real-time performance monitoring with CPU, memory, and throughput metrics
- 📈 **Progress Reporting**: Live progress updates for long-running operations
- 🛡️ **Production Ready**: Enhanced error handling, security headers, and input validation
- 🔍 **Debugging**: Correlation IDs, detailed logging, and error tracking

## Quick Start

### Docker (Recommended)

```bash
# Development environment
./scripts/dev.sh

# Production environment
./scripts/prod.sh
```

### Local Installation

```bash
npm install
npm run build
npm start
```

## Configuration

The server can be configured through environment variables:

### Transport Configuration
```bash
TRANSPORT_TYPE=http|stdio     # Default: stdio
HTTP_PORT=3000               # Default: 3000
HTTP_HOST=0.0.0.0           # Default: 0.0.0.0
BASE_PATH=/api/v1           # Default: /api/v1
```

### Authentication Configuration
```bash
AUTH_TYPE=oauth|api-key|both|none  # Default: api-key

# OAuth 2.1 Settings
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback
OAUTH_AUTH_ENDPOINT=/oauth/authorize
OAUTH_TOKEN_ENDPOINT=/oauth/token
OAUTH_SCOPE=read write
OAUTH_ALLOWED_CLIENTS=client1,client2

# API Key Settings
THEBRAIN_API_KEY=your-api-key      # Primary API key
API_KEY_1=name:key:permissions     # Additional keys
ENABLE_API_KEY_MANAGEMENT=true     # Enable management endpoints
```

### Security Configuration
```bash
# Rate Limiting
ENABLE_RATE_LIMIT=true           # Default: true
RATE_LIMIT_WINDOW_MS=60000      # Default: 60000 (1 minute)
RATE_LIMIT_MAX_REQUESTS=100     # Default: 100

# CSRF Protection
ENABLE_CSRF=true                # Default: true
CSRF_COOKIE_NAME=csrf-token     # Default: csrf-token
CSRF_HEADER_NAME=X-CSRF-Token   # Default: X-CSRF-Token

# Security Headers
ENABLE_SECURITY_HEADERS=true    # Default: true
```

## Usage

### Docker

#### Development
```bash
# Start development environment with hot reload
docker compose -f docker-compose.dev.yml up

# Or use the convenience script
./scripts/dev.sh
```

#### Production
```bash
# Start production environment
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# Or use the convenience script
./scripts/prod.sh

# Deploy with health checks
./scripts/deploy.sh
```

### Local Development

```bash
# Stdio Transport (Local)
npm start

# HTTP Transport (Network)
TRANSPORT_TYPE=http npm start

# With Authentication
AUTH_TYPE=api-key THEBRAIN_API_KEY=your-key npm start

# Development with hot reload
npm run dev
```

## API Endpoints

When using HTTP transport, the following endpoints are available:

- `GET /health` - Health check
- `GET /api/v1/info` - Server information
- `GET /api/v1/resources` - List available resources
- `GET /api/v1/tools` - List available tools
- `GET /api/v1/prompts` - List available prompts
- `POST /api/v1/tools/:toolName` - Execute a tool
- `GET /api/v1/resources/:type/:id?` - Get resource
- `POST /api/v1/prompts/:promptName` - Execute prompt

## Docker Setup

### Environment Files

Create environment files for different environments:

```bash
# Development
cp .env.docker .env.development

# Production
cp .env.production.example .env.production
# Edit .env.production with your actual values
```

### Available Images

- `thebrain-mcp:dev` - Development image with hot reload
- `thebrain-mcp:latest` - Production image (multi-stage, optimized)

### Docker Commands

```bash
# Build images
docker compose -f docker-compose.dev.yml build    # Development
docker compose -f docker-compose.prod.yml build   # Production

# Start services
docker compose -f docker-compose.dev.yml up       # Development
docker compose -f docker-compose.prod.yml up -d   # Production (detached)

# View logs
docker compose -f docker-compose.dev.yml logs -f  # Development
docker compose -f docker-compose.prod.yml logs -f # Production

# Stop services
docker compose -f docker-compose.dev.yml down     # Development
docker compose -f docker-compose.prod.yml down    # Production
```

See [DOCKER.md](DOCKER.md) for detailed Docker documentation.

## Security

The server implements comprehensive security measures:

1. **Authentication**: OAuth 2.1 and API key support
2. **Rate Limiting**: Configurable request limits
3. **CSRF Protection**: Token-based CSRF protection
4. **Security Headers**: Standard security headers
5. **Input Validation**: Strict input validation
6. **Error Handling**: Secure error messages

See [SECURITY.md](SECURITY.md) for detailed security documentation.

## Advanced Features

The server includes advanced features for production deployments:

- **Progress Reporting**: Track long-running operations in real-time
- **Performance Monitoring**: Monitor CPU, memory, and throughput
- **Enhanced Error Handling**: User-friendly errors with correlation IDs

See [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md) for detailed documentation on these features.

## Available Tools

The server provides comprehensive tools for interacting with TheBrain:

### Core Operations
- **list_brains**: List all brains in the user's account
- **create_thought**: Create a new thought with optional parent connection
- **update_thought**: Update an existing thought
- **delete_thought**: Delete a thought from the brain
- **create_link**: Create a link between two thoughts
- **create_bulk_thoughts**: Create multiple thoughts and relationships in a single operation

### Tag & Type Management
- **get_tags**: Get all tags in a brain
- **add_tags_to_thought**: Add tags to a thought
- **remove_tags_from_thought**: Remove tags from a thought
- **get_types**: Get all types in a brain

### Notes Management
- **get_notes**: Get notes for a thought in various formats (Markdown, HTML, text)
- **update_notes**: Update notes for a thought
- **append_notes**: Append content to existing notes

### Search & Navigation
- **search_advanced**: Advanced search with filters (by type, tag, date range)
- **get_thought_relationships**: Get all relationships for a thought (parents, children, siblings, jumps)

### Attachments
- **get_thought_attachments**: Get all attachments for a thought
- **create_attachment**: Create a new file attachment
- **create_url_attachment**: Create a URL attachment

### Analytics
- **get_brain_statistics**: Get comprehensive brain statistics

See [TOOLS.md](TOOLS.md) for detailed tool documentation and usage examples.

## Available Resources

The server exposes the following resources for AI-assisted navigation:

### Basic Resources
- `thebrain://brains` - List of all available brains
- `thebrain://brains/{brainId}/thoughts/{thoughtId}` - Specific thought details
- `thebrain://brains/{brainId}/search?q={query}` - Search results

### Relationship Resources
- `thebrain://brains/{brainId}/thoughts/{thoughtId}/children` - Child thoughts
- `thebrain://brains/{brainId}/thoughts/{thoughtId}/parents` - Parent thoughts
- `thebrain://brains/{brainId}/thoughts/{thoughtId}/siblings` - Sibling thoughts

### Metadata Resources
- `thebrain://brains/{brainId}/tags` - All tags in a brain
- `thebrain://brains/{brainId}/types` - All types in a brain
- `thebrain://brains/{brainId}/statistics` - Brain statistics

### Content Resources
- `thebrain://brains/{brainId}/thoughts/{thoughtId}/notes` - Thought notes
- `thebrain://brains/{brainId}/thoughts/{thoughtId}/attachments` - Thought attachments
- `thebrain://brains/{brainId}/thoughts/{thoughtId}/graph` - Thought relationship graph

See [RESOURCES.md](RESOURCES.md) for detailed resource documentation and formats.

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Type Checking
```bash
npm run typecheck
```

### Building
```bash
npm run build
```

## Architecture

The server is structured in a modular way:

```
thebrain/
├── src/
│   ├── index.ts              # Main entry point
│   ├── capabilities/         # MCP capabilities
│   ├── thebrain/            # TheBrain API integration
│   ├── auth/                # Authentication implementations
│   ├── transport.ts         # Transport layer
│   └── utils/               # Utilities
└── package.json
```

## Contributing

Please read our contributing guidelines before submitting pull requests.

## License

[License Type] - See LICENSE file for details