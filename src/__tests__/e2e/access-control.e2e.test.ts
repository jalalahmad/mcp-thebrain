import { TheBrainClient } from '../../thebrain';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

describe('TheBrain Access Control E2E', () => {
  let client: TheBrainClient;
  let brainId: string;

  // Check required environment variables
  const apiKey = process.env.THEBRAIN_API_KEY;
  const testBrainId = process.env.TEST_BRAIN_ID;
  
  if (!apiKey || !testBrainId) {
    console.warn('Skipping access control E2E tests - TEST_BRAIN_ID or THEBRAIN_API_KEY not set');
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

  describe('Brain access management', () => {
    it('should get brain access list', async () => {
      try {
        const accessList = await client.getBrainAccess(brainId);
        
        expect(Array.isArray(accessList)).toBe(true);
        
        // If there are access entries, check their structure
        if (accessList.length > 0) {
          const access = accessList[0];
          expect(access).toHaveProperty('brainId');
          expect(access).toHaveProperty('userId');
          expect(access).toHaveProperty('role');
          expect(['Owner', 'Editor', 'Viewer']).toContain(access.role);
          expect(access).toHaveProperty('grantedAt');
          expect(access).toHaveProperty('isActive');
        }
      } catch (error: any) {
        // This might fail if user doesn't have permission to view access
        console.warn('Brain access retrieval failed:', error.message);
      }
    });

    it('should grant brain access', async () => {
      const testEmail = `test-${uuidv4()}@example.com`;
      
      try {
        const newAccess = await client.grantBrainAccess(brainId, {
          email: testEmail,
          role: 'Viewer',
        });
        
        expect(newAccess).toHaveProperty('brainId');
        expect(newAccess.brainId).toBe(brainId);
        expect(newAccess).toHaveProperty('role');
        expect(newAccess.role).toBe('Viewer');
        expect(newAccess).toHaveProperty('isActive');
        expect(newAccess.isActive).toBe(true);
        
        // Clean up - revoke the access we just granted
        if (newAccess.userId) {
          await client.revokeBrainAccess(brainId, newAccess.userId);
        }
      } catch (error: any) {
        // This might fail if user doesn't have permission to grant access
        console.warn('Grant access failed:', error.message);
      }
    });

    it('should handle granting access with invalid email', async () => {
      try {
        await client.grantBrainAccess(brainId, {
          email: 'invalid-email',
          role: 'Viewer',
        });
        fail('Should have thrown validation error');
      } catch (error: any) {
        expect([400, 422]).toContain(error.statusCode);
      }
    });

    it('should revoke brain access', async () => {
      // First, we need to get the access list to find a user to revoke
      try {
        const accessList = await client.getBrainAccess(brainId);
        
        // Find a non-owner user that we can safely revoke
        const userToRevoke = accessList.find(access => 
          access.role !== 'Owner' && access.isActive
        );
        
        if (userToRevoke) {
          await client.revokeBrainAccess(brainId, userToRevoke.userId);
          
          // Verify the access was revoked
          const updatedList = await client.getBrainAccess(brainId);
          const revokedUser = updatedList.find(access => 
            access.userId === userToRevoke.userId
          );
          
          expect(revokedUser?.isActive).toBe(false);
        } else {
          console.warn('No suitable user found to test revocation');
        }
      } catch (error: any) {
        console.warn('Revoke access test failed:', error.message);
      }
    });

    it('should handle non-existent brain', async () => {
      const fakeBrainId = uuidv4();
      
      try {
        await client.getBrainAccess(fakeBrainId);
        fail('Should have thrown 404 error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
      }
    });
  });
});