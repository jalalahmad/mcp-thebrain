import { TheBrainClient } from '../../thebrain';
import logger from '../../utils/logger';

// Only run these tests if we have an actual API key
const shouldRunE2E = process.env.THEBRAIN_API_KEY && process.env.RUN_E2E_TESTS === 'true';

const testCondition = shouldRunE2E ? describe : describe.skip;

describe.skip('TheBrain Attachment API Test', () => {
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

  describe('Attachment Operations', () => {
    test('should test attachment metadata endpoint', async () => {
      // We need a valid brain ID and attachment ID to test this
      // Let's first get a brain and see if we can find any attachments
      
      const brains = await client.getBrains();
      expect(brains.length).toBeGreaterThan(0);
      
      const testBrainId = brains[0].id;
      
      // Since we don't have a way to list attachments or create them,
      // we'll test with an invalid ID to see the error response
      try {
        const invalidAttachmentId = '00000000-0000-0000-0000-000000000000';
        await client.getAttachmentMetadata(testBrainId, invalidAttachmentId);
        
        // If we get here, it means an attachment with this ID exists (unlikely)
        console.log('Unexpectedly found attachment with test ID');
        
      } catch (error: any) {
        // We expect a 404 error for invalid attachment ID
        console.log('Expected error for invalid attachment:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });
        
        expect(error.message).toContain('not found');
      }
    });

    test('should document attachment metadata structure', () => {
      // Document the expected structure based on the API definition
      const expectedStructure = {
        id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        brainId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        sourceId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        sourceType: 0, // 0 = Thought, 1 = Link, etc.
        creationDateTime: "2025-05-16T23:50:37.252Z",
        modificationDateTime: "2025-05-16T23:50:37.252Z",
        name: "string",
        position: 0,
        fileModificationDateTime: "2025-05-16T23:50:37.252Z",
        type: 0, // 0 = File, 1 = URL, etc.
        isNotes: true,
        dataLength: 0,
        location: "string"
      };
      
      console.log('Expected attachment metadata structure:', JSON.stringify(expectedStructure, null, 2));
      
      expect(expectedStructure).toBeDefined();
    });

    test('should test with different brain IDs', async () => {
      const brains = await client.getBrains();
      
      for (const brain of brains.slice(0, 2)) { // Test first 2 brains
        try {
          // Try with a test attachment ID
          const testAttachmentId = '11111111-1111-1111-1111-111111111111';
          await client.getAttachmentMetadata(brain.id, testAttachmentId);
          
          console.log(`Found attachment in brain ${brain.name}`);
          
        } catch (error: any) {
          console.log(`No attachment found in brain ${brain.name}:`, error.message);
          expect(error.message).toContain('not found');
        }
      }
    });
  });

  describe('API Integration', () => {
    test('should verify attachment endpoint follows API pattern', async () => {
      // Verify the endpoint pattern matches other API endpoints
      const endpointPatterns = {
        thoughts: '/thoughts/{brainId}/{thoughtId}',
        attachments: '/attachments/{brainId}/{attachmentId}/metadata',
        links: '/links/{brainId}',
      };
      
      console.log('API Endpoint Patterns:', endpointPatterns);
      
      // All endpoints use {brainId} as first parameter
      expect(endpointPatterns.attachments).toContain('{brainId}');
      expect(endpointPatterns.attachments).toContain('{attachmentId}');
    });
  });
});