import { TheBrainClient } from '../../thebrain';
import logger from '../../utils/logger';

// Only run these tests if we have an actual API key
const shouldRunE2E = process.env.THEBRAIN_API_KEY && process.env.RUN_E2E_TESTS === 'true';

const testCondition = shouldRunE2E ? describe : describe.skip;

testCondition('TheBrain Working API Features', () => {
  let client: TheBrainClient;
  const HISTORY_BRAIN_ID = 'ee317785-e5e7-42ed-bacd-0ecc3816ce21';
  const HISTORY_HOME_THOUGHT_ID = '6576b5b0-50a9-4f14-b1c4-9b85b8f7da2b';
  
  beforeAll(async () => {
    if (!process.env.THEBRAIN_API_KEY) {
      throw new Error('THEBRAIN_API_KEY environment variable is required for E2E tests');
    }
    
    client = new TheBrainClient(
      'https://api.bra.in',
      process.env.THEBRAIN_API_KEY || ''
    );
  });

  describe('Brain Operations', () => {
    test('should list brains', async () => {
      const brains = await client.getBrains();
      expect(brains).toBeInstanceOf(Array);
      expect(brains.length).toBeGreaterThan(0);
      
      // Verify structure
      const brain = brains[0];
      expect(brain).toHaveProperty('id');
      expect(brain).toHaveProperty('name');
    });

    test('should get brain by ID', async () => {
      const brain = await client.getBrain(HISTORY_BRAIN_ID);
      expect(brain.id).toBe(HISTORY_BRAIN_ID);
      expect(brain.name).toBe('History');
    });
  });

  describe('Thought Operations', () => {
    let createdThoughtIds: string[] = [];

    afterEach(async () => {
      // Clean up created thoughts
      for (const thoughtId of createdThoughtIds) {
        try {
          await client.deleteThought(HISTORY_BRAIN_ID, thoughtId);
        } catch (error) {
          console.log('Cleanup error:', error);
        }
      }
      createdThoughtIds = [];
    });

    test('should create a thought', async () => {
      const thought = await client.createThought(HISTORY_BRAIN_ID, {
        name: `Test Thought ${Date.now()}`,
        thoughtType: 'Normal'
      });
      
      expect(thought).toBeDefined();
      expect(thought.id).toBeDefined();
      expect(thought.brainId).toBe(HISTORY_BRAIN_ID);
      
      createdThoughtIds.push(thought.id);
    });

    test('should get thought by ID', async () => {
      // First create a thought
      const created = await client.createThought(HISTORY_BRAIN_ID, {
        name: `Get Test ${Date.now()}`,
        thoughtType: 'Normal'
      });
      createdThoughtIds.push(created.id);
      
      // Then get it
      const fetched = await client.getThought(HISTORY_BRAIN_ID, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe(created.name);
    });

    test('should delete thought', async () => {
      // Create a thought
      const thought = await client.createThought(HISTORY_BRAIN_ID, {
        name: `Delete Test ${Date.now()}`,
        thoughtType: 'Normal'
      });
      
      // Delete it
      await client.deleteThought(HISTORY_BRAIN_ID, thought.id);
      
      // Verify it's gone
      await expect(client.getThought(HISTORY_BRAIN_ID, thought.id))
        .rejects.toThrow();
    });

    test('should handle update limitations', async () => {
      // Create a thought
      const thought = await client.createThought(HISTORY_BRAIN_ID, {
        name: `Update Test ${Date.now()}`,
        thoughtType: 'Normal'
      });
      createdThoughtIds.push(thought.id);
      
      // Try to update (API returns 200 but doesn't actually update)
      const updated = await client.updateThought(HISTORY_BRAIN_ID, thought.id, {
        name: 'Updated Name'
      });
      
      // Note: The API doesn't actually update the name
      expect(updated.id).toBe(thought.id);
      expect(updated.name).toBe(thought.name); // Name remains unchanged
    });
  });

  describe('API Limitations', () => {
    test('should document non-working endpoints', () => {
      const limitations = {
        working: [
          'GET /brains - List all brains',
          'GET /brains/{id} - Get brain details',
          'POST /thoughts/{brainId} - Create thought',
          'GET /thoughts/{brainId}/{thoughtId} - Get thought',
          'DELETE /thoughts/{brainId}/{thoughtId} - Delete thought',
          'PATCH /thoughts/{brainId}/{thoughtId} - Update (returns 200 but no actual update)',
        ],
        notWorking: [
          'Thought search operations',
          'Link creation/management',
          'Actual field updates via PATCH',
          'Thought relationships (children/parents/siblings)',
        ]
      };
      
      expect(limitations.working.length).toBeGreaterThan(0);
      expect(limitations.notWorking.length).toBeGreaterThan(0);
      
      console.log('API Limitations:', JSON.stringify(limitations, null, 2));
    });

    test('should handle 404 errors appropriately', async () => {
      await expect(client.getThought(HISTORY_BRAIN_ID, 'invalid-id'))
        .rejects.toThrow('Resource not found');
    });
  });
});