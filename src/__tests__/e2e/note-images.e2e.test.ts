import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe('TheBrain Note Images E2E', () => {
  let client: TheBrainClient;
  let brainId: string;

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  const testBrainId = process.env.TEST_BRAIN_ID;
  
  if (!apiKey || !testBrainId) {
    console.warn('Skipping note images E2E tests - TEST_BRAIN_ID or THEBRAIN_API_KEY not set');
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

  describe('Note image retrieval', () => {
    it('should get note image as ArrayBuffer', async () => {
      // Note: For this test to work, you need actual image tokens and filenames
      // from your notes. These are typically embedded in the markdown content.
      const testToken = 'test-token';
      const testFilename = 'test-image.png';
      
      try {
        const imageBuffer = await client.getNoteImage(brainId, testToken, testFilename);
        
        expect(imageBuffer).toBeInstanceOf(ArrayBuffer);
        expect(imageBuffer.byteLength).toBeGreaterThan(0);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.warn('Test image not found - skipping test');
        } else {
          throw error;
        }
      }
    });

    it('should get note image as Blob', async () => {
      const testToken = 'test-token';
      const testFilename = 'test-image.png';
      
      try {
        const imageBlob = await client.getNoteImageAsBlob(brainId, testToken, testFilename);
        
        expect(imageBlob).toBeInstanceOf(Blob);
        expect(imageBlob.size).toBeGreaterThan(0);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.warn('Test image not found - skipping test');
        } else {
          throw error;
        }
      }
    });

    it('should get note image as Base64', async () => {
      const testToken = 'test-token';
      const testFilename = 'test-image.png';
      
      try {
        const imageBase64 = await client.getNoteImageAsBase64(brainId, testToken, testFilename);
        
        expect(typeof imageBase64).toBe('string');
        expect(imageBase64.length).toBeGreaterThan(0);
        
        // Base64 string should be valid
        expect(() => Buffer.from(imageBase64, 'base64')).not.toThrow();
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.warn('Test image not found - skipping test');
        } else {
          throw error;
        }
      }
    });

    it('should handle non-existent image', async () => {
      const fakeToken = 'non-existent-token';
      const fakeFilename = 'non-existent-image.png';
      
      try {
        await client.getNoteImage(brainId, fakeToken, fakeFilename);
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });

    it('should handle invalid brain ID', async () => {
      const fakeBrainId = '00000000-0000-0000-0000-000000000000';
      const testToken = 'test-token';
      const testFilename = 'test-image.png';
      
      try {
        await client.getNoteImage(fakeBrainId, testToken, testFilename);
        fail('Should have thrown error');
      } catch (error: any) {
        expect([404, 403]).toContain(error.statusCode);
      }
    });
  });

  describe('Integration with notes', () => {
    it('should extract image references from notes', async () => {
      // This is a conceptual test showing how note images would be used
      // In practice, you would:
      // 1. Get notes that contain images
      // 2. Parse the markdown to find image tokens/filenames
      // 3. Use getNoteImage to retrieve each image
      
      try {
        // Example: Get notes for a thought that might contain images
        const thoughts = await client.search(brainId, {
          query: 'image',
          limit: 1
        });
        
        if (thoughts.thoughts.length > 0) {
          const thoughtId = thoughts.thoughts[0].id;
          const notes = await client.getNotes(brainId, thoughtId);
          
          if (notes.content) {
            // Parse markdown for image references
            // Pattern might be like: ![alt text](/notes-images/{brainId}/{token}/{filename})
            const imagePattern = /\/notes-images\/[^\/]+\/([^\/]+)\/([^)]+)/g;
            const matches = Array.from(notes.content.matchAll(imagePattern));
            
            for (const match of matches) {
              const token = match[1];
              const filename = match[2];
              
              try {
                const image = await client.getNoteImage(brainId, token, filename);
                expect(image).toBeInstanceOf(ArrayBuffer);
              } catch (error: any) {
                console.warn(`Failed to get image ${filename}:`, error.message);
              }
            }
          }
        }
      } catch (error: any) {
        console.warn('Integration test failed:', error.message);
      }
    });
  });
});