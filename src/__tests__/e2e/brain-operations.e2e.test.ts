import { TheBrainClient } from '../../thebrain';
import logger from '../../utils/logger';

// Only run these tests if we have an actual API key
const shouldRunE2E = process.env.THEBRAIN_API_KEY && process.env.RUN_E2E_TESTS === 'true';

const testCondition = shouldRunE2E ? describe : describe.skip;

testCondition('TheBrain API - Brain Operations E2E', () => {
  let client: TheBrainClient;
  
  beforeAll(async () => {
    if (!process.env.THEBRAIN_API_KEY) {
      throw new Error('THEBRAIN_API_KEY environment variable is required for E2E tests');
    }
    
    client = new TheBrainClient(
      'https://api.bra.in',
      process.env.THEBRAIN_API_KEY || ''
    );
  });

  describe('Working API Endpoints', () => {
    test('should list all brains', async () => {
      const brains = await client.getBrains();
      
      expect(brains).toBeInstanceOf(Array);
      expect(brains.length).toBeGreaterThan(0);
      
      // Verify brain has expected structure
      const firstBrain = brains[0];
      expect(firstBrain).toHaveProperty('id');
      expect(firstBrain).toHaveProperty('name');
      
      // Log brain structure for documentation
      logger.info('Brain structure:', {
        brain: firstBrain,
        keys: Object.keys(firstBrain),
      });
    });

    test('should get specific brain', async () => {
      // First get list of brains
      const brains = await client.getBrains();
      expect(brains.length).toBeGreaterThan(0);
      
      const firstBrain = brains[0];
      
      // Then get specific brain
      const brain = await client.getBrain(firstBrain.id);
      expect(brain).toBeDefined();
      expect(brain.id).toBe(firstBrain.id);
      expect(brain.name).toBe(firstBrain.name);
    });

    test('should handle brain with homeThoughtId', async () => {
      const brains = await client.getBrains();
      
      // Find a brain with homeThoughtId
      const brainWithHome = brains.find(b => (b as any).homeThoughtId);
      
      if (brainWithHome) {
        expect(brainWithHome).toHaveProperty('homeThoughtId');
        logger.info('Brain with homeThoughtId found:', brainWithHome);
      } else {
        logger.warn('No brain with homeThoughtId found');
      }
    });
  });

  describe('API Limitations', () => {
    test('thought operations are now available via the thebrain-api package', async () => {
      const brains = await client.getBrains();
      const firstBrain = brains[0];
      
      // With the TheBrain adapter using thebrain-api, thought operations are now available
      const thought = await client.createThought(firstBrain.id, { name: 'Test' });
      expect(thought).toBeDefined();
      expect(thought.id).toBeDefined();
      
      // Clean up
      await client.deleteThought(firstBrain.id, thought.id);
      
      logger.info('Confirmed: Thought operations available via thebrain-api package');
    });

    test('should document available vs unavailable endpoints', async () => {
      const results = {
        working: [
          'GET /brains - List all brains',
          'GET /brains/{id} - Get specific brain',
          'POST /brains/{id}/thoughts - via thebrain-api',
          'GET /thoughts/{id} - via thebrain-api',
        ],
        notWorking: [
          'GET /health - 404' // only document endpoints still not working
        ],
      };
      
      logger.info('API Endpoint Status:', results);
      expect(results.working.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Error Handling', () => {
    test('should handle rapid requests gracefully', async () => {
      const startTime = Date.now();
      const promises = Array.from({ length: 5 }, () => client.getBrains());
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(5);
      results.forEach(brains => expect(brains).toBeInstanceOf(Array));
      
      logger.info('Rapid request test completed', { 
        duration,
        requestCount: 5,
        avgTimePerRequest: duration / 5,
      });
    });

    test('should handle invalid brain ID', async () => {
      await expect(
        client.getBrain('invalid-brain-id-12345')
      ).rejects.toThrow();
    });

    test('should handle authentication errors properly', async () => {
      const badClient = new TheBrainClient(
        'https://api.bra.in',
        'invalid-api-key'
      );
      
      await expect(badClient.getBrains()).rejects.toThrow();
    });
  });
});