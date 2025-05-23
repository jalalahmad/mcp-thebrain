import { TheBrainClient } from '../../thebrain';

const API_KEY = process.env.THEBRAIN_API_KEY || '';

describe.skip('TheBrain Attachment List API Test', () => {
  let client: TheBrainClient;

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error('THEBRAIN_API_KEY environment variable is required');
    }
    client = new TheBrainClient('https://api.bra.in', API_KEY);
  });

  it('should get thought attachments and log the response structure', async () => {
    // Get brains first
    const brains = await client.getBrains();
    expect(brains.length).toBeGreaterThan(0);
    
    const brainId = brains[0].id;
    
    // Get thoughts
    const thoughts = await client.getThoughts(brainId);
    expect(thoughts.length).toBeGreaterThan(0);
    
    // Try to get attachments for the first thought
    const thoughtId = thoughts[0].id;
    
    try {
      const attachments = await client.getThoughtAttachments(brainId, thoughtId);
      
      console.log('Attachments response:', JSON.stringify(attachments, null, 2));
      console.log('Number of attachments:', attachments.length);
      
      if (attachments.length > 0) {
        console.log('First attachment structure:', JSON.stringify(attachments[0], null, 2));
        
        // Log all fields
        const firstAttachment = attachments[0];
        console.log('Attachment fields:');
        console.log('- id:', firstAttachment.id);
        console.log('- brainId:', firstAttachment.brainId);
        console.log('- sourceId:', firstAttachment.sourceId);
        console.log('- sourceType:', firstAttachment.sourceType);
        console.log('- creationDateTime:', firstAttachment.creationDateTime);
        console.log('- modificationDateTime:', firstAttachment.modificationDateTime);
        console.log('- name:', firstAttachment.name);
        console.log('- position:', firstAttachment.position);
        console.log('- fileModificationDateTime:', firstAttachment.fileModificationDateTime);
        console.log('- type:', firstAttachment.type);
        console.log('- isNotes:', firstAttachment.isNotes);
        console.log('- dataLength:', firstAttachment.dataLength);
        console.log('- location:', firstAttachment.location);
      }
    } catch (error: any) {
      console.log('Error getting attachments:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
    }
  });

  it('should get link attachments if any links exist', async () => {
    const brains = await client.getBrains();
    const brainId = brains[0].id;
    
    // Get links
    const links = await client.getLinks(brainId);
    
    if (links.length > 0) {
      const linkId = links[0].id;
      
      try {
        const attachments = await client.getLinkAttachments(brainId, linkId);
        
        console.log('Link attachments response:', JSON.stringify(attachments, null, 2));
        console.log('Number of link attachments:', attachments.length);
      } catch (error: any) {
        console.log('Error getting link attachments:', {
          message: error.message,
          status: error.response?.status,
        });
      }
    } else {
      console.log('No links found to test link attachments');
    }
  });
});