/**
 * MCP Integration Tests
 * 
 * These tests verify that the MCP server components work correctly together
 * and follow the MCP protocol specifications.
 */

import { TheBrainToolProvider } from '../../capabilities/tools';
import { TheBrainResourceProvider } from '../../capabilities/resources';
import { TheBrainPromptProvider } from '../../capabilities/prompts';
import { TheBrainClient } from '../../thebrain';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../thebrain');
jest.mock('../../utils/logger');

describe('MCP Server Integration', () => {
  let mockClient: jest.Mocked<TheBrainClient>;
  let toolProvider: TheBrainToolProvider;
  let resourceProvider: TheBrainResourceProvider;
  let promptProvider: TheBrainPromptProvider;

  beforeEach(() => {
    // Create a comprehensive mock client
    mockClient = {
      // Brain operations
      getBrains: jest.fn(),
      getBrain: jest.fn(),
      getBrainStatistics: jest.fn(),
      
      // Thought operations
      createThought: jest.fn(),
      getThought: jest.fn(),
      updateThought: jest.fn(),
      deleteThought: jest.fn(),
      getThoughtParents: jest.fn(),
      getThoughtChildren: jest.fn(),
      getThoughtSiblings: jest.fn(),
      getThoughtAttachments: jest.fn(),
      getTags: jest.fn(),
      getTypes: jest.fn(),
      
      // Link operations
      createLink: jest.fn(),
      getLink: jest.fn(),
      deleteLink: jest.fn(),
      
      // Note operations
      getNotes: jest.fn(),
      updateNotes: jest.fn(),
      appendNotes: jest.fn(),
      
      // Search operations
      search: jest.fn(),
      searchAccessible: jest.fn(),
      searchPublic: jest.fn(),
      
      // Attachment operations
      createAttachment: jest.fn(),
      createUrlAttachment: jest.fn(),
      deleteAttachment: jest.fn(),
    } as any;

    // Create providers
    toolProvider = new TheBrainToolProvider(mockClient);
    resourceProvider = new TheBrainResourceProvider(mockClient);
    promptProvider = new TheBrainPromptProvider(mockClient);
  });

  describe('Tools Provider', () => {
    it('should provide MCP-compliant tool definitions', async () => {
      const tools = await toolProvider.getTools();
      
      // Verify we have tools
      expect(tools.length).toBeGreaterThan(0);
      
      // Verify each tool has required MCP properties
      tools.forEach(tool => {
        expect(tool).toMatchObject({
          name: expect.any(String),
          description: expect.any(String),
          inputSchema: {
            type: 'object',
            properties: expect.any(Object),
            required: expect.any(Array)
          }
        });
      });
    });

    it('should execute tools and return MCP-formatted responses', async () => {
      mockClient.getBrains.mockResolvedValue([
        { id: 'brain-1', name: 'Test Brain' }
      ]);

      const result = await toolProvider.callTool({
        name: 'list_brains',
        arguments: {}
      });

      // Verify MCP response format
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.any(String)
      });

      // Verify the content is valid JSON
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    it('should handle tool errors appropriately', async () => {
      // Test with unknown tool
      await expect(
        toolProvider.callTool({
          name: 'unknown_tool',
          arguments: {}
        })
      ).rejects.toThrow('Unknown tool');

      // Test with missing required parameters
      await expect(
        toolProvider.callTool({
          name: 'create_thought',
          arguments: {} // Missing required fields
        })
      ).rejects.toThrow();
    });
  });

  describe('Resources Provider', () => {
    it('should list available resources', async () => {
      mockClient.getBrains.mockResolvedValue([
        { id: 'brain-1', name: 'Test Brain' }
      ]);

      const resources = await resourceProvider.listResources();
      
      // Should have at least the brains resource
      expect(resources.length).toBeGreaterThan(0);
      
      // Each resource should have required properties
      resources.forEach(resource => {
        expect(resource).toMatchObject({
          uriTemplate: expect.stringMatching(/^thebrain:\/\//),
          name: expect.any(String),
          description: expect.any(String),
          type: 'template'
        });
      });
    });

    it('should read resources with proper format', async () => {
      mockClient.getBrains.mockResolvedValue([
        { id: 'brain-1', name: 'Test Brain' }
      ]);

      const resource = await resourceProvider.getResource('thebrain://brains');
      
      expect(resource).toMatchObject({
        uri: 'thebrain://brains',
        name: expect.any(String),
        contents: {
          type: 'text',
          text: expect.any(String)
        },
        mimeType: 'application/json'
      });

      // Contents should be valid JSON
      const data = JSON.parse((resource.contents as any).text);
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('brains');
    });

    it('should handle invalid resource URIs', async () => {
      await expect(
        resourceProvider.getResource('invalid://uri')
      ).rejects.toThrow('Failed to read resource');
    });
  });

  describe('Prompts Provider', () => {
    it('should list available prompts', async () => {
      const prompts = await promptProvider.getPrompts();
      
      expect(prompts.length).toBeGreaterThan(0);
      
      // Each prompt should have required properties
      prompts.forEach(prompt => {
        expect(prompt).toMatchObject({
          name: expect.any(String),
          description: expect.any(String),
          arguments: expect.any(Array)
        });
        
        // Check arguments structure
        if (prompt.arguments) {
          prompt.arguments.forEach(arg => {
            expect(arg).toMatchObject({
              name: expect.any(String),
              description: expect.any(String),
              required: expect.any(Boolean)
            });
          });
        }
      });
    });

    it('should execute prompts and return content', async () => {
      const result = await promptProvider.executePrompt('search_thoughts', {
        query: 'test query'
      });

      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('test query');
    });

    it('should handle unknown prompts', async () => {
      await expect(
        promptProvider.executePrompt('unknown_prompt', {})
      ).rejects.toThrow('Unknown prompt');
    });
  });

  describe('Cross-Provider Integration', () => {
    it('should work together to provide a complete MCP implementation', async () => {
      // Set up mocks
      mockClient.getBrains.mockResolvedValue([
        { id: 'brain-1', name: 'Integration Test Brain' }
      ]);
      
      mockClient.search.mockResolvedValue([
        { id: 'thought-1', name: 'Test Thought' }
      ]);

      // Tools should be available
      const tools = await toolProvider.getTools();
      expect(tools.find(t => t.name === 'list_brains')).toBeDefined();
      expect(tools.find(t => t.name === 'search_advanced')).toBeDefined();

      // Resources should be available
      const resources = await resourceProvider.listResources();
      expect(resources.find(r => r.uriTemplate === 'thebrain://brains')).toBeDefined();

      // Prompts should be available
      const prompts = await promptProvider.getPrompts();
      expect(prompts.find(p => p.name === 'search_thoughts')).toBeDefined();

      // Execute a tool
      const toolResult = await toolProvider.callTool({
        name: 'list_brains',
        arguments: {}
      });
      expect(toolResult.content[0].text).toContain('Integration Test Brain');

      // Read a resource
      const resourceResult = await resourceProvider.getResource('thebrain://brains');
      const resourceData = JSON.parse((resourceResult.contents as any).text);
      expect(resourceData.brains[0].name).toBe('Integration Test Brain');

      // Execute a prompt
      const promptResult = await promptProvider.executePrompt('search_thoughts', {
        query: 'integration test'
      });
      expect(promptResult.content).toContain('integration test');
    });
  });
});