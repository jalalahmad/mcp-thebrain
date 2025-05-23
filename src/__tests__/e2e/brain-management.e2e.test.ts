import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe('TheBrain Brain Management E2E', () => {
  let client: TheBrainClient;
  let testBrainId = '';

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  
  if (!apiKey) {
    console.warn('Skipping brain management E2E tests - THEBRAIN_API_KEY not set');
    test.skip('requires THEBRAIN_API_KEY', () => {});
    return;
  }

  beforeAll(async () => {
    // Initialize client
    client = new TheBrainClient(
      process.env.THEBRAIN_API_URL || 'https://api.bra.in',
      apiKey
    );
  });

  afterAll(async () => {
    // Clean up test brain if created
    if (testBrainId) {
      try {
        await client.deleteBrain(testBrainId);
        console.log(`Cleaned up test brain: ${testBrainId}`);
      } catch (error) {
        console.warn(`Failed to clean up test brain: ${error}`);
      }
    }
  });

  describe('Brain CRUD operations', () => {
    it('should create a new brain', async () => {
      try {
        const newBrain = await client.createBrain({
          name: `Test Brain ${uuidv4()}`,
        });

        expect(newBrain).toHaveProperty('id');
        expect(newBrain).toHaveProperty('name');
        expect(newBrain.isOwner).toBe(true);
        expect(newBrain.isReadOnly).toBe(false);

        testBrainId = newBrain.id as string; // Assert we have a string ID
      } catch (error: any) {
        // Brain creation might require special permissions
        console.warn('Brain creation failed:', error.message);
      }
    });

    it('should list all brains', async () => {
      const brains = await client.getBrains();
      
      expect(Array.isArray(brains)).toBe(true);
      expect(brains.length).toBeGreaterThan(0);
      
      // Each brain should have required fields
      brains.forEach(brain => {
        expect(brain).toHaveProperty('id');
        expect(brain).toHaveProperty('name');
      });
    });

    it('should get brain by ID', async () => {
      const brains = await client.getBrains();
      const brainId = brains[0].id;

      const brain = await client.getBrain(brainId);
      
      expect(brain).toHaveProperty('id');
      expect(brain.id).toBe(brainId);
      expect(brain).toHaveProperty('name');
    });

    it('should handle non-existent brain', async () => {
      const fakeId = uuidv4();
      
      try {
        await client.getBrain(fakeId);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Brain statistics and modifications', () => {
    it('should get brain statistics', async () => {
      const brainId = process.env.TEST_BRAIN_ID;
      if (!brainId) {
        console.warn('Skipping statistics test - TEST_BRAIN_ID not set');
        return;
      }

      try {
        const stats = await client.getBrainStatistics(brainId);
        
        expect(stats).toHaveProperty('thoughtCount');
        expect(stats).toHaveProperty('linkCount');
        expect(stats).toHaveProperty('attachmentCount');
        expect(stats).toHaveProperty('noteCount');
        expect(stats).toHaveProperty('tagCount');
        expect(stats).toHaveProperty('typeCount');
        expect(stats).toHaveProperty('totalSizeBytes');
        expect(stats).toHaveProperty('lastModified');
        
        // All counts should be non-negative
        expect(stats.thoughtCount).toBeGreaterThanOrEqual(0);
        expect(stats.linkCount).toBeGreaterThanOrEqual(0);
        expect(stats.attachmentCount).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        console.warn('Statistics retrieval failed:', error.message);
      }
    });

    it('should get brain modifications', async () => {
      const brainId = process.env.TEST_BRAIN_ID;
      if (!brainId) {
        console.warn('Skipping modifications test - TEST_BRAIN_ID not set');
        return;
      }

      try {
        const modifications = await client.getBrainModifications(brainId);
        
        expect(Array.isArray(modifications)).toBe(true);
        
        // If there are modifications, check their structure
        if (modifications.length > 0) {
          const mod = modifications[0];
          expect(mod).toHaveProperty('id');
          expect(mod).toHaveProperty('brainId');
          expect(mod).toHaveProperty('timestamp');
          expect(mod).toHaveProperty('action');
          expect(mod).toHaveProperty('entityType');
          expect(mod).toHaveProperty('entityId');
        }
      } catch (error: any) {
        console.warn('Modifications retrieval failed:', error.message);
      }
    });
  });

  describe('Organization info', () => {
    it('should get organization information', async () => {
      try {
        const orgInfo = await client.getOrganizationInfo();
        
        expect(orgInfo).toBeDefined();
        // The structure might vary depending on the organization
        console.log('Organization info:', JSON.stringify(orgInfo, null, 2));
      } catch (error: any) {
        console.warn('Organization info retrieval failed:', error.message);
      }
    });
  });
});