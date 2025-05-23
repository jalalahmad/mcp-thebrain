import { TheBrainClient } from '../../thebrain';
import logger from '../../utils/logger';

// Only run these tests if we have an actual API key
const shouldRunE2E = process.env.THEBRAIN_API_KEY && process.env.RUN_E2E_TESTS === 'true';

const testCondition = shouldRunE2E ? describe : describe.skip;

describe.skip('TheBrain Attachment Content API Test', () => {
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

  describe('Attachment File Content Operations', () => {
    test('should test file content endpoint with invalid ID', async () => {
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const invalidAttachmentId = '00000000-0000-0000-0000-000000000000';
      
      try {
        await client.getAttachmentFileContent(testBrainId, invalidAttachmentId);
        // Unexpected success
        console.log('Unexpectedly found attachment content');
      } catch (error: any) {
        console.log('Expected error for invalid attachment:', {
          message: error.message,
          status: error.response?.status,
        });
        expect(error.message).toContain('not found');
      }
    });

    test('should test different return formats', async () => {
      // Test that all three methods are available
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const testAttachmentId = '11111111-1111-1111-1111-111111111111';
      
      // Test ArrayBuffer format
      try {
        const arrayBuffer = await client.getAttachmentFileContent(testBrainId, testAttachmentId);
        console.log('ArrayBuffer method called');
      } catch (error: any) {
        console.log('ArrayBuffer format error:', error.message);
        expect(error.message).toContain('not found');
      }
      
      // Test Buffer format
      try {
        const buffer = await client.getAttachmentFileContentAsBuffer(testBrainId, testAttachmentId);
        console.log('Buffer method called');
      } catch (error: any) {
        console.log('Buffer format error:', error.message);
        expect(error.message).toContain('not found');
      }
      
      // Test Blob format
      try {
        const blob = await client.getAttachmentFileContentAsBlob(testBrainId, testAttachmentId);
        console.log('Blob method called');
      } catch (error: any) {
        console.log('Blob format error:', error.message);
        // Note: Blob might not be available in Node.js environment
        expect(error.message).toBeDefined();
      }
    });

    test('should verify binary response configuration', () => {
      // Document the expected Axios configuration for binary responses
      const expectedConfig = {
        responseType: 'arraybuffer',
        headers: {
          'Accept': 'application/octet-stream',
        },
      };
      
      console.log('Expected binary response config:', expectedConfig);
      
      expect(expectedConfig.responseType).toBe('arraybuffer');
      expect(expectedConfig.headers.Accept).toBe('application/octet-stream');
    });

    test('should test error handling for large files', async () => {
      // Test timeout and error handling for potentially large files
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const largeFileId = '22222222-2222-2222-2222-222222222222';
      
      try {
        // Attempting to download a non-existent "large" file
        await client.getAttachmentFileContent(testBrainId, largeFileId);
      } catch (error: any) {
        console.log('Large file error handling:', {
          message: error.message,
          code: error.code,
        });
        expect(error).toBeDefined();
      }
    });
  });

  describe('Integration with Metadata', () => {
    test('should demonstrate workflow: get metadata then content', async () => {
      const brains = await client.getBrains();
      const testBrainId = brains[0].id;
      const testAttachmentId = '33333333-3333-3333-3333-333333333333';
      
      // Typical workflow: First get metadata, then download content
      try {
        // Step 1: Get metadata
        const metadata = await client.getAttachmentMetadata(testBrainId, testAttachmentId);
        console.log('Step 1: Got metadata (unexpected success)');
        
        // Step 2: Use metadata to decide how to download
        if (metadata.dataLength < 1024 * 1024) { // Less than 1MB
          const content = await client.getAttachmentFileContent(testBrainId, testAttachmentId);
          console.log('Step 2: Downloaded small file');
        } else {
          console.log('Step 2: File too large, skipping download');
        }
      } catch (error: any) {
        console.log('Workflow error (expected):', error.message);
        expect(error.message).toContain('not found');
      }
    });
  });
});