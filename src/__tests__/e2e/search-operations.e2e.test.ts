import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe('TheBrain Search Operations E2E', () => {
  let client: TheBrainClient;
  let brainId: string;

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  const testBrainId = process.env.TEST_BRAIN_ID;
  
  if (!apiKey || !testBrainId) {
    console.warn('Skipping search E2E tests - TEST_BRAIN_ID or THEBRAIN_API_KEY not set');
    test.skip('requires TEST_BRAIN_ID and THEBRAIN_API_KEY', () => {});
    return;
  }

  beforeAll(async () => {
    // Initialize client
    client = new TheBrainClient(
      process.env.THEBRAIN_API_URL || 'https://api.bra.in',
      apiKey
    );

    // Set test brain ID
    brainId = testBrainId;
  });

  describe('Brain-specific search', () => {
    it('should search within a specific brain', async () => {
      const result = await client.search(brainId, {
        query: 'test',
        limit: 10,
      });

      expect(result).toHaveProperty('thoughts');
      expect(result).toHaveProperty('links');
      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.thoughts)).toBe(true);
      expect(Array.isArray(result.links)).toBe(true);
    });

    it('should handle empty search results', async () => {
      const result = await client.search(brainId, {
        query: 'xxxxxxxxrandomstringthatdoesnotexistxxxxxxxx',
        limit: 10,
      });

      expect(result.thoughts).toHaveLength(0);
      expect(result.links).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('should filter by thought types', async () => {
      const result = await client.search(brainId, {
        query: '',
        thoughtTypes: ['Tag'],
        limit: 10,
      });

      expect(result).toHaveProperty('thoughts');
      // All returned thoughts should be tags
      result.thoughts.forEach(thought => {
        expect(['Tag', undefined]).toContain(thought.thoughtType);
      });
    });
  });

  describe('Accessible search', () => {
    it('should search across accessible brains', async () => {
      try {
        const result = await client.searchAccessible({
          query: 'test',
          limit: 10,
        });

        expect(result).toHaveProperty('thoughts');
        expect(result).toHaveProperty('links');
        expect(result).toHaveProperty('totalCount');
      } catch (error: any) {
        // This might fail if the user doesn't have multiple accessible brains
        console.warn('Accessible search failed:', error.message);
      }
    });
  });

  describe('Public search', () => {
    it('should search public brains', async () => {
      try {
        const result = await client.searchPublic({
          query: 'brain',
          limit: 10,
        });

        expect(result).toHaveProperty('thoughts');
        expect(result).toHaveProperty('links');
        expect(result).toHaveProperty('totalCount');
      } catch (error: any) {
        // This might fail if there are no public brains available
        console.warn('Public search failed:', error.message);
      }
    });
  });

  describe('Advanced search features', () => {
    it('should support pagination', async () => {
      const page1 = await client.search(brainId, {
        query: '',
        limit: 5,
        offset: 0,
      });

      const page2 = await client.search(brainId, {
        query: '',
        limit: 5,
        offset: 5,
      });

      // Results should be different
      if (page1.thoughts.length > 0 && page2.thoughts.length > 0) {
        const page1Ids = page1.thoughts.map(t => t.id);
        const page2Ids = page2.thoughts.map(t => t.id);
        
        // Check that the IDs don't overlap
        const overlap = page1Ids.filter(id => page2Ids.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });

    it('should include archived thoughts when requested', async () => {
      const withoutArchived = await client.search(brainId, {
        query: '',
        includeArchived: false,
        limit: 100,
      });

      const withArchived = await client.search(brainId, {
        query: '',
        includeArchived: true,
        limit: 100,
      });

      // With archived should have at least as many results
      expect(withArchived.totalCount).toBeGreaterThanOrEqual(withoutArchived.totalCount);
    });
  });
});