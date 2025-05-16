import MockAdapter from 'axios-mock-adapter';
import { TheBrainClient, CreateThoughtRequest, UpdateThoughtRequest, Thought } from '../client';
import { ValidationError, NotFoundError, TheBrainAPIError } from '../../utils/error-handler';

describe('TheBrain Client - Thought Operations', () => {
  let client: TheBrainClient;
  let mockAxios: MockAdapter;
  const brainId = 'test-brain-id';
  const thoughtId = 'test-thought-id';
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

  describe('getThought', () => {
    const mockThought: Thought = {
      id: thoughtId,
      brainId,
      name: 'Test Thought',
      label: 'Test Label',
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-01T00:00:00Z',
      thoughtType: 'Normal',
      isActive: true,
      isPinned: false,
      color: '#FF0000',
      icon: 'test-icon',
    };

    it('should successfully get a thought', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, mockThought);

      const result = await client.getThought(brainId, thoughtId);

      expect(result).toEqual(mockThought);
      expect(mockAxios.history.get[0].headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}`).reply(404, {
        error: { message: 'Thought not found' },
      });

      await expect(client.getThought(brainId, thoughtId)).rejects.toThrow(NotFoundError);
    });

    it('should handle server errors', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}`).reply(500, {
        error: { message: 'Internal server error' },
      });

      await expect(client.getThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });
  });

  describe('createThought', () => {
    const createRequest: CreateThoughtRequest = {
      name: 'New Thought',
      thoughtType: 'Normal',
      label: 'New Label',
      color: '#00FF00',
      parentThoughtId: 'parent-id',
    };

    const mockCreatedThought: Thought = {
      id: 'new-thought-id',
      brainId,
      name: createRequest.name,
      label: createRequest.label,
      creationDateTime: '2024-01-02T00:00:00Z',
      modificationDateTime: '2024-01-02T00:00:00Z',
      thoughtType: createRequest.thoughtType!,
      isActive: false,
      isPinned: false,
      color: createRequest.color,
    };

    it('should successfully create a thought', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts`).reply(201, mockCreatedThought);

      const result = await client.createThought(brainId, createRequest);

      expect(result).toEqual(mockCreatedThought);
      expect(mockAxios.history.post[0].data).toBe(JSON.stringify(createRequest));
    });

    it('should handle validation errors', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts`).reply(400, {
        error: { message: 'Invalid thought name' },
      });

      await expect(client.createThought(brainId, createRequest)).rejects.toThrow(ValidationError);
    });

    it('should create thought with minimal data', async () => {
      const minimalRequest: CreateThoughtRequest = {
        name: 'Minimal Thought',
      };

      mockAxios.onPost(`/brains/${brainId}/thoughts`).reply(201, {
        ...mockCreatedThought,
        name: minimalRequest.name,
      });

      const result = await client.createThought(brainId, minimalRequest);

      expect(result.name).toBe(minimalRequest.name);
    });
  });

  describe('updateThought', () => {
    const updateRequest: UpdateThoughtRequest = {
      name: 'Updated Thought',
      label: 'Updated Label',
      isPinned: true,
    };

    const mockUpdatedThought: Thought = {
      id: thoughtId,
      brainId,
      name: updateRequest.name!,
      label: updateRequest.label,
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-03T00:00:00Z',
      thoughtType: 'Normal',
      isActive: true,
      isPinned: updateRequest.isPinned!,
      color: '#FF0000',
    };

    it('should successfully update a thought', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, mockUpdatedThought);

      const result = await client.updateThought(brainId, thoughtId, updateRequest);

      expect(result).toEqual(mockUpdatedThought);
      expect(mockAxios.history.patch[0].data).toBe(JSON.stringify(updateRequest));
    });

    it('should handle partial updates', async () => {
      const partialUpdate: UpdateThoughtRequest = {
        isPinned: true,
      };

      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, {
        ...mockUpdatedThought,
        isPinned: true,
      });

      const result = await client.updateThought(brainId, thoughtId, partialUpdate);

      expect(result.isPinned).toBe(true);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(404, {
        error: { message: 'Thought not found' },
      });

      await expect(client.updateThought(brainId, thoughtId, updateRequest)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteThought', () => {
    it('should successfully delete a thought', async () => {
      mockAxios.onDelete(`/brains/${brainId}/thoughts/${thoughtId}`).reply(204);

      await expect(client.deleteThought(brainId, thoughtId)).resolves.toBeUndefined();
      expect(mockAxios.history.delete[0].url).toBe(`/brains/${brainId}/thoughts/${thoughtId}`);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onDelete(`/brains/${brainId}/thoughts/${thoughtId}`).reply(404, {
        error: { message: 'Thought not found' },
      });

      await expect(client.deleteThought(brainId, thoughtId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getThoughtChildren', () => {
    const mockChildren: Thought[] = [
      {
        id: 'child-1',
        brainId,
        name: 'Child 1',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: false,
        isPinned: false,
      },
      {
        id: 'child-2',
        brainId,
        name: 'Child 2',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: false,
        isPinned: true,
      },
    ];

    it('should successfully get thought children', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}/children`).reply(200, mockChildren);

      const result = await client.getThoughtChildren(brainId, thoughtId);

      expect(result).toEqual(mockChildren);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no children exist', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}/children`).reply(200, []);

      const result = await client.getThoughtChildren(brainId, thoughtId);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getThoughtParents', () => {
    const mockParents: Thought[] = [
      {
        id: 'parent-1',
        brainId,
        name: 'Parent 1',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: true,
        isPinned: false,
      },
    ];

    it('should successfully get thought parents', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}/parents`).reply(200, mockParents);

      const result = await client.getThoughtParents(brainId, thoughtId);

      expect(result).toEqual(mockParents);
      expect(result).toHaveLength(1);
    });

    it('should handle multiple parents', async () => {
      const multipleParents = [...mockParents, {
        id: 'parent-2',
        brainId,
        name: 'Parent 2',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Type' as const,
        isActive: false,
        isPinned: true,
      }];

      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}/parents`).reply(200, multipleParents);

      const result = await client.getThoughtParents(brainId, thoughtId);

      expect(result).toHaveLength(2);
      expect(result[1].thoughtType).toBe('Type');
    });
  });

  describe('getThoughtSiblings', () => {
    const mockSiblings: Thought[] = [
      {
        id: 'sibling-1',
        brainId,
        name: 'Sibling 1',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: false,
        isPinned: false,
      },
      {
        id: 'sibling-2',
        brainId,
        name: 'Sibling 2',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Tag',
        isActive: false,
        isPinned: false,
      },
    ];

    it('should successfully get thought siblings', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}/siblings`).reply(200, mockSiblings);

      const result = await client.getThoughtSiblings(brainId, thoughtId);

      expect(result).toEqual(mockSiblings);
      expect(result).toHaveLength(2);
      expect(result[1].thoughtType).toBe('Tag');
    });

    it('should handle thought with no siblings', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}/siblings`).reply(200, []);

      const result = await client.getThoughtSiblings(brainId, thoughtId);

      expect(result).toEqual([]);
    });
  });

  // Integration test for error handling and retries
  describe('Error handling and retries', () => {
    it('should handle network errors', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}`).networkError();

      await expect(client.getThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle timeout errors', async () => {
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}`).timeout();

      await expect(client.getThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should validate response data', async () => {
      // Return invalid data that doesn't match the schema
      mockAxios.onGet(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, {
        invalidField: 'invalid',
        missingRequiredFields: true,
      });

      // The client should throw an error because the response doesn't match the schema
      await expect(client.getThought(brainId, thoughtId)).rejects.toThrow();
    });
  });
});