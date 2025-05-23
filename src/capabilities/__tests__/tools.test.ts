import { TheBrainToolProvider } from '../tools';
import { TheBrainClient } from '../../thebrain';

// Mock dependencies
jest.mock('../../thebrain');
jest.mock('../../utils/logger');

describe('TheBrainToolProvider', () => {
  let toolProvider: TheBrainToolProvider;
  let mockClient: jest.Mocked<TheBrainClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new TheBrainClient('https://api.bra.in', 'test-key') as jest.Mocked<TheBrainClient>;
    toolProvider = new TheBrainToolProvider(mockClient);
  });
  
  describe('getTools', () => {
    it('should return all available tools', async () => {
      const tools = await toolProvider.getTools();
      
      // Just check that we have multiple tools rather than exact count
      expect(tools.length).toBeGreaterThan(10);
      
      // Check for core tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('create_thought');
      expect(toolNames).toContain('update_thought');
      expect(toolNames).toContain('create_link');
      expect(toolNames).toContain('create_bulk_thoughts');
      expect(toolNames).toContain('list_brains');
      
      // Verify tool structures
      const createThoughtTool = tools.find(t => t.name === 'create_thought');
      expect(createThoughtTool).toBeDefined();
      expect(createThoughtTool?.description).toContain('Create a new thought');
      expect(createThoughtTool?.inputSchema).toBeDefined();
    });
  });
  
  describe('executeTool', () => {
    describe('create_thought', () => {
      it('should create a thought successfully', async () => {
        const mockThought = {
          id: 'thought-123',
          name: 'Test Thought',
          brainId: 'brain-123',
          notes: 'Test notes',
          thoughtType: 'Normal' as const,
          isActive: false,
          isPinned: false,
          tags: ['test'],
          creationDateTime: new Date().toISOString(),
          modificationDateTime: new Date().toISOString()
        };
        
        mockClient.createThought.mockResolvedValue(mockThought);
        
        const result = await toolProvider.executeTool('create_thought', {
          brainId: 'brain-123',
          name: 'Test Thought',
          notes: 'Test notes',
          type: 'Normal',
          tags: ['test']
        });
        
        expect(mockClient.createThought).toHaveBeenCalledWith('brain-123', {
          name: 'Test Thought',
          notes: 'Test notes',
          type: 'Normal',
          tags: ['test']
        });
        
        expect(result.content).toContain('Created thought');
        expect(result.content).toContain('Test Thought');
      });
      
      it('should create thought with parent link', async () => {
        const mockThought = {
          id: 'thought-123',
          name: 'Child Thought',
          brainId: 'brain-123',
          notes: 'Child notes',
          thoughtType: 'Normal' as const,
          isActive: false,
          isPinned: false,
          tags: [],
          creationDateTime: new Date().toISOString(),
          modificationDateTime: new Date().toISOString()
        };
        
        const mockLink = {
          id: 'link-456',
          brainId: 'brain-123',
          thoughtIdA: 'parent-thought',
          thoughtIdB: 'thought-123',
          relation: 'Child' as const,
          linkType: 'Normal' as const,
          creationDateTime: new Date().toISOString(),
          modificationDateTime: new Date().toISOString()
        };
        
        mockClient.createThought.mockResolvedValue(mockThought);
        mockClient.createLink.mockResolvedValue(mockLink);
        
        const result = await toolProvider.executeTool('create_thought', {
          brainId: 'brain-123',
          name: 'Child Thought',
          notes: 'Child notes',
          parentThoughtId: 'parent-thought'
        });
        
        expect(mockClient.createThought).toHaveBeenCalledWith('brain-123', expect.objectContaining({
          name: 'Child Thought',
          notes: 'Child notes'
        }));
        
        expect(mockClient.createLink).toHaveBeenCalledWith('brain-123', {
          thoughtIdA: 'parent-thought',
          thoughtIdB: 'thought-123',
          relation: 1
        });
        
        expect(result.content).toContain('Created thought');
        expect(result.content).toContain('parent connection');
      });
      
      it('should handle creation failure gracefully', async () => {
        const errorMessage = 'Unknown error';
        mockClient.createThought.mockRejectedValue(errorMessage);
        
        const result = await toolProvider.executeTool('create_thought', {
          brainId: 'brain-123',
          name: 'Test Thought'
        });
        
        expect(result.isError).toBe(true);
        expect(result.content).toBe('Error create thought: Unknown error');
      });
    });
    
    describe('update_thought', () => {
      it('should update a thought successfully', async () => {
        const mockThought = {
          id: 'thought-123',
          name: 'Updated Thought',
          brainId: 'brain-123',
          notes: 'Updated notes',
          thoughtType: 'Normal' as const,
          isActive: false,
          isPinned: false,
          tags: ['updated'],
          creationDateTime: new Date().toISOString(),
          modificationDateTime: new Date().toISOString()
        };
        
        mockClient.updateThought.mockResolvedValue(mockThought);
        
        const result = await toolProvider.executeTool('update_thought', {
          brainId: 'brain-123',
          thoughtId: 'thought-123',
          name: 'Updated Thought',
          notes: 'Updated notes',
          tags: ['updated']
        });
        
        expect(mockClient.updateThought).toHaveBeenCalledWith('brain-123', 'thought-123', {
          name: 'Updated Thought',
          notes: 'Updated notes',
          tags: ['updated']
        });
        
        expect(result.content).toContain('Updated thought');
        expect(result.content).toContain('Updated Thought');
      });
      
      it('should handle update failure gracefully', async () => {
        mockClient.updateThought.mockRejectedValue(new Error('Update failed'));
        
        const result = await toolProvider.executeTool('update_thought', {
          brainId: 'brain-123',
          thoughtId: 'thought-123',
          name: 'Updated Thought'
        });
        
        expect(result.isError).toBe(true);
        expect(result.content).toContain('Error update thought');
        expect(result.content).toContain('Update failed');
      });
    });
    
    describe('create_link', () => {
      it('should create a link successfully', async () => {
        const mockLink = {
          id: 'link-123',
          brainId: 'brain-123',
          thoughtIdA: 'thought-1',
          thoughtIdB: 'thought-2',
          relation: 'Parent' as const,
          linkType: 'Normal' as const,
          creationDateTime: new Date().toISOString(),
          modificationDateTime: new Date().toISOString()
        };
        
        const mockThoughtA = { id: 'thought-1', name: 'Thought A' };
        const mockThoughtB = { id: 'thought-2', name: 'Thought B' };
        
        mockClient.createLink.mockResolvedValue(mockLink);
        mockClient.getThought.mockImplementation((brainId, thoughtId) => {
          if (thoughtId === 'thought-1') return Promise.resolve(mockThoughtA as any);
          if (thoughtId === 'thought-2') return Promise.resolve(mockThoughtB as any);
          return Promise.reject(new Error('Thought not found'));
        });
        
        const result = await toolProvider.executeTool('create_link', {
          brainId: 'brain-123',
          thoughtIdA: 'thought-1',
          thoughtIdB: 'thought-2',
          relation: 1
        });
        
        expect(mockClient.createLink).toHaveBeenCalledWith('brain-123', {
          thoughtIdA: 'thought-1',
          thoughtIdB: 'thought-2',
          relation: 1
        });
        
        expect(mockClient.getThought).toHaveBeenCalledTimes(2);
        expect(result.content).toContain('Created link between');
        expect(result.content).toContain('Thought A');
        expect(result.content).toContain('Thought B');
      });
      
      it('should handle link creation failure gracefully', async () => {
        mockClient.createLink.mockRejectedValue(new Error('Link creation failed'));
        
        const result = await toolProvider.executeTool('create_link', {
          brainId: 'brain-123',
          thoughtIdA: 'thought-1',
          thoughtIdB: 'thought-2'
        });
        
        expect(result.isError).toBe(true);
        expect(result.content).toContain('Error create link');
        expect(result.content).toContain('Link creation failed');
      });
    });
    
    it('should throw error for unknown tool', async () => {
      const result = await toolProvider.executeTool('unknown_tool', {});
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Error unknown tool: Unknown tool: unknown_tool');
    });
  });
});