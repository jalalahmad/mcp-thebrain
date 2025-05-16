#!/bin/bash

# Start the production environment using Docker Compose

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "⚠️  .env.production file not found!"
    echo "Please copy .env.production.example to .env.production and fill in your values."
    exit 1
fi

# Load production environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Validate required variables
if [ -z "$THEBRAIN_API_KEY" ]; then
    echo "❌ THEBRAIN_API_KEY is required in .env.production"
    exit 1
fi

echo "🚀 Starting TheBrain MCP Server in production mode..."
echo "   Transport: $TRANSPORT_TYPE"
echo "   API Key: ${THEBRAIN_API_KEY:0:10}..."
echo "   HTTP Port: $HTTP_PORT"

# Build and start the production container
docker compose -f docker-compose.prod.yml up -d --build

# Show logs
echo ""
echo "📋 Following logs (press Ctrl+C to exit)..."
docker compose -f docker-compose.prod.yml logs -f