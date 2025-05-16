import MockAdapter from 'axios-mock-adapter';
import { TheBrainClient, SearchRequest, SearchResult, Thought, Link } from '../client';
import { ValidationError, TheBrainAPIError } from '../../utils/error-handler';

describe('TheBrain Client - Search Operations', () => {
  let client: TheBrainClient;
  let mockAxios: MockAdapter;
  const brainId = 'test-brain-id';
  const apiKey = 'test-api-key';
  const baseUrl = 'https://api.test.bra.in';

  beforeEach(() => {
    client = new TheBrainClient({
      apiKey,
      baseUrl,
      timeout: 5000,
      maxRetries: 0, // Disable retries for tests
    });
    mockAxios = new MockAdapter((client as any).axios);
  });

  afterEach(() => {
    mockAxios.restore();
  });

  describe('search', () => {
    const mockThoughts: Thought[] = [
      {
        id: 'thought-1',
        brainId,
        name: 'Project Alpha',
        label: 'Important project',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: true,
        isPinned: false,
        color: '#FF0000',
      },
      {
        id: 'thought-2',
        brainId,
        name: 'Project Beta',
        creationDateTime: '2024-01-02T00:00:00Z',
        modificationDateTime: '2024-01-02T00:00:00Z',
        thoughtType: 'Type',
        isActive: false,
        isPinned: true,
      },
    ];

    const mockLinks: Link[] = [
      {
        id: 'link-1',
        brainId,
        thoughtIdA: 'thought-1',
        thoughtIdB: 'thought-2',
        relation: 'Parent',
        linkType: 'Normal',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        strength: 75,
      },
    ];

    const mockSearchResult: SearchResult = {
      thoughts: mockThoughts,
      links: mockLinks,
      totalCount: 2,
    };

    it('should successfully search with basic query', async () => {
      const searchRequest: SearchRequest = {
        query: 'project',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, mockSearchResult);

      const result = await client.search(brainId, searchRequest);

      expect(result).toEqual(mockSearchResult);
      expect(result.thoughts).toHaveLength(2);
      expect(result.links).toHaveLength(1);
      expect(result.totalCount).toBe(2);
      
      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.q).toBe('project');
      expect(requestParams.limit).toBe(50); // default
      expect(requestParams.offset).toBe(0); // default
    });

    it('should search with all parameters', async () => {
      const searchRequest: SearchRequest = {
        query: 'alpha',
        limit: 20,
        offset: 10,
        thoughtTypes: ['Normal', 'Type'],
        includeArchived: true,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, mockSearchResult);

      const result = await client.search(brainId, searchRequest);

      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.q).toBe('alpha');
      expect(requestParams.limit).toBe(20);
      expect(requestParams.offset).toBe(10);
      expect(requestParams.thoughtTypes).toBe('Normal,Type');
      expect(requestParams.includeArchived).toBe(true);
    });

    it('should handle empty search results', async () => {
      const emptyResult: SearchResult = {
        thoughts: [],
        links: [],
        totalCount: 0,
      };

      const searchRequest: SearchRequest = {
        query: 'nonexistent',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, emptyResult);

      const result = await client.search(brainId, searchRequest);

      expect(result.thoughts).toEqual([]);
      expect(result.links).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should search with specific thought types', async () => {
      const searchRequest: SearchRequest = {
        query: 'type:tag',
        thoughtTypes: ['Tag'],
      };

      const tagOnlyResult: SearchResult = {
        thoughts: [{
          id: 'tag-1',
          brainId,
          name: 'Important Tag',
          creationDateTime: '2024-01-01T00:00:00Z',
          modificationDateTime: '2024-01-01T00:00:00Z',
          thoughtType: 'Tag',
          isActive: true,
          isPinned: false,
        }],
        links: [],
        totalCount: 1,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, tagOnlyResult);

      const result = await client.search(brainId, searchRequest);

      expect(result.thoughts).toHaveLength(1);
      expect(result.thoughts[0].thoughtType).toBe('Tag');
      
      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.thoughtTypes).toBe('Tag');
    });

    it('should handle pagination', async () => {
      const searchRequest: SearchRequest = {
        query: 'project',
        limit: 10,
        offset: 20,
      };

      const paginatedResult: SearchResult = {
        thoughts: mockThoughts.slice(0, 1),
        links: [],
        totalCount: 50, // Total available results
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, paginatedResult);

      const result = await client.search(brainId, searchRequest);

      expect(result.thoughts).toHaveLength(1);
      expect(result.totalCount).toBe(50);
      
      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.limit).toBe(10);
      expect(requestParams.offset).toBe(20);
    });

    it('should handle complex search queries', async () => {
      const complexSearchRequest: SearchRequest = {
        query: 'project AND (alpha OR beta) NOT archived',
        thoughtTypes: ['Normal', 'Type'],
        includeArchived: false,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, mockSearchResult);

      const result = await client.search(brainId, complexSearchRequest);

      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.q).toBe('project AND (alpha OR beta) NOT archived');
      expect(requestParams.includeArchived).toBe(false);
    });

    it('should handle special characters in search query', async () => {
      const searchRequest: SearchRequest = {
        query: 'C++ programming & "data structures"',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, mockSearchResult);

      await client.search(brainId, searchRequest);

      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.q).toBe('C++ programming & "data structures"');
    });

    it('should handle validation errors', async () => {
      const invalidRequest: SearchRequest = {
        query: '', // Empty query
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(400, {
        error: { message: 'Query cannot be empty' },
      });

      await expect(client.search(brainId, invalidRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle server errors', async () => {
      const searchRequest: SearchRequest = {
        query: 'test',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(500, {
        error: { message: 'Search service unavailable' },
      });

      await expect(client.search(brainId, searchRequest)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle network errors', async () => {
      const searchRequest: SearchRequest = {
        query: 'test',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).networkError();

      await expect(client.search(brainId, searchRequest)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle timeout errors', async () => {
      const searchRequest: SearchRequest = {
        query: 'test',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).timeout();

      await expect(client.search(brainId, searchRequest)).rejects.toThrow(TheBrainAPIError);
    });

    it('should validate response data', async () => {
      const searchRequest: SearchRequest = {
        query: 'test',
      };

      // Return invalid data that doesn't match the schema
      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, {
        invalidField: 'invalid',
        missingRequiredFields: true,
      });

      // The client should throw an error because the response doesn't match the schema
      await expect(client.search(brainId, searchRequest)).rejects.toThrow();
    });

    it('should handle rate limiting', async () => {
      const searchRequest: SearchRequest = {
        query: 'test',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(429, {
        error: { message: 'Too many search requests' },
      });

      await expect(client.search(brainId, searchRequest)).rejects.toThrow(TheBrainAPIError);
    });
  });

  // Edge cases and advanced search scenarios
  describe('Search Operations - Advanced Scenarios', () => {
    // Define mock data for advanced scenarios
    const mockThoughts: Thought[] = [
      {
        id: 'thought-1',
        brainId,
        name: 'Project Alpha',
        label: 'Important project',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: true,
        isPinned: false,
        color: '#FF0000',
      },
      {
        id: 'thought-2',
        brainId,
        name: 'Project Beta',
        creationDateTime: '2024-01-02T00:00:00Z',
        modificationDateTime: '2024-01-02T00:00:00Z',
        thoughtType: 'Type',
        isActive: false,
        isPinned: true,
      },
    ];
    it('should search with date range filters', async () => {
      const searchRequest: SearchRequest = {
        query: 'created:2024-01-01..2024-12-31',
      };

      const dateFilteredResult: SearchResult = {
        thoughts: [{
          id: 'recent-thought',
          brainId,
          name: 'Recent Thought',
          creationDateTime: '2024-06-15T00:00:00Z',
          modificationDateTime: '2024-06-15T00:00:00Z',
          thoughtType: 'Normal',
          isActive: true,
          isPinned: false,
        }],
        links: [],
        totalCount: 1,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, dateFilteredResult);

      const result = await client.search(brainId, searchRequest);

      expect(result.thoughts).toHaveLength(1);
      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.q).toBe('created:2024-01-01..2024-12-31');
    });

    it('should search with field-specific queries', async () => {
      const searchRequest: SearchRequest = {
        query: 'label:"important" AND color:"#FF0000"',
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, {
        thoughts: [],
        links: [],
        totalCount: 0,
      });

      await client.search(brainId, searchRequest);

      const requestParams = mockAxios.history.get[0].params;
      expect(requestParams.q).toBe('label:"important" AND color:"#FF0000"');
    });

    it('should handle archived thoughts inclusion', async () => {
      const searchWithArchived: SearchRequest = {
        query: 'project',
        includeArchived: true,
      };

      const resultWithArchived: SearchResult = {
        thoughts: [
          ...mockThoughts,
          {
            id: 'archived-thought',
            brainId,
            name: 'Archived Project',
            creationDateTime: '2023-01-01T00:00:00Z',
            modificationDateTime: '2023-01-01T00:00:00Z',
            thoughtType: 'Normal',
            isActive: false,
            isPinned: false,
          },
        ],
        links: [],
        totalCount: 3,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, resultWithArchived);

      const result = await client.search(brainId, searchWithArchived);

      expect(result.thoughts).toHaveLength(3);
      expect(result.thoughts.some(t => t.name === 'Archived Project')).toBe(true);
    });

    it('should handle large result sets', async () => {
      const largeSearchRequest: SearchRequest = {
        query: '*',
        limit: 100,
      };

      // Generate a large result set
      const largeThoughts: Thought[] = Array.from({ length: 100 }, (_, i) => ({
        id: `thought-${i}`,
        brainId,
        name: `Thought ${i}`,
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: true,
        isPinned: false,
      }));

      const largeResult: SearchResult = {
        thoughts: largeThoughts,
        links: [],
        totalCount: 1000,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, largeResult);

      const result = await client.search(brainId, largeSearchRequest);

      expect(result.thoughts).toHaveLength(100);
      expect(result.totalCount).toBe(1000);
    });

    it('should handle search with no results but related links', async () => {
      const searchRequest: SearchRequest = {
        query: 'connection',
      };

      const linksOnlyResult: SearchResult = {
        thoughts: [],
        links: [
          {
            id: 'link-1',
            brainId,
            thoughtIdA: 'external-1',
            thoughtIdB: 'external-2',
            relation: 'Parent',
            linkType: 'Normal',
            creationDateTime: '2024-01-01T00:00:00Z',
            modificationDateTime: '2024-01-01T00:00:00Z',
          },
        ],
        totalCount: 0,
      };

      mockAxios.onGet(`/brains/${brainId}/search`).reply(200, linksOnlyResult);

      const result = await client.search(brainId, searchRequest);

      expect(result.thoughts).toHaveLength(0);
      expect(result.links).toHaveLength(1);
      expect(result.totalCount).toBe(0);
    });
  });
});