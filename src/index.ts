import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListResourcesRequestSchema, 
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import logger from './utils/logger';
import { handleError } from './utils/error-handler';
import { TheBrainClient } from './thebrain';
import { 
  TheBrainResourceProvider,
  TheBrainToolProvider,
  TheBrainPromptProvider
} from './capabilities';
import { TransportManager } from './transport';

// Initialize the MCP server
const server = new Server(
  {
    name: 'thebrain',
    vendor: 'TheBrain Technologies',
    version: '1.0.0',
    description: 'MCP server for TheBrain knowledge management',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

// Global error handler
server.onerror = (error) => {
  logger.error('Server error:', error);
  // Don't exit on errors in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
};

// Initialize transport manager
const transportManager = new TransportManager(server);

// Initialize the server components
async function initializeServer() {
  try {
    logger.info('Initializing TheBrain MCP server...');
    
    // Initialize TheBrain client
    const apiKey = process.env.THEBRAIN_API_KEY;
    const apiUrl = process.env.THEBRAIN_API_URL || 'https://api.bra.in';
    
    if (!apiKey) {
      throw new Error('THEBRAIN_API_KEY environment variable is required');
    }
    
    const client = new TheBrainClient(apiUrl, apiKey);
    
    // Initialize providers
    const resourceProvider = new TheBrainResourceProvider(client);
    const toolProvider = new TheBrainToolProvider(client);
    const promptProvider = new TheBrainPromptProvider(client);
    
    // Register request handlers for resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: await resourceProvider.listResources() };
    });
    
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      return await resourceProvider.getResource(uri);
    });
    
    // Register request handlers for tools  
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: await toolProvider.getTools() };
    });
    
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await toolProvider.callTool({
        name,
        arguments: args || {}
      });
    });
    
    // Register request handlers for prompts
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: await promptProvider.getPrompts() };
    });
    
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await promptProvider.executePrompt(name, args || {});
    });
    
    logger.info('Server initialization complete');
    logger.info('Request handlers registered for resources, tools, and prompts');
  } catch (error) {
    handleError(error as Error);
  }
}

// Start the server
async function main() {
  try {
    await initializeServer();
    
    // Start the configured transport
    await transportManager.start();
    
    const config = transportManager.getConfig();
    logger.info(`TheBrain MCP server is running in ${config.type} mode`);
    
    if (transportManager.isHttpTransport()) {
      logger.info(`HTTP server listening on ${config.httpHost}:${config.httpPort}`);
      logger.info(`API base path: ${config.basePath}`);
    }
    
    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await transportManager.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});