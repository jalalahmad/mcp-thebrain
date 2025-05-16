import MockAdapter from 'axios-mock-adapter';
import { TheBrainClient, Thought } from '../client';
import { NotFoundError, TheBrainAPIError } from '../../utils/error-handler';
import logger from '../../utils/logger';

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger');

describe('TheBrain Client - Utility Operations', () => {
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
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAxios.restore();
  });

  describe('setActiveThought', () => {
    it('should successfully set active thought', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(200);

      await expect(client.setActiveThought(brainId, thoughtId)).resolves.toBeUndefined();
      
      expect(mockAxios.history.post).toHaveLength(1);
      expect(mockAxios.history.post[0].url).toBe(`/brains/${brainId}/thoughts/${thoughtId}/activate`);
      expect(mockAxios.history.post[0].headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(404, {
        error: { message: 'Thought not found' },
      });

      await expect(client.setActiveThought(brainId, thoughtId)).rejects.toThrow(NotFoundError);
    });

    it('should handle server errors', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(500, {
        error: { message: 'Internal server error' },
      });

      await expect(client.setActiveThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle permission denied', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(403, {
        error: { message: 'Permission denied to activate this thought' },
      });

      await expect(client.setActiveThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle network errors', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).networkError();

      await expect(client.setActiveThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });
  });

  describe('pinThought', () => {
    const pinnedThought: Thought = {
      id: thoughtId,
      brainId,
      name: 'Test Thought',
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-02T00:00:00Z',
      thoughtType: 'Normal',
      isActive: true,
      isPinned: true,
    };

    it('should successfully pin a thought', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, pinnedThought);

      const result = await client.pinThought(brainId, thoughtId);

      expect(result).toEqual(pinnedThought);
      expect(result.isPinned).toBe(true);
      
      const patchData = JSON.parse(mockAxios.history.patch[0].data);
      expect(patchData).toEqual({ isPinned: true });
    });

    it('should handle thought already pinned', async () => {
      // Server returns the same thought already pinned
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, pinnedThought);

      const result = await client.pinThought(brainId, thoughtId);

      expect(result.isPinned).toBe(true);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(404, {
        error: { message: 'Thought not found' },
      });

      await expect(client.pinThought(brainId, thoughtId)).rejects.toThrow(NotFoundError);
    });

    it('should handle server errors', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(500, {
        error: { message: 'Internal server error' },
      });

      await expect(client.pinThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });
  });

  describe('unpinThought', () => {
    const unpinnedThought: Thought = {
      id: thoughtId,
      brainId,
      name: 'Test Thought',
      creationDateTime: '2024-01-01T00:00:00Z',
      modificationDateTime: '2024-01-02T00:00:00Z',
      thoughtType: 'Normal',
      isActive: true,
      isPinned: false,
    };

    it('should successfully unpin a thought', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, unpinnedThought);

      const result = await client.unpinThought(brainId, thoughtId);

      expect(result).toEqual(unpinnedThought);
      expect(result.isPinned).toBe(false);
      
      const patchData = JSON.parse(mockAxios.history.patch[0].data);
      expect(patchData).toEqual({ isPinned: false });
    });

    it('should handle thought already unpinned', async () => {
      // Server returns the same thought already unpinned
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, unpinnedThought);

      const result = await client.unpinThought(brainId, thoughtId);

      expect(result.isPinned).toBe(false);
    });

    it('should handle 404 not found error', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(404, {
        error: { message: 'Thought not found' },
      });

      await expect(client.unpinThought(brainId, thoughtId)).rejects.toThrow(NotFoundError);
    });

    it('should handle server errors', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(500, {
        error: { message: 'Internal server error' },
      });

      await expect(client.unpinThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is healthy', async () => {
      mockAxios.onGet('/health').reply(200, { status: 'ok' });

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockAxios.history.get[0].url).toBe('/health');
    });

    it('should return false when API is unhealthy', async () => {
      mockAxios.onGet('/health').reply(503, { status: 'unhealthy' });

      const result = await client.healthCheck();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Health check failed', expect.any(Object));
    });

    it('should return false on network error', async () => {
      mockAxios.onGet('/health').networkError();

      const result = await client.healthCheck();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Health check failed', expect.any(Object));
    });

    it('should return false on timeout', async () => {
      mockAxios.onGet('/health').timeout();

      const result = await client.healthCheck();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Health check failed', expect.any(Object));
    });

    it('should handle different success response formats', async () => {
      // Some APIs might return different formats
      mockAxios.onGet('/health').reply(200, { healthy: true, timestamp: Date.now() });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should handle partial failures', async () => {
      mockAxios.onGet('/health').reply(200, { 
        status: 'partial', 
        services: {
          api: 'healthy',
          database: 'unhealthy'
        }
      });

      // Even with partial health, we return true if the main endpoint responds with 200
      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should handle 404 as unhealthy', async () => {
      mockAxios.onGet('/health').reply(404);

      const result = await client.healthCheck();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Health check failed', expect.any(Object));
    });
  });

  // Integration tests for utility operations
  describe('Utility Operations - Integration', () => {
    it('should handle pinning and unpinning in sequence', async () => {
      const pinnedThought: Thought = {
        id: thoughtId,
        brainId,
        name: 'Test Thought',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: true,
        isPinned: true,
      };

      const unpinnedThought = { ...pinnedThought, isPinned: false };

      // First pin the thought
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).replyOnce(200, pinnedThought);
      const pinResult = await client.pinThought(brainId, thoughtId);
      expect(pinResult.isPinned).toBe(true);

      // Then unpin it
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).replyOnce(200, unpinnedThought);
      const unpinResult = await client.unpinThought(brainId, thoughtId);
      expect(unpinResult.isPinned).toBe(false);
    });

    it('should handle rate limiting for utility operations', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(429, {
        error: { message: 'Too many requests' },
      });

      await expect(client.setActiveThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle authentication errors', async () => {
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(401, {
        error: { message: 'Invalid API key' },
      });

      await expect(client.setActiveThought(brainId, thoughtId)).rejects.toThrow();
    });
  });

  // Edge cases
  describe('Utility Operations - Edge Cases', () => {
    it('should handle empty response for setActiveThought', async () => {
      // Some APIs might return empty response body with just status
      mockAxios.onPost(`/brains/${brainId}/thoughts/${thoughtId}/activate`).reply(204);

      await expect(client.setActiveThought(brainId, thoughtId)).resolves.toBeUndefined();
    });

    it('should handle concurrent pin/unpin operations', async () => {
      const thought: Thought = {
        id: thoughtId,
        brainId,
        name: 'Test Thought',
        creationDateTime: '2024-01-01T00:00:00Z',
        modificationDateTime: '2024-01-01T00:00:00Z',
        thoughtType: 'Normal',
        isActive: true,
        isPinned: false,
      };

      // Simulate concurrent operations
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(200, thought);

      const operations = [
        client.pinThought(brainId, thoughtId),
        client.unpinThought(brainId, thoughtId),
      ];

      const results = await Promise.allSettled(operations);
      
      // Both should succeed, but the final state depends on which one was processed last
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
    });

    it('should handle system thoughts that cannot be modified', async () => {
      mockAxios.onPatch(`/brains/${brainId}/thoughts/${thoughtId}`).reply(403, {
        error: { message: 'Cannot modify system thought' },
      });

      await expect(client.pinThought(brainId, thoughtId)).rejects.toThrow(TheBrainAPIError);
    });

    it('should handle health check with custom endpoints', async () => {
      // Some deployments might have different health endpoints
      const customClient = new TheBrainClient({
        apiKey,
        baseUrl: 'https://api.test.bra.in/v2',
        timeout: 5000,
        maxRetries: 0,
      });
      const customMockAxios = new MockAdapter((customClient as any).axios);

      customMockAxios.onGet('/health').reply(200);

      const result = await customClient.healthCheck();
      expect(result).toBe(true);

      customMockAxios.restore();
    });
  });
});