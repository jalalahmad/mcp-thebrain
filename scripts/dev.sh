#!/bin/bash

# Start the development environment using Docker Compose

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Default to HTTP transport for development
export TRANSPORT_TYPE=${TRANSPORT_TYPE:-http}
export THEBRAIN_API_KEY=${THEBRAIN_API_KEY:-test-api-key-12345}

echo "🚀 Starting TheBrain MCP Server in development mode..."
echo "   Transport: $TRANSPORT_TYPE"
echo "   API Key: ${THEBRAIN_API_KEY:0:10}..."

# Build and start the development container
docker compose -f docker-compose.dev.yml up --build

# Cleanup on exit
echo "🛑 Stopping TheBrain MCP Server..."
docker compose -f docker-compose.dev.yml down