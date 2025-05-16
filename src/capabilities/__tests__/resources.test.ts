import { TheBrainResourceProvider } from '../resources';
import { TheBrainClient, Brain, Thought, SearchResult } from '../../thebrain';
import { NotFoundError, TheBrainAPIError } from '../../utils/error-handler';
import logger from '../../utils/logger';

// Mock the logger
jest.mock('../../utils/logger');

// Mock the TheBrain client
jest.mock('../../thebrain');

describe('TheBrainResourceProvider', () => {
  let provider: TheBrainResourceProvider;
  let mockClient: jest.Mocked<TheBrainClient>;

  const mockBrains: Brain[] = [
    {
      id: 'brain-1',
      name: 'Test Brain 1',
      description: 'First test brain',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'brain-2',
      name: 'Test Brain 2',
      description: 'Second test brain',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
  ];

  const mockThought: Thought = {
    id: 'thought-1',
    brainId: 'brain-1',
    name: 'Test Thought',
    label: 'Important thought',
    thoughtType: 'Normal',
    isActive: true,
    isPinned: false,
    color: '#FF0000',
    icon: 'test-icon',
    creationDateTime: '2024-01-01T00:00:00Z',
    modificationDateTime: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockClient = {
      getBrains: jest.fn(),
      getThought: jest.fn(),
      getThoughtChildren: jest.fn(),
      getThoughtParents: jest.fn(),
      getThoughtSiblings: jest.fn(),
      search: jest.fn(),
    } as any;

    provider = new TheBrainResourceProvider(mockClient);
    jest.clearAllMocks();
  });

  describe('getResourceTemplates', () => {
    it('should return all resource templates', async () => {
      const templates = await provider.getResourceTemplates();

      expect(templates).toHaveProperty('brains');
      expect(templates).toHaveProperty('thought');
      expect(templates).toHaveProperty('search');
      expect(templates).toHaveProperty('children');

      expect(templates.brains.uriTemplate).toBe('thebrain://brains');
      expect(templates.thought.uriTemplate).toBe('thebrain://brains/{brainId}/thoughts/{thoughtId}');
      expect(templates.search.uriTemplate).toBe('thebrain://brains/{brainId}/search?q={query}&limit={limit}&types={types}');
      expect(templates.children.uriTemplate).toBe('thebrain://brains/{brainId}/thoughts/{thoughtId}/children');
    });
  });

  describe('getResource', () => {
    describe('brains resource', () => {
      it('should fetch and format brains list', async () => {
        mockClient.getBrains.mockResolvedValue(mockBrains);

        const resource = await provider.getResource('thebrain://brains');

        expect(resource.uri).toBe('thebrain://brains');
        expect(resource.name).toBe('Available Brains');
        expect(resource.mimeType).toBe('application/json');
        
        const contents = JSON.parse((resource.contents as any).text);
        expect(contents.count).toBe(2);
        expect(contents.brains).toHaveLength(2);
        expect(contents.brains[0].id).toBe('brain-1');
        expect(contents.brains[0].uri).toBe('thebrain://brains/brain-1');
      });
    });

    describe('thought resource', () => {
      it('should fetch and format thought with relationships', async () => {
        const childThoughts: Thought[] = [
          { ...mockThought, id: 'child-1', name: 'Child 1' },
          { ...mockThought, id: 'child-2', name: 'Child 2' },
        ];
        const parentThoughts: Thought[] = [
          { ...mockThought, id: 'parent-1', name: 'Parent 1' },
        ];
        const siblingThoughts: Thought[] = [
          { ...mockThought, id: 'sibling-1', name: 'Sibling 1' },
        ];

        mockClient.getThought.mockResolvedValue(mockThought);
        mockClient.getThoughtChildren.mockResolvedValue(childThoughts);
        mockClient.getThoughtParents.mockResolvedValue(parentThoughts);
        mockClient.getThoughtSiblings.mockResolvedValue(siblingThoughts);

        const resource = await provider.getResource('thebrain://brains/brain-1/thoughts/thought-1');

        expect(resource.uri).toBe('thebrain://brains/brain-1/thoughts/thought-1');
        expect(resource.name).toBe('Test Thought');
        expect(resource.description).toBe('Important thought');

        const contents = JSON.parse((resource.contents as any).text);
        expect(contents.thought.id).toBe('thought-1');
        expect(contents.relationships.children).toHaveLength(2);
        expect(contents.relationships.parents).toHaveLength(1);
        expect(contents.relationships.siblings).toHaveLength(1);
        expect(contents.metadata.thoughtType).toBe('Normal');
      });

      it('should handle errors when fetching relationships', async () => {
        mockClient.getThought.mockResolvedValue(mockThought);
        mockClient.getThoughtChildren.mockRejectedValue(new Error('Children fetch failed'));
        mockClient.getThoughtParents.mockRejectedValue(new Error('Parents fetch failed'));
        mockClient.getThoughtSiblings.mockRejectedValue(new Error('Siblings fetch failed'));

        const resource = await provider.getResource('thebrain://brains/brain-1/thoughts/thought-1');

        const contents = JSON.parse((resource.contents as any).text);
        expect(contents.relationships.children).toEqual([]);
        expect(contents.relationships.parents).toEqual([]);
        expect(contents.relationships.siblings).toEqual([]);
      });
    });

    describe('search resource', () => {
      it('should perform search and format results', async () => {
        const searchResult: SearchResult = {
          thoughts: [mockThought],
          links: [{
            id: 'link-1',
            brainId: 'brain-1',
            thoughtIdA: 'thought-1',
            thoughtIdB: 'thought-2',
            relation: 'Parent',
            linkType: 'Normal',
            creationDateTime: '2024-01-01T00:00:00Z',
            modificationDateTime: '2024-01-01T00:00:00Z',
            strength: 75,
          }],
          totalCount: 1,
        };

        mockClient.search.mockResolvedValue(searchResult);

        const resource = await provider.getResource('thebrain://brains/brain-1/search?q=test&limit=10&types=Normal,Type');

        expect(resource.name).toBe('Search: "test"');
        expect(resource.description).toBe('Found 1 results');

        const contents = JSON.parse((resource.contents as any).text);
        expect(contents.query).toBe('test');
        expect(contents.totalCount).toBe(1);
        expect(contents.thoughts).toHaveLength(1);
        expect(contents.links).toHaveLength(1);
        expect(contents.metadata.limit).toBe(10);
        expect(contents.metadata.types).toEqual(['Normal', 'Type']);
      });

      it('should handle search with minimal parameters', async () => {
        const searchResult: SearchResult = {
          thoughts: [],
          links: [],
          totalCount: 0,
        };

        mockClient.search.mockResolvedValue(searchResult);

        const resource = await provider.getResource('thebrain://brains/brain-1/search?q=nonexistent');

        const contents = JSON.parse((resource.contents as any).text);
        expect(contents.query).toBe('nonexistent');
        expect(contents.metadata.limit).toBe(50); // default
        expect(contents.metadata.types).toBeUndefined();
      });
    });

    describe('children resource', () => {
      it('should fetch and format child thoughts', async () => {
        const childThoughts: Thought[] = [
          { ...mockThought, id: 'child-1', name: 'Child 1' },
          { ...mockThought, id: 'child-2', name: 'Child 2' },
        ];

        mockClient.getThought.mockResolvedValue(mockThought);
        mockClient.getThoughtChildren.mockResolvedValue(childThoughts);

        const resource = await provider.getResource('thebrain://brains/brain-1/thoughts/thought-1/children');

        expect(resource.name).toBe('Children of "Test Thought"');
        expect(resource.description).toBe('2 child thought(s)');

        const contents = JSON.parse((resource.contents as any).text);
        expect(contents.parent.id).toBe('thought-1');
        expect(contents.children).toHaveLength(2);
        expect(contents.metadata.childCount).toBe(2);
      });
    });

    it('should handle unknown resource URIs', async () => {
      await expect(provider.getResource('thebrain://unknown')).rejects.toThrow(NotFoundError);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Test error');
      mockClient.getBrains.mockRejectedValue(error);

      await expect(provider.getResource('thebrain://brains')).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith('Error fetching resource', { uri: 'thebrain://brains', error });
    });
  });

  describe('listResources', () => {
    it('should list all available resources', async () => {
      mockClient.getBrains.mockResolvedValue(mockBrains);

      const resources = await provider.listResources();

      expect(resources).toHaveLength(3); // brains list + 2 individual brains
      expect(resources[0].uri).toBe('thebrain://brains');
      expect(resources[1].uri).toBe('thebrain://brains/brain-1');
      expect(resources[2].uri).toBe('thebrain://brains/brain-2');
    });

    it('should handle errors when listing resources', async () => {
      const error = new Error('Failed to get brains');
      mockClient.getBrains.mockRejectedValue(error);

      await expect(provider.listResources()).rejects.toThrow(error);
      expect(logger.error).toHaveBeenCalledWith('Error listing resources', { error });
    });
  });

  describe('subscribeToResource', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.subscribeToResource('thebrain://brains'))
        .rejects.toThrow('Resource subscriptions not currently supported');
    });
  });

  describe('validateResourceUri', () => {
    it('should validate correct URIs', () => {
      expect(provider.validateResourceUri('thebrain://brains')).toBe(true);
      expect(provider.validateResourceUri('thebrain://brains/brain-1')).toBe(true);
      expect(provider.validateResourceUri('thebrain://brains/brain-1/thoughts/thought-1')).toBe(true);
      expect(provider.validateResourceUri('thebrain://brains/brain-1/search?q=test')).toBe(true);
      expect(provider.validateResourceUri('thebrain://brains/brain-1/thoughts/thought-1/children')).toBe(true);
    });

    it('should reject invalid URIs', () => {
      expect(provider.validateResourceUri('invalid://uri')).toBe(false);
      expect(provider.validateResourceUri('thebrain://invalid')).toBe(false);
      expect(provider.validateResourceUri('thebrain://brains/brain-1/invalid')).toBe(false);
    });
  });

  describe('formatThought', () => {
    it('should format thought data for AI consumption', () => {
      const formattedThought = (provider as any).formatThought(mockThought);

      expect(formattedThought).toEqual({
        id: 'thought-1',
        name: 'Test Thought',
        label: 'Important thought',
        type: 'Normal',
        color: '#FF0000',
        icon: 'test-icon',
        uri: 'thebrain://brains/brain-1/thoughts/thought-1',
        isActive: true,
        isPinned: false,
      });
    });
  });
});