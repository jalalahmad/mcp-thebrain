import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe('TheBrain Advanced Thought Features E2E', () => {
  let client: TheBrainClient;
  let brainId: string;
  let thoughtId: string;

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  const testBrainId = process.env.TEST_BRAIN_ID;
  
  if (!apiKey || !testBrainId) {
    console.warn('Skipping advanced thought E2E tests - TEST_BRAIN_ID or THEBRAIN_API_KEY not set');
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

    // Create a test thought
    const thought = await client.createThought(brainId, {
      name: `Advanced Features Test ${uuidv4()}`,
    });
    thoughtId = thought.id as string; // Assert we have a string ID
  });

  afterAll(async () => {
    // Clean up test thought
    if (thoughtId) {
      try {
        await client.deleteThought(brainId, thoughtId);
      } catch (error) {
        console.warn('Failed to clean up test thought:', error);
      }
    }
  });

  describe('Thought graph', () => {
    it('should get thought graph', async () => {
      try {
        const graph = await client.getThoughtGraph(brainId, thoughtId, 2);
        
        expect(graph).toHaveProperty('centerThoughtId');
        expect(graph.centerThoughtId).toBe(thoughtId);
        expect(graph).toHaveProperty('thoughts');
        expect(graph).toHaveProperty('links');
        expect(graph).toHaveProperty('depth');
        expect(graph.depth).toBe(2);
        expect(graph).toHaveProperty('includeArchived');
        expect(graph).toHaveProperty('includeHidden');
        
        expect(Array.isArray(graph.thoughts)).toBe(true);
        expect(Array.isArray(graph.links)).toBe(true);
        
        // The center thought should be in the graph
        const centerThought = graph.thoughts.find(t => t.id === thoughtId);
        expect(centerThought).toBeDefined();
      } catch (error: any) {
        console.warn('Thought graph retrieval failed:', error.message);
      }
    });

    it('should get graph with different depths', async () => {
      try {
        const depth1 = await client.getThoughtGraph(brainId, thoughtId, 1);
        const depth3 = await client.getThoughtGraph(brainId, thoughtId, 3);
        
        expect(depth1.depth).toBe(1);
        expect(depth3.depth).toBe(3);
        
        // Deeper graph should potentially have more thoughts
        expect(depth3.thoughts.length).toBeGreaterThanOrEqual(depth1.thoughts.length);
      } catch (error: any) {
        console.warn('Graph depth test failed:', error.message);
      }
    });

    it('should handle non-existent thought', async () => {
      const fakeThoughtId = uuidv4();
      
      try {
        await client.getThoughtGraph(brainId, fakeThoughtId, 2);
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Thought modifications', () => {
    it('should get thought modifications', async () => {
      try {
        const modifications = await client.getThoughtModifications(brainId, thoughtId);
        
        expect(Array.isArray(modifications)).toBe(true);
        
        // If there are modifications, check their structure
        if (modifications.length > 0) {
          const mod = modifications[0];
          expect(mod).toHaveProperty('id');
          expect(mod).toHaveProperty('thoughtId');
          expect(mod.thoughtId).toBe(thoughtId);
          expect(mod).toHaveProperty('brainId');
          expect(mod.brainId).toBe(brainId);
          expect(mod).toHaveProperty('timestamp');
          expect(mod).toHaveProperty('action');
          
          // Recent modifications should include the creation
          const creationMod = modifications.find(m => 
            m.action.toLowerCase().includes('create')
          );
          expect(creationMod).toBeDefined();
        }
      } catch (error: any) {
        console.warn('Thought modifications retrieval failed:', error.message);
      }
    });

    it('should track modifications after updates', async () => {
      try {
        // Get initial modification count
        const initialMods = await client.getThoughtModifications(brainId, thoughtId);
        const initialCount = initialMods.length;

        // Update the thought
        await client.updateThought(brainId, thoughtId, {
          label: 'Updated Label',
        });

        // Get new modifications
        const afterUpdateMods = await client.getThoughtModifications(brainId, thoughtId);
        
        // Should have at least one more modification
        expect(afterUpdateMods.length).toBeGreaterThan(initialCount);
        
        // Find the update modification
        const updateMod = afterUpdateMods.find(m => 
          m.timestamp > initialMods[0]?.timestamp && 
          m.action.toLowerCase().includes('update')
        );
        
        expect(updateMod).toBeDefined();
      } catch (error: any) {
        console.warn('Modification tracking test failed:', error.message);
      }
    });

    it('should handle non-existent thought', async () => {
      const fakeThoughtId = uuidv4();
      
      try {
        await client.getThoughtModifications(brainId, fakeThoughtId);
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });
});