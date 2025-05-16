#!/bin/bash

# Deployment script for TheBrain MCP Server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Deploying TheBrain MCP Server..."

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then 
   echo -e "${YELLOW}Warning: Running as root is not recommended${NC}"
fi

# Pull latest changes (if using git)
if [ -d .git ]; then
    echo "📦 Pulling latest changes..."
    git pull
fi

# Load production environment
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    echo -e "${RED}Error: .env.production not found${NC}"
    exit 1
fi

# Build production image
echo "🔨 Building production image..."
docker compose -f docker-compose.prod.yml build

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose -f docker-compose.prod.yml down

# Start new containers
echo "🚀 Starting new containers..."
docker compose -f docker-compose.prod.yml up -d

# Wait for health check
echo "🏥 Waiting for health check..."
sleep 5

# Check if container is healthy
if docker compose -f docker-compose.prod.yml ps | grep -q "healthy"; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo "The server is running at http://localhost:${HTTP_PORT:-3000}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Check logs with: docker compose -f docker-compose.prod.yml logs"
    exit 1
fi

# Show running containers
echo ""
echo "📦 Running containers:"
docker compose -f docker-compose.prod.yml ps

# Show recent logs
echo ""
echo "📋 Recent logs:"
docker compose -f docker-compose.prod.yml logs --tail=20