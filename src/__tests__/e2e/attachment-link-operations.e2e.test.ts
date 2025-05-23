import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe.skip('TheBrain Attachment and Link Operations E2E', () => {
  let client: TheBrainClient;
  let brainId: string;
  let thoughtId1: string;
  let thoughtId2: string;
  let linkId: string;

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  const testBrainId = process.env.TEST_BRAIN_ID;
  
  if (!apiKey || !testBrainId) {
    console.warn('Skipping attachment/link E2E tests - TEST_BRAIN_ID or THEBRAIN_API_KEY not set');
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

  describe('Setup test thoughts and links', () => {
    it('should create test thoughts', async () => {
      // Create two test thoughts
      const thought1 = await client.createThought(brainId, {
        name: `Test Thought 1 ${uuidv4()}`,
      });
      thoughtId1 = thought1.id;

      const thought2 = await client.createThought(brainId, {
        name: `Test Thought 2 ${uuidv4()}`,
      });
      thoughtId2 = thought2.id;

      expect(thoughtId1).toBeDefined();
      expect(thoughtId2).toBeDefined();
    });

    it('should create a link between thoughts', async () => {
      // Create a link between the two thoughts
      const link = await client.createLink(brainId, {
        thoughtIdA: thoughtId1,
        thoughtIdB: thoughtId2,
        relation: 'Child',
      });
      linkId = link.id as string; // Assert we have a string ID

      expect(linkId).toBeDefined();
    });
  });

  describe('Thought Attachments', () => {
    it('should get attachments for a thought', async () => {
      // First create an attachment (if needed)
      const attachments = await client.getThoughtAttachments(brainId, thoughtId1);
      
      expect(Array.isArray(attachments)).toBe(true);
      // The array may be empty if no attachments exist
    });

    it('should return empty array for thought with no attachments', async () => {
      const attachments = await client.getThoughtAttachments(brainId, thoughtId2);
      
      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments.length).toBe(0);
    });

    it('should handle non-existent thought', async () => {
      const fakeId = uuidv4();
      
      try {
        await client.getThoughtAttachments(brainId, fakeId);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Link Attachments', () => {
    it('should get attachments for a link', async () => {
      const attachments = await client.getLinkAttachments(brainId, linkId);
      
      expect(Array.isArray(attachments)).toBe(true);
      // The array may be empty if no attachments exist
    });

    it('should handle non-existent link', async () => {
      const fakeId = uuidv4();
      
      try {
        await client.getLinkAttachments(brainId, fakeId);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('Link Between Thoughts', () => {
    it('should get link between two thoughts', async () => {
      const link = await client.getLinkBetweenThoughts(brainId, thoughtId1, thoughtId2);
      
      expect(link).toBeDefined();
      expect(link?.idA).toBe(thoughtId1);
      expect(link?.idB).toBe(thoughtId2);
    });

    it('should return null for thoughts with no link', async () => {
      // Create a new thought with no link to others
      const thought3 = await client.createThought(brainId, {
        name: `Test Thought 3 ${uuidv4()}`,
      });

      const link = await client.getLinkBetweenThoughts(brainId, thoughtId1, thought3.id);
      
      expect(link).toBeNull();
    });

    it('should handle non-existent thoughts', async () => {
      const fakeId1 = uuidv4();
      const fakeId2 = uuidv4();
      
      const link = await client.getLinkBetweenThoughts(brainId, fakeId1, fakeId2);
      expect(link).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should clean up test data', async () => {
      // Delete the link first
      if (linkId) {
        await client.deleteLink(brainId, linkId);
      }

      // Delete the thoughts
      if (thoughtId1) {
        await client.deleteThought(brainId, thoughtId1);
      }
      if (thoughtId2) {
        await client.deleteThought(brainId, thoughtId2);
      }
    });
  });
});