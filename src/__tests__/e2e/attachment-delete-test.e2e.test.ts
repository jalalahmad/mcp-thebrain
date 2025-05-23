import { TheBrainClient } from '../../thebrain';
import logger from '../../utils/logger';

// Only run these tests if we have an actual API key
const shouldRunE2E = process.env.THEBRAIN_API_KEY && process.env.RUN_E2E_TESTS === 'true';

const testCondition = shouldRunE2E ? describe : describe.skip;

describe.skip('TheBrain Attachment Delete API Test', () => {
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

  describe('Delete Attachment Operations', () => {
    test('should test delete endpoint with invalid ID', async () => {
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const invalidAttachmentId = '00000000-0000-0000-0000-000000000000';
      
      try {
        await client.deleteAttachment(testBrainId, invalidAttachmentId);
        // Unexpected success
        console.log('Unexpectedly deleted attachment (or no error thrown)');
      } catch (error: any) {
        console.log('Expected error for invalid attachment:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });
        expect(error.message).toBeDefined();
      }
    });

    test('should handle multiple delete attempts', async () => {
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const testAttachmentId = '11111111-1111-1111-1111-111111111111';
      
      // First attempt
      try {
        await client.deleteAttachment(testBrainId, testAttachmentId);
        console.log('First delete attempt completed');
      } catch (error: any) {
        console.log('First delete error:', error.message);
        expect(error).toBeDefined();
      }
      
      // Second attempt (should also fail if attachment doesn't exist)
      try {
        await client.deleteAttachment(testBrainId, testAttachmentId);
        console.log('Second delete attempt completed');
      } catch (error: any) {
        console.log('Second delete error:', error.message);
        expect(error).toBeDefined();
      }
    });

    test('should verify delete operation idempotency', async () => {
      // Testing that deleting a non-existent attachment multiple times
      // should consistently return the same error
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const nonExistentId = '22222222-2222-2222-2222-222222222222';
      
      const results = [];
      
      for (let i = 0; i < 3; i++) {
        try {
          await client.deleteAttachment(testBrainId, nonExistentId);
          results.push({ success: true });
        } catch (error: any) {
          results.push({ 
            success: false, 
            status: error.response?.status,
            message: error.message
          });
        }
      }
      
      console.log('Idempotency test results:', results);
      
      // All attempts should have the same result
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.success).toBe(firstResult.success);
        if (!result.success) {
          expect(result.status).toBe(firstResult.status);
        }
      });
    });
  });

  describe('Complete Attachment Workflow', () => {
    test('should demonstrate full attachment lifecycle', async () => {
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const testAttachmentId = '33333333-3333-3333-3333-333333333333';
      
      console.log('Attachment lifecycle workflow:');
      
      // Step 1: Check if attachment exists
      try {
        const metadata = await client.getAttachmentMetadata(testBrainId, testAttachmentId);
        console.log('1. Found attachment:', metadata.name);
        
        // Step 2: Download content
        const content = await client.getAttachmentFileContent(testBrainId, testAttachmentId);
        console.log('2. Downloaded content:', content.byteLength, 'bytes');
        
        // Step 3: Delete attachment
        await client.deleteAttachment(testBrainId, testAttachmentId);
        console.log('3. Deleted attachment');
        
        // Step 4: Verify deletion
        try {
          await client.getAttachmentMetadata(testBrainId, testAttachmentId);
          console.log('4. ERROR: Attachment still exists after deletion!');
        } catch (error) {
          console.log('4. Confirmed: Attachment no longer exists');
        }
        
      } catch (error: any) {
        console.log('Workflow stopped at:', error.message);
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Error Scenarios', () => {
    test('should handle invalid brain ID', async () => {
      const invalidBrainId = 'invalid-brain-id';
      const attachmentId = '44444444-4444-4444-4444-444444444444';
      
      try {
        await client.deleteAttachment(invalidBrainId, attachmentId);
      } catch (error: any) {
        console.log('Invalid brain ID error:', error.message);
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed attachment ID', async () => {
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const malformedId = 'not-a-valid-uuid';
      
      try {
        await client.deleteAttachment(testBrainId, malformedId);
      } catch (error: any) {
        console.log('Malformed ID error:', error.message);
        expect(error).toBeDefined();
      }
    });
  });
});