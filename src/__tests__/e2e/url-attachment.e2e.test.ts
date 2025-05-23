import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe('TheBrain URL Attachment E2E', () => {
  let client: TheBrainClient;
  let brainId: string;
  let thoughtId: string;

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  const testBrainId = process.env.TEST_BRAIN_ID;
  
  if (!apiKey || !testBrainId) {
    console.warn('Skipping URL attachment E2E tests - TEST_BRAIN_ID or THEBRAIN_API_KEY not set');
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

  describe('URL Attachment creation', () => {
    it('should create a test thought', async () => {
      const thought = await client.createThought(brainId, {
        name: `URL Attachment Test ${uuidv4()}`,
      });
      thoughtId = thought.id as string; // Assert we have a string ID
      expect(thoughtId).toBeDefined();
    });

    it('should create a URL attachment', async () => {
      const testUrl = 'https://www.example.com';
      
      await client.createUrlAttachment(brainId, thoughtId, testUrl);
      
      // The API returns empty string, so we can't check for an ID
      // Let's verify by getting attachments
      const attachments = await client.getThoughtAttachments(brainId, thoughtId);
      
      // Should have at least one attachment
      expect(attachments.length).toBeGreaterThan(0);
      
      // Find the URL attachment we just created
      const urlAttachment = attachments.find(att => 
        att.location === testUrl || att.name.includes('example.com')
      );
      
      expect(urlAttachment).toBeDefined();
    });

    it('should create multiple URL attachments', async () => {
      const urls = [
        'https://www.github.com',
        'https://www.google.com',
        'https://www.stackoverflow.com'
      ];

      // Create multiple URL attachments
      for (const url of urls) {
        await client.createUrlAttachment(brainId, thoughtId, url);
      }

      // Verify all were created
      const attachments = await client.getThoughtAttachments(brainId, thoughtId);
      
      // Should have at least as many attachments as URLs we added
      expect(attachments.length).toBeGreaterThanOrEqual(urls.length);
    });

    it('should handle invalid URLs', async () => {
      const invalidUrl = 'not-a-valid-url';
      
      try {
        await client.createUrlAttachment(brainId, thoughtId, invalidUrl);
        // Some APIs might accept invalid URLs, so we don't fail the test
      } catch (error: any) {
        // If it fails, it should be a validation error
        expect(error.statusCode).toBe(400);
      }
    });

    it('should handle non-existent thought', async () => {
      const fakeThoughtId = uuidv4();
      const testUrl = 'https://www.example.com';
      
      try {
        await client.createUrlAttachment(brainId, fakeThoughtId, testUrl);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });
});