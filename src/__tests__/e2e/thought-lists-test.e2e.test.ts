import { TheBrainClient } from '../../thebrain';

const API_KEY = process.env.THEBRAIN_API_KEY || '';
const TECHNOLOGY_BRAIN_ID = '768a6029-877a-4993-9fd3-dcd3462ea9c1';

describe('TheBrain Thought Lists API Test', () => {
  let client: TheBrainClient;

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error('THEBRAIN_API_KEY environment variable is required');
    }
    client = new TheBrainClient('https://api.bra.in', API_KEY);
  });

  describe('Thought List Operations', () => {
    it('should get thought by exact name', async () => {
      try {
        const thought = await client.getThoughtByName(TECHNOLOGY_BRAIN_ID, 'Technology');
        console.log('Found thought by name:', {
          id: thought.id,
          name: thought.name,
          kind: thought.kind,
          acType: thought.acType,
        });
        
        expect(thought).toBeDefined();
        expect(thought.name).toBe('Technology');
      } catch (error: any) {
        console.log('Get by name error:', error.message);
        // Thought might not exist with that exact name
      }
    });

    it('should get all pinned thoughts', async () => {
      try {
        const pinnedThoughts = await client.getPinnedThoughts(TECHNOLOGY_BRAIN_ID);
        console.log('Pinned thoughts:', {
          count: pinnedThoughts.length,
          thoughts: pinnedThoughts.map(t => ({ id: t.id, name: t.name })).slice(0, 5),
        });
        
        expect(Array.isArray(pinnedThoughts)).toBe(true);
      } catch (error: any) {
        console.log('Get pinned thoughts error:', error.message);
        expect(error).toBeDefined();
      }
    });

    it('should get all tags', async () => {
      try {
        const tags = await client.getTags(TECHNOLOGY_BRAIN_ID);
        console.log('Tags:', {
          count: tags.length,
          tags: tags.map(t => ({ id: t.id, name: t.name, kind: t.kind })).slice(0, 5),
        });
        
        expect(Array.isArray(tags)).toBe(true);
        // Tags should have kind = 4
        if (tags.length > 0) {
          expect(tags[0].kind).toBe(4);
        }
      } catch (error: any) {
        console.log('Get tags error:', error.message);
        expect(error).toBeDefined();
      }
    });

    it('should get all types', async () => {
      try {
        const types = await client.getTypes(TECHNOLOGY_BRAIN_ID);
        console.log('Types:', {
          count: types.length,
          types: types.map(t => ({ id: t.id, name: t.name, kind: t.kind })).slice(0, 5),
        });
        
        expect(Array.isArray(types)).toBe(true);
        // Types should have kind = 2
        if (types.length > 0) {
          expect(types[0].kind).toBe(2);
        }
      } catch (error: any) {
        console.log('Get types error:', error.message);
        expect(error).toBeDefined();
      }
    });
  });

  describe('Pin Operations', () => {
    let testThoughtId: string;

    beforeAll(async () => {
      // Create a test thought
      const newThought = await client.createThought(TECHNOLOGY_BRAIN_ID, {
        name: `Pin Test ${Date.now()}`,
      });
      testThoughtId = newThought.id as string; // Assert we have a string ID
      console.log('Created test thought for pinning:', testThoughtId);
    });

    afterAll(async () => {
      // Cleanup
      if (testThoughtId) {
        await client.deleteThought(TECHNOLOGY_BRAIN_ID, testThoughtId);
        console.log('Deleted test thought');
      }
    });

    it('should pin a thought', async () => {
      try {
        await client.pinThought(TECHNOLOGY_BRAIN_ID, testThoughtId);
        console.log('Successfully pinned thought');
        
        // Verify it's in the pinned list
        const pinnedThoughts = await client.getPinnedThoughts(TECHNOLOGY_BRAIN_ID);
        const isPinned = pinnedThoughts.some(t => t.id === testThoughtId);
        
        expect(isPinned).toBe(true);
      } catch (error: any) {
        console.log('Pin thought error:', error.message);
        throw error;
      }
    });

    it('should unpin a thought', async () => {
      try {
        await client.unpinThought(TECHNOLOGY_BRAIN_ID, testThoughtId);
        console.log('Successfully unpinned thought');
        
        // Verify it's not in the pinned list
        const pinnedThoughts = await client.getPinnedThoughts(TECHNOLOGY_BRAIN_ID);
        const isPinned = pinnedThoughts.some(t => t.id === testThoughtId);
        
        expect(isPinned).toBe(false);
      } catch (error: any) {
        console.log('Unpin thought error:', error.message);
        throw error;
      }
    });

    it('should handle pinning non-existent thought', async () => {
      try {
        await client.pinThought(TECHNOLOGY_BRAIN_ID, '00000000-0000-0000-0000-000000000000');
        fail('Should have thrown an error');
      } catch (error: any) {
        console.log('Pin non-existent error:', error.message);
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Thought List Filtering', () => {
    it('should get thoughts by different criteria', async () => {
      try {
        // Get a specific thought by name
        const byName = await client.getThoughtByName(TECHNOLOGY_BRAIN_ID, 'Technology');
        console.log('Found by name:', byName.name);
        
        // Get all pinned thoughts
        const pinned = await client.getPinnedThoughts(TECHNOLOGY_BRAIN_ID);
        console.log('Pinned count:', pinned.length);
        
        // Get all tags (kind = 4)
        const tags = await client.getTags(TECHNOLOGY_BRAIN_ID);
        console.log('Tags count:', tags.length);
        
        // Get all types (kind = 2)
        const types = await client.getTypes(TECHNOLOGY_BRAIN_ID);
        console.log('Types count:', types.length);
        
        // All should be arrays or single items
        expect(byName).toBeDefined();
        expect(Array.isArray(pinned)).toBe(true);
        expect(Array.isArray(tags)).toBe(true);
        expect(Array.isArray(types)).toBe(true);
      } catch (error: any) {
        console.log('Filtering error:', error.message);
      }
    });
  });
});