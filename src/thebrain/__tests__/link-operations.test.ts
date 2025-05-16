import MockAdapter from 'axios-mock-adapter';
import { TheBrainClient, CreateLinkRequest, Link } from '../client';
import { ValidationError, NotFoundError, TheBrainAPIError } from '../../utils/error-handler';

describe('TheBrain Client - Link Operations', () => {
  let client: TheBrainClient;
  let mockAxios: MockAdapter;
  const brainId = 'test-brain-id';
  const linkId = 'test-link-id';
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

  describe('createLink', () => {
    const createRequest: CreateLinkRequest = {
      thoughtIdA: 'thought-a-id',
      thoughtIdB: 'thought-b-id',
      relation: 'Parent',
      linkType: 'Normal',
      strength: 75,
    };

    const mockCreatedLink: Link = {
      id: 'new-link-id',
      brainId,
      thoughtIdA: createRequest.thoughtIdA,
      thoughtIdB: createRequest.thoughtIdB,
      relation: createRequest.relation,
      linkType: createRequest.linkType!,
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-01T00:00:00Z',
      strength: createRequest.strength,
    };

    it('should successfully create a link', async () => {
      mockAxios.onPost(`/brains/${brainId}/links`).reply(201, mockCreatedLink);

      const result = await client.createLink(brainId, createRequest);

      expect(result).toEqual(mockCreatedLink);
      expect(mockAxios.history.post[0].data).toBe(JSON.stringify(createRequest));
      expect(mockAxios.history.post[0].headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('should handle validation errors', async () => {
      mockAxios.onPost(`/brains/${brainId}/links`).reply(400, {
        error: { message: 'Invalid link parameters' },
      });

      await expect(client.createLink(brainId, createRequest)).rejects.toThrow(ValidationError);
    });

    it('should create link with minimal data', async () => {
      const minimalRequest: CreateLinkRequest = {
        thoughtIdA: 'thought-a-id',
        thoughtIdB: 'thought-b-id',
        relation: 'Child',
      };

      const minimalLink: Link = {
        ...mockCreatedLink,
        relation: 'Child',
        linkType: 'Normal',
        strength: undefined,
      };

      mockAxios.onPost(`/brains/${brainId}/links`).reply(201, minimalLink);

      const result = await client.createLink(brainId, minimalRequest);

      expect(result.relation).toBe('Child');
      expect(result.linkType).toBe('Normal');
      expect(result.strength).toBeUndefined();
    });

    it('should handle duplicate link error', async () => {
      mockAxios.onPost(`/brains/${brainId}/links`).reply(409, {
        error: { message: 'Link already exists between these thoughts' },
      });

      await expect(client.createLink(brainId, createRequest)).rejects.toThrow(TheBrainAPIError);
    });

    it('should create jump link', async () => {
      const jumpLinkRequest: CreateLinkRequest = {
        thoughtIdA: 'thought-a-id',
        thoughtIdB: 'thought-b-id',
        relation: 'Jump',
        linkType: 'Jump',
      };

      const jumpLink: Link = {
        ...mockCreatedLink,
        relation: 'Jump',
        linkType: 'Jump',
      };

      mockAxios.onPost(`/brains/${brainId}/links`).reply(201, jumpLink);

      const result = await client.createLink(brainId, jumpLinkRequest);

      expect(result.relation).toBe('Jump');
      expect(result.linkType).toBe('Jump');
    });
  });

  describe('updateLink', () => {
    const updateRequest: Partial<CreateLinkRequest> = {
      strength: 90,
      linkType: 'Jump',
    };

    const mockUpdatedLink: Link = {
      id: linkId,
      brainId,
      thoughtIdA: 'thought-a-id',
      thoughtIdB: 'thought-b-id',
      relation: 'Parent',
      linkType: 'Jump',
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-02T00:00:00Z',
      strength: 90,
    };

    it('should successfully update a link', async () => {
      mockAxios.onPatch(`/brains/${brainId}/links/${linkId}`).reply(200, mockUpdatedLink);

      const result = await client.updateLink(brainId, linkId, updateRequest);

      expect(result).toEqual(mockUpdatedLink);
      expect(mockAxios.history.patch[0].data).toBe(JSON.stringify(updateRequest));
    });

    it('should handle partial updates', async () => {
      const partialUpdate: Partial<CreateLinkRequest> = {
        strength: 50,
      };

      const partiallyUpdatedLink: Link = {
        ...mockUpdatedLink,
        linkType: 'Normal',
        strength: 50,
      };

      mockAxios.onPatch(`/brains/${brainId}/links/${linkId}`).reply(200, partiallyUpdatedLink);

      const result = await client.updateLink(brainId, linkId, partialUpdate);

      expect(result.strength).toBe(50);
      expect(result.linkType).toBe('Normal');
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onPatch(`/brains/${brainId}/links/${linkId}`).reply(404, {
        error: { message: 'Link not found' },
      });

      await expect(client.updateLink(brainId, linkId, updateRequest)).rejects.toThrow(NotFoundError);
    });

    it('should handle invalid strength value', async () => {
      const invalidRequest: Partial<CreateLinkRequest> = {
        strength: 150, // Invalid: > 100
      };

      mockAxios.onPatch(`/brains/${brainId}/links/${linkId}`).reply(400, {
        error: { message: 'Strength must be between 0 and 100' },
      });

      await expect(client.updateLink(brainId, linkId, invalidRequest)).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteLink', () => {
    it('should successfully delete a link', async () => {
      mockAxios.onDelete(`/brains/${brainId}/links/${linkId}`).reply(204);

      await expect(client.deleteLink(brainId, linkId)).resolves.toBeUndefined();
      expect(mockAxios.history.delete[0].url).toBe(`/brains/${brainId}/links/${linkId}`);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onDelete(`/brains/${brainId}/links/${linkId}`).reply(404, {
        error: { message: 'Link not found' },
      });

      await expect(client.deleteLink(brainId, linkId)).rejects.toThrow(NotFoundError);
    });

    it('should handle forbidden deletion', async () => {
      mockAxios.onDelete(`/brains/${brainId}/links/${linkId}`).reply(403, {
        error: { message: 'Cannot delete system link' },
      });

      await expect(client.deleteLink(brainId, linkId)).rejects.toThrow(TheBrainAPIError);
    });
  });

  describe('getLink', () => {
    const mockLink: Link = {
      id: linkId,
      brainId,
      thoughtIdA: 'thought-a-id',
      thoughtIdB: 'thought-b-id',
      relation: 'Parent',
      linkType: 'Normal',
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-01T00:00:00Z',
      strength: 80,
    };

    it('should successfully get a link', async () => {
      mockAxios.onGet(`/brains/${brainId}/links/${linkId}`).reply(200, mockLink);

      const result = await client.getLink(brainId, linkId);

      expect(result).toEqual(mockLink);
      expect(mockAxios.history.get[0].headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onGet(`/brains/${brainId}/links/${linkId}`).reply(404, {
        error: { message: 'Link not found' },
      });

      await expect(client.getLink(brainId, linkId)).rejects.toThrow(NotFoundError);
    });

    it('should handle server errors', async () => {
      mockAxios.onGet(`/brains/${brainId}/links/${linkId}`).reply(500, {
        error: { message: 'Internal server error' },
      });

      await expect(client.getLink(brainId, linkId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should get link without strength', async () => {
      const linkWithoutStrength: Link = {
        ...mockLink,
        strength: undefined,
      };

      mockAxios.onGet(`/brains/${brainId}/links/${linkId}`).reply(200, linkWithoutStrength);

      const result = await client.getLink(brainId, linkId);

      expect(result.strength).toBeUndefined();
      expect(result.relation).toBe('Parent');
    });
  });

  // Integration tests for error handling and edge cases
  describe('Link Operations - Error Handling', () => {
    it('should handle network errors during link creation', async () => {
      const request: CreateLinkRequest = {
        thoughtIdA: 'thought-a-id',
        thoughtIdB: 'thought-b-id',
        relation: 'Parent',
      };

      mockAxios.onPost(`/brains/${brainId}/links`).networkError();

      await expect(client.createLink(brainId, request)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle timeout errors during link update', async () => {
      mockAxios.onPatch(`/brains/${brainId}/links/${linkId}`).timeout();

      await expect(client.updateLink(brainId, linkId, { strength: 50 })).rejects.toThrow(TheBrainAPIError);
    });

    it('should validate response data for links', async () => {
      // Return invalid data that doesn't match the schema
      mockAxios.onGet(`/brains/${brainId}/links/${linkId}`).reply(200, {
        invalidField: 'invalid',
        missingRequiredFields: true,
      });

      // The client should throw an error because the response doesn't match the schema
      await expect(client.getLink(brainId, linkId)).rejects.toThrow();
    });

    it('should handle rate limiting', async () => {
      mockAxios.onPost(`/brains/${brainId}/links`).reply(429, {
        error: { message: 'Too many requests' },
      });

      const request: CreateLinkRequest = {
        thoughtIdA: 'thought-a-id',
        thoughtIdB: 'thought-b-id',
        relation: 'Child',
      };

      await expect(client.createLink(brainId, request)).rejects.toThrow(TheBrainAPIError);
    });
  });

  // Edge cases and business logic tests
  describe('Link Operations - Edge Cases', () => {
    it('should handle circular link prevention', async () => {
      const circularRequest: CreateLinkRequest = {
        thoughtIdA: 'thought-a',
        thoughtIdB: 'thought-a', // Same as A
        relation: 'Parent',
      };

      mockAxios.onPost(`/brains/${brainId}/links`).reply(400, {
        error: { message: 'Cannot create circular link' },
      });

      await expect(client.createLink(brainId, circularRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle link type restrictions', async () => {
      const invalidTypeRequest: CreateLinkRequest = {
        thoughtIdA: 'thought-a-id',
        thoughtIdB: 'thought-b-id',
        relation: 'Parent',
        linkType: 'Jump', // Jump type not allowed for Parent relation
      };

      mockAxios.onPost(`/brains/${brainId}/links`).reply(400, {
        error: { message: 'Jump link type not allowed for Parent relation' },
      });

      await expect(client.createLink(brainId, invalidTypeRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle updating immutable link properties', async () => {
      // Attempting to update thoughtIdA/B which are immutable
      const invalidUpdate = {
        thoughtIdA: 'new-thought-id',
      };

      mockAxios.onPatch(`/brains/${brainId}/links/${linkId}`).reply(400, {
        error: { message: 'Cannot update linked thoughts' },
      });

      await expect(client.updateLink(brainId, linkId, invalidUpdate as any)).rejects.toThrow(ValidationError);
    });
  });
});