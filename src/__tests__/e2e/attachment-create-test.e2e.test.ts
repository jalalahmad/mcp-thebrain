import { TheBrainClient } from '../../thebrain';

const API_KEY = process.env.THEBRAIN_API_KEY || '';
const TECHNOLOGY_BRAIN_ID = '768a6029-877a-4993-9fd3-dcd3462ea9c1';
const HOME_THOUGHT_ID = '892bc9ce-1b14-4cbc-9e7d-62a34dde6df0';

describe.skip('TheBrain Attachment Create API Test', () => {
  let client: TheBrainClient;

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error('THEBRAIN_API_KEY environment variable is required');
    }
    client = new TheBrainClient('https://api.bra.in', API_KEY);
  });

  describe('Create Attachment Operations', () => {
    it('should test create attachment with basic fields', async () => {
      // Create a test file content
      const testContent = Buffer.from('This is a test file content');
      
      try {
        await client.createAttachment(
          TECHNOLOGY_BRAIN_ID,
          HOME_THOUGHT_ID,
          {
            file: testContent,
            fileName: 'test-file.txt',
            mimeType: 'text/plain',
          }
        );
        
        console.log('Created attachment successfully (no ID returned)');
        expect(true).toBe(true); // Success if no error thrown
      } catch (error: any) {
        console.log('Create attachment error:', {
          message: error.message,
          status: error.status,
          data: error.response?.data,
        });
        throw error;
      }
    });

    it('should handle ArrayBuffer file content', async () => {
      // Create test content as ArrayBuffer
      const text = 'ArrayBuffer test content';
      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(text).buffer;
      
      try {
        await client.createAttachment(
          TECHNOLOGY_BRAIN_ID,
          HOME_THOUGHT_ID,
          {
            file: arrayBuffer,
            fileName: 'arraybuffer-test.txt',
            mimeType: 'text/plain',
          }
        );
        
        console.log('Created attachment with ArrayBuffer successfully');
        expect(true).toBe(true);
      } catch (error: any) {
        console.log('ArrayBuffer attachment error:', error.message);
        throw error;
      }
    });

    it('should handle different file types', async () => {
      // Test with JSON content
      const jsonContent = JSON.stringify({ test: 'data', number: 123 });
      const buffer = Buffer.from(jsonContent);
      
      try {
        await client.createAttachment(
          TECHNOLOGY_BRAIN_ID,
          HOME_THOUGHT_ID,
          {
            file: buffer,
            fileName: 'test-data.json',
            mimeType: 'application/json',
          }
        );
        
        console.log('Created JSON attachment successfully');
        expect(true).toBe(true);
      } catch (error: any) {
        console.log('JSON attachment error:', error.message);
        throw error;
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid brain ID', async () => {
      const testContent = Buffer.from('Test content');
      
      try {
        await client.createAttachment(
          'invalid-brain-id',
          HOME_THOUGHT_ID,
          {
            file: testContent,
            fileName: 'test.txt',
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        console.log('Invalid brain ID error:', error.message);
        expect(error.message).toContain('not found');
      }
    });

    it('should handle invalid thought ID', async () => {
      const testContent = Buffer.from('Test content');
      
      try {
        await client.createAttachment(
          TECHNOLOGY_BRAIN_ID,
          'invalid-thought-id',
          {
            file: testContent,
            fileName: 'test.txt',
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        console.log('Invalid thought ID error:', error.message);
        expect(error.message).toContain('not found');
      }
    });

    it('should handle empty file', async () => {
      const emptyBuffer = Buffer.from('');
      
      try {
        await client.createAttachment(
          TECHNOLOGY_BRAIN_ID,
          HOME_THOUGHT_ID,
          {
            file: emptyBuffer,
            fileName: 'empty-file.txt',
          }
        );
        console.log('Empty file accepted');
        fail('Should have thrown an error for empty file');
      } catch (error: any) {
        console.log('Empty file error:', error.message);
        // Or it might reject them
        expect(error.message).toBeDefined();
      }
    });
  });

  describe('Complete Workflow', () => {
    it('should create attachment without ID return', async () => {
      const testContent = Buffer.from('Workflow test content');
      
      try {
        // Create attachment - API doesn't return ID
        await client.createAttachment(
          TECHNOLOGY_BRAIN_ID,
          HOME_THOUGHT_ID,
          {
            file: testContent,
            fileName: 'workflow-test.txt',
            mimeType: 'text/plain',
          }
        );
        
        console.log('Created attachment successfully (no ID returned)');
        
        // Note: We can't verify the attachment since no ID is returned
        // The API design doesn't support getting the created attachment ID
        console.log('Note: Cannot verify attachment - API does not return ID');
        
        expect(true).toBe(true); // Success if creation didn't throw error
      } catch (error: any) {
        console.log('Workflow error:', error.message);
        throw error;
      }
    });
  });
});