#!/usr/bin/env node

/**
 * Example of using TheBrain MCP Server with different transport configurations
 */

import { spawn } from 'child_process';
import axios from 'axios';

// Example 1: Using Stdio Transport
async function runStdioExample() {
  console.log('\n=== Running Stdio Transport Example ===\n');
  
  const env = {
    ...process.env,
    TRANSPORT_TYPE: 'stdio',
    THEBRAIN_API_KEY: 'your-api-key-here'
  };
  
  const child = spawn('node', ['dist/index.js'], { env });
  
  child.stdout.on('data', (data) => {
    console.log(`[STDIO] ${data}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`[STDIO ERROR] ${data}`);
  });
  
  // Simulate some input
  setTimeout(() => {
    child.stdin.write(JSON.stringify({ method: 'info', id: 1 }) + '\n');
  }, 1000);
  
  // Stop after 3 seconds
  setTimeout(() => {
    child.kill('SIGTERM');
  }, 3000);
}

// Example 2: Using HTTP Transport
async function runHttpExample() {
  console.log('\n=== Running HTTP Transport Example ===\n');
  
  const env = {
    ...process.env,
    TRANSPORT_TYPE: 'http',
    HTTP_PORT: '8080',
    HTTP_HOST: 'localhost',
    THEBRAIN_API_KEY: 'your-api-key-here'
  };
  
  const child = spawn('node', ['dist/index.js'], { env });
  
  child.stdout.on('data', (data) => {
    console.log(`[HTTP] ${data}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`[HTTP ERROR] ${data}`);
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Test health endpoint
    const health = await axios.get('http://localhost:8080/health');
    console.log('\nHealth Check:', JSON.stringify(health.data, null, 2));
    
    // Test info endpoint
    const info = await axios.get('http://localhost:8080/api/v1/info');
    console.log('\nAPI Info:', JSON.stringify(info.data, null, 2));
    
    // Test resources endpoint
    const resources = await axios.get('http://localhost:8080/api/v1/resources');
    console.log('\nResources:', JSON.stringify(resources.data, null, 2));
    
    // Test tools endpoint
    const tools = await axios.get('http://localhost:8080/api/v1/tools');
    console.log('\nTools:', JSON.stringify(tools.data, null, 2));
    
    // Test prompts endpoint
    const prompts = await axios.get('http://localhost:8080/api/v1/prompts');
    console.log('\nPrompts:', JSON.stringify(prompts.data, null, 2));
    
  } catch (error: any) {
    console.error('API Error:', error.message);
  }
  
  // Stop server
  setTimeout(() => {
    child.kill('SIGTERM');
  }, 5000);
}

// Example 3: Using Docker with HTTP Transport
function showDockerExample() {
  console.log('\n=== Docker HTTP Transport Example ===\n');
  console.log(`
# Build the Docker image
docker build -t thebrain-mcp .

# Run with HTTP transport
docker run -d \\
  --name thebrain-server \\
  -p 8080:8080 \\
  -e TRANSPORT_TYPE=http \\
  -e HTTP_PORT=8080 \\
  -e THEBRAIN_API_KEY=your-api-key \\
  thebrain-mcp

# Test the endpoints
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/info

# View logs
docker logs thebrain-server

# Stop the container
docker stop thebrain-server
docker rm thebrain-server
  `);
}

// Example 4: Development with hot reload
function showDevExample() {
  console.log('\n=== Development Example with Hot Reload ===\n');
  console.log(`
# Start with stdio transport (default)
npm run dev

# Start with HTTP transport
TRANSPORT_TYPE=http npm run dev

# With custom port
TRANSPORT_TYPE=http HTTP_PORT=8080 npm run dev

# With debug logging
DEBUG=thebrain:* TRANSPORT_TYPE=http npm run dev
  `);
}

// Main execution
async function main() {
  console.log('TheBrain MCP Server Transport Examples');
  console.log('=====================================');
  
  // Run examples based on command line argument
  const example = process.argv[2];
  
  switch (example) {
    case 'stdio':
      await runStdioExample();
      break;
    case 'http':
      await runHttpExample();
      break;
    case 'docker':
      showDockerExample();
      break;
    case 'dev':
      showDevExample();
      break;
    default:
      console.log('\nUsage: ts-node transport-example.ts [stdio|http|docker|dev]\n');
      console.log('Examples:');
      console.log('  stdio  - Run with stdio transport');
      console.log('  http   - Run with HTTP transport');
      console.log('  docker - Show Docker deployment example');
      console.log('  dev    - Show development setup');
  }
}

// Run the example
main().catch(console.error);