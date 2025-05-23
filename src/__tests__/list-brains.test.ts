import { TheBrainClient } from '../thebrain';
import { TheBrainToolProvider } from '../capabilities/tools';
import { TheBrainResourceProvider } from '../capabilities/resources';
import { jest } from '@jest/globals';

// Mock the client
jest.mock('../thebrain');

describe('List Brains Capability', () => {
  let mockClient: any;
  let toolProvider: TheBrainToolProvider;
  let resourceProvider: TheBrainResourceProvider;

  const mockBrains = [
    {
      id: 'brain1',
      name: 'My First Brain',
      description: 'Personal knowledge base',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
    },
    {
      id: 'brain2',
      name: 'Work Brain',
      description: 'Professional projects and notes',
      createdAt: '2024-02-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    mockClient = {
      getBrains: jest.fn(() => Promise.resolve(mockBrains)),
      // Add all required methods for TheBrainClient
      searchThoughts: jest.fn(),
      getThought: jest.fn(),
      createThought: jest.fn(),
      updateThought: jest.fn(),
      createLink: jest.fn(),
      addNoteToThought: jest.fn(),
      getThoughtLinks: jest.fn(),
      getThoughtChildren: jest.fn(),
      getThoughtParents: jest.fn(),
      getThoughtJumps: jest.fn(),
      createBulkThoughts: jest.fn(),
      getAttachments: jest.fn(),
      uploadAttachment: jest.fn(),
      getThoughtGraph: jest.fn(),
      getStatistics: jest.fn(),
      addTag: jest.fn(),
      removeTag: jest.fn(),
      shareThought: jest.fn(),
      exportBrain: jest.fn(),
      importBrain: jest.fn(),
      cloneBrain: jest.fn(),
      backupBrain: jest.fn(),
      getRecent: jest.fn(),
      getPinned: jest.fn(),
      search: jest.fn(),
      getMentions: jest.fn(),
      getRelated: jest.fn(),
      getVersions: jest.fn(),
      getActivity: jest.fn(),
      getLinksTo: jest.fn(),
      bulkDelete: jest.fn(),
      bulkTag: jest.fn(),
      bulkUntag: jest.fn(),
    } as any as jest.Mocked<TheBrainClient>;

    toolProvider = new TheBrainToolProvider(mockClient);
    resourceProvider = new TheBrainResourceProvider(mockClient);
  });

  describe('Tool Provider', () => {
    it('should include list_brains in the available tools', async () => {
      const tools = await toolProvider.getTools();
      const listBrainsTool = tools.find(tool => tool.name === 'list_brains');
      
      expect(listBrainsTool).toBeDefined();
      expect(listBrainsTool?.description).toBe('List all brains in the user\'s TheBrain account');
      expect(listBrainsTool?.inputSchema.properties).toEqual({});
      expect(listBrainsTool?.inputSchema.required).toEqual([]);
    });

    it('should execute list_brains tool successfully', async () => {
      const result = await toolProvider.callTool({
        name: 'list_brains',
        arguments: {},
      });

      expect(mockClient.getBrains).toHaveBeenCalled();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.success).toBe(true);
      expect(resultData.count).toBe(2);
      expect(resultData.brains).toEqual([
        {
          id: 'brain1',
          name: 'My First Brain',
          description: 'Personal knowledge base',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
        },
        {
          id: 'brain2',
          name: 'Work Brain',
          description: 'Professional projects and notes',
          createdAt: '2024-02-01T00:00:00Z',
          updatedAt: '2024-03-01T00:00:00Z',
        },
      ]);
      expect(resultData.message).toBe('Found 2 brains in your account');
    });

    it('should handle empty brain list', async () => {
      mockClient.getBrains.mockResolvedValue([]);
      
      const result = await toolProvider.callTool({
        name: 'list_brains',
        arguments: {},
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.success).toBe(true);
      expect(resultData.count).toBe(0);
      expect(resultData.brains).toEqual([]);
      expect(resultData.message).toBe('Found 0 brains in your account');
    });

    it('should handle single brain correctly', async () => {
      mockClient.getBrains.mockResolvedValue([mockBrains[0]]);
      
      const result = await toolProvider.callTool({
        name: 'list_brains',
        arguments: {},
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.message).toBe('Found 1 brain in your account');
    });

    it('should handle API errors gracefully', async () => {
      mockClient.getBrains.mockRejectedValue(new Error('API connection failed'));
      
      await expect(
        toolProvider.callTool({
          name: 'list_brains',
          arguments: {},
        })
      ).rejects.toThrow('Failed to list brains');
    });
  });

  describe('Resource Provider', () => {
    it('should return brains resource', async () => {
      const resource = await resourceProvider.getResource('thebrain://brains');
      
      expect(resource.uri).toBe('thebrain://brains');
      expect(resource.name).toBe('Available Brains');
      expect(resource.description).toBe('Found 2 brain(s)');
      expect(resource.mimeType).toBe('application/json');
      
      const contents = JSON.parse((resource.contents as any).text);
      expect(contents.count).toBe(2);
      expect(contents.brains).toHaveLength(2);
      expect(contents.brains[0].uri).toBe('thebrain://brains/brain1');
      expect(contents.brains[1].uri).toBe('thebrain://brains/brain2');
    });

    it('should include brains in resource listing', async () => {
      const resources = await resourceProvider.listResources();
      
      // listResources returns templates, not actual resources
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);
      
      const brainsTemplate = resources.find((r: any) => r.name === 'List Brains');
      expect(brainsTemplate).toBeDefined();
      expect(brainsTemplate?.uriTemplate).toBe('thebrain://brains');
    });
  });
});