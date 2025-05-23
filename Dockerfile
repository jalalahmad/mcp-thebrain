# Build stage
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 g++ make

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy the rest of the application
COPY . .

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy all package.json first to take advantage of Docker caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Get the source of thebrain-api package
RUN npm install thebrain-api

# Create special version of thebrain-api with type:commonjs
RUN cd node_modules/thebrain-api && \
    sed -i 's/"type": "module"/"type": "commonjs"/g' package.json && \
    cd ../../

# Make sure we own all dependencies
RUN chown -R root:root node_modules

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port (optional, for HTTP transport)
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Health check (optional)
# HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "dist/index.js"]