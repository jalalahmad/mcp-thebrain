import { TheBrainClient } from '../../thebrain';
import axios from 'axios';

const API_KEY = process.env.THEBRAIN_API_KEY || '';
const TECHNOLOGY_BRAIN_ID = '768a6029-877a-4993-9fd3-dcd3462ea9c1';

describe('Notes API with Thought Creation', () => {
  let client: TheBrainClient;
  const axiosInstance = axios.create({
    baseURL: 'https://api.bra.in/v1',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
    },
  });

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error('THEBRAIN_API_KEY environment variable is required');
    }
    client = new TheBrainClient('https://api.bra.in', API_KEY);
  });

  it('should test notes with a newly created thought', async () => {
    // 1. Create a new thought
    const newThought = await client.createThought(TECHNOLOGY_BRAIN_ID, {
      name: `Notes Test ${Date.now()}`,
    });
    console.log('Created thought:', newThought);

    // 2. Try to get notes (might not exist)
    try {
      const response = await axiosInstance.get(`/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}`);
      console.log('Initial notes response:', {
        status: response.status,
        data: response.data,
        dataType: typeof response.data,
      });
    } catch (error: any) {
      console.log('Initial notes error:', {
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // 3. Create notes
    try {
      const createResponse = await axiosInstance.post(
        `/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}/update`,
        { markdown: '# Test Note\n\nThis is a test note.' }
      );
      console.log('Create notes response:', {
        status: createResponse.status,
        data: createResponse.data,
        headers: createResponse.headers,
      });
    } catch (error: any) {
      console.log('Create notes error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
    }

    // 4. Get notes after creation
    try {
      const response = await axiosInstance.get(`/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}`);
      console.log('Get notes after creation:', {
        status: response.status,
        data: response.data,
      });
    } catch (error: any) {
      console.log('Get notes after creation error:', {
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // 5. Get notes in text format
    try {
      const textResponse = await axiosInstance.get(`/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}/text`);
      console.log('Get notes text:', {
        status: textResponse.status,
        data: textResponse.data,
      });
    } catch (error: any) {
      console.log('Get notes text error:', {
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // 6. Get notes in HTML format
    try {
      const htmlResponse = await axiosInstance.get(`/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}/html`);
      console.log('Get notes HTML:', {
        status: htmlResponse.status,
        data: htmlResponse.data,
      });
    } catch (error: any) {
      console.log('Get notes HTML error:', {
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // 7. Append to notes
    try {
      const appendResponse = await axiosInstance.post(
        `/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}/append`,
        { markdown: '\n\n## Appended Section\n\nThis was appended.' }
      );
      console.log('Append notes response:', {
        status: appendResponse.status,
        data: appendResponse.data,
      });
    } catch (error: any) {
      console.log('Append notes error:', {
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // 8. Get final notes
    try {
      const finalResponse = await axiosInstance.get(`/notes/${TECHNOLOGY_BRAIN_ID}/${newThought.id}`);
      console.log('Final notes:', {
        status: finalResponse.status,
        data: finalResponse.data,
      });
    } catch (error: any) {
      console.log('Final notes error:', {
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // 9. Cleanup - delete the thought
    await client.deleteThought(TECHNOLOGY_BRAIN_ID, newThought.id);
    console.log('Deleted test thought');
  });
});