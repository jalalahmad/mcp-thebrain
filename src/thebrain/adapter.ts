/**
 * TheBrain API adapter - adapts the official thebrain-api package to our expected interface
 */
import logger from '../utils/logger';
import { ServiceUnavailableError } from '../utils/error-handler';
import * as path from 'path';
import * as url from 'url';

// Export types for external use
export type Thought = any;
export type Link = any;
export type Brain = any;
export type Attachment = any;
export type SearchResult = any;
export type BrainStatistics = any;
export type ThoughtGraph = any;
export type Note = any;

// This helper function dynamically imports the ESM module
async function createTheBrainApi(baseUrl: string, apiKey: string) {
  try {
    // Use dynamic import() for ES modules
    // Note: We need to resolve the path to the module which might be in node_modules
    // Using import() with a variable is the proper way to dynamically import ES modules in CommonJS
    const theBrainModule = await import('thebrain-api');
    const { TheBrainApi } = theBrainModule;
    
    // Create configuration
    const config = {
      baseURL: baseUrl,
      apiKey: apiKey,
      timeout: 30000,
      logLevel: 'info',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    // Initialize the API
    const api = new TheBrainApi(config);
    
    // Set log level based on our app's logger
    if (logger.level === 'debug') {
      api.setLogLevel('debug');
    } else if (logger.level === 'info') {
      api.setLogLevel('info');
    } else if (logger.level === 'warn' || logger.level === 'warning') {
      api.setLogLevel('warn');
    } else if (logger.level === 'error') {
      api.setLogLevel('error');
    }
    
    return api;
  } catch (error) {
    logger.error(`Failed to initialize TheBrainApi: ${error}`);
    throw error;
  }
}

export class TheBrainClient {
  private apiPromise: Promise<any>;
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.apiPromise = createTheBrainApi(baseUrl, apiKey);
  }

  // Helper method to get API instance
  private async getApi() {
    return await this.apiPromise;
  }

  // Thoughts API
  async createThought(brainId: string, request: any): Promise<Thought> {
    try {
      logger.debug(`Creating thought in brain ${brainId}`, { request });
      const api = await this.getApi();
      const result = await api.thoughts.createThought(brainId, request);
      logger.debug(`Created thought: ${result.id}`);
      return result;
    } catch (error) {
      logger.error(`Failed to create thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThought(brainId: string, thoughtId: string): Promise<Thought> {
    try {
      logger.debug(`Getting thought ${thoughtId} from brain ${brainId}`);
      const api = await this.getApi();
      return await api.thoughts.getThought(brainId, thoughtId);
    } catch (error) {
      logger.error(`Failed to get thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async updateThought(brainId: string, thoughtId: string, request: any): Promise<Thought> {
    try {
      logger.debug(`Updating thought ${thoughtId} in brain ${brainId}`, { request });
      const api = await this.getApi();
      
      // Transform the request into a JSON-patch document
      const operations = Object.keys(request).map(key => ({
        op: 'replace',
        path: `/${key}`,
        value: request[key]
      }));
      
      await api.thoughts.updateThought(brainId, thoughtId, operations);
      logger.debug(`Updated thought: ${thoughtId}`);
      
      // The update method doesn't return the thought, so we need to fetch it
      return await this.getThought(brainId, thoughtId);
    } catch (error) {
      logger.error(`Failed to update thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async deleteThought(brainId: string, thoughtId: string): Promise<void> {
    try {
      logger.debug(`Deleting thought ${thoughtId} from brain ${brainId}`);
      const api = await this.getApi();
      await api.thoughts.deleteThought(brainId, thoughtId);
      logger.debug(`Deleted thought: ${thoughtId}`);
    } catch (error) {
      logger.error(`Failed to delete thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThoughtChildren(brainId: string, thoughtId: string): Promise<Thought[]> {
    try {
      logger.debug(`Getting children of thought ${thoughtId}`);
      const api = await this.getApi();
      // The new API doesn't have a direct method for this, so we need to get the graph
      const graph = await api.thoughts.getThoughtGraph(brainId, thoughtId, false);
      return graph.children || [];
    } catch (error) {
      logger.error(`Failed to get thought children: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThoughtParents(brainId: string, thoughtId: string): Promise<Thought[]> {
    try {
      logger.debug(`Getting parents of thought ${thoughtId}`);
      const api = await this.getApi();
      // The new API doesn't have a direct method for this, so we need to get the graph
      const graph = await api.thoughts.getThoughtGraph(brainId, thoughtId, false);
      return graph.parents || [];
    } catch (error) {
      logger.error(`Failed to get thought parents: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThoughtSiblings(brainId: string, thoughtId: string): Promise<Thought[]> {
    try {
      logger.debug(`Getting siblings of thought ${thoughtId}`);
      const api = await this.getApi();
      // The new API doesn't have a direct method for this, so we need to get the graph with siblings
      const graph = await api.thoughts.getThoughtGraph(brainId, thoughtId, true);
      return graph.siblings || [];
    } catch (error) {
      logger.error(`Failed to get thought siblings: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThoughtByName(brainId: string, name: string): Promise<Thought> {
    try {
      logger.debug(`Getting thought by name: ${name}`);
      const api = await this.getApi();
      // The new API might not have this method directly
      // We'll search for the exact name and take the first result
      const searchResults = await api.search.searchInBrain(brainId, name, {
        onlySearchThoughtNames: true,
        maxResults: 1
      });
      
      if (searchResults.length === 0 || searchResults[0].name !== name) {
        throw new Error(`Thought with name '${name}' not found`);
      }
      
      return searchResults[0];
    } catch (error) {
      logger.error(`Failed to get thought by name: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getPinnedThoughts(brainId: string): Promise<Thought[]> {
    try {
      logger.debug(`Getting pinned thoughts for brain ${brainId}`);
      const api = await this.getApi();
      return await api.thoughts.getPinnedThoughts(brainId);
    } catch (error) {
      logger.error(`Failed to get pinned thoughts: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async pinThought(brainId: string, thoughtId: string): Promise<void> {
    try {
      logger.debug(`Pinning thought ${thoughtId}`);
      const api = await this.getApi();
      await api.thoughts.pinThought(brainId, thoughtId);
      logger.debug(`Pinned thought ${thoughtId}`);
    } catch (error) {
      logger.error(`Failed to pin thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async unpinThought(brainId: string, thoughtId: string): Promise<void> {
    try {
      logger.debug(`Unpinning thought ${thoughtId}`);
      const api = await this.getApi();
      await api.thoughts.unpinThought(brainId, thoughtId);
      logger.debug(`Unpinned thought ${thoughtId}`);
    } catch (error) {
      logger.error(`Failed to unpin thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getTags(brainId: string): Promise<Thought[]> {
    try {
      logger.debug(`Getting tags for brain ${brainId}`);
      const api = await this.getApi();
      return await api.thoughts.getTags(brainId);
    } catch (error) {
      logger.error(`Failed to get tags: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getTypes(brainId: string): Promise<Thought[]> {
    try {
      logger.debug(`Getting types for brain ${brainId}`);
      const api = await this.getApi();
      return await api.thoughts.getTypes(brainId);
    } catch (error) {
      logger.error(`Failed to get types: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThoughtGraph(brainId: string, thoughtId: string, depth?: number): Promise<ThoughtGraph> {
    try {
      logger.debug(`Getting thought graph for ${thoughtId} with depth ${depth}`);
      const api = await this.getApi();
      return await api.thoughts.getThoughtGraph(brainId, thoughtId, true);
    } catch (error) {
      logger.error(`Failed to get thought graph: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async setActiveThought(brainId: string, thoughtId: string): Promise<void> {
    try {
      logger.debug(`Setting active thought to ${thoughtId}`);
      // The new API might not have this method directly
      // We'll simulate it with an update operation
      await this.updateThought(brainId, thoughtId, { isActive: true });
      logger.debug(`Set active thought to ${thoughtId}`);
    } catch (error) {
      logger.error(`Failed to set active thought: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getThoughtAttachments(brainId: string, thoughtId: string): Promise<Attachment[]> {
    try {
      logger.debug(`Getting attachments for thought ${thoughtId}`);
      const api = await this.getApi();
      return await api.thoughts.getThoughtAttachments(brainId, thoughtId);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return [];
      }
      logger.error(`Failed to get thought attachments: ${error}`);
      if (error.message?.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Links API
  async createLink(brainId: string, request: any): Promise<Link> {
    try {
      logger.debug(`Creating link in brain ${brainId}`, { request });
      const api = await this.getApi();
      const result = await api.links.createLink(brainId, request);
      logger.debug(`Created link: ${result.id}`);
      return result;
    } catch (error) {
      logger.error(`Failed to create link: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getLink(brainId: string, linkId: string): Promise<Link> {
    try {
      logger.debug(`Getting link ${linkId} from brain ${brainId}`);
      const api = await this.getApi();
      return await api.links.getLink(brainId, linkId);
    } catch (error) {
      logger.error(`Failed to get link: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async deleteLink(brainId: string, linkId: string): Promise<void> {
    try {
      logger.debug(`Deleting link ${linkId} from brain ${brainId}`);
      const api = await this.getApi();
      await api.links.deleteLink(brainId, linkId);
      logger.debug(`Deleted link: ${linkId}`);
    } catch (error) {
      logger.error(`Failed to delete link: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getLinkBetweenThoughts(brainId: string, thoughtIdA: string, thoughtIdB: string): Promise<Link | null> {
    try {
      logger.debug(`Getting link between thoughts ${thoughtIdA} and ${thoughtIdB}`);
      const api = await this.getApi();
      // The new API might not have this method directly
      // We'll get all links and filter for the ones between these thoughts
      const links = await api.links.getLinks(brainId);
      const link = links.find((l: any) => 
        (l.thoughtIdA === thoughtIdA && l.thoughtIdB === thoughtIdB) || 
        (l.thoughtIdA === thoughtIdB && l.thoughtIdB === thoughtIdA)
      );
      
      return link || null;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      logger.error(`Failed to get link between thoughts: ${error}`);
      if (error.message?.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getLinkAttachments(brainId: string, linkId: string): Promise<Attachment[]> {
    try {
      logger.debug(`Getting attachments for link ${linkId}`);
      const api = await this.getApi();
      return await api.links.getLinkAttachments(brainId, linkId);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return [];
      }
      logger.error(`Failed to get link attachments: ${error}`);
      if (error.message?.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Attachments API
  async createAttachment(brainId: string, thoughtId: string, data: any): Promise<void> {
    try {
      logger.debug(`Creating attachment for thought ${thoughtId}`);
      const api = await this.getApi();
      // The new API might have a different signature
      await api.attachments.addFileAttachment(brainId, thoughtId, data);
      logger.debug(`Created attachment`);
    } catch (error) {
      logger.error(`Failed to create attachment: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async createUrlAttachment(brainId: string, thoughtId: string, url: string): Promise<void> {
    try {
      logger.debug(`Creating URL attachment for thought ${thoughtId}: ${url}`);
      const api = await this.getApi();
      await api.attachments.addUrlAttachment(brainId, thoughtId, url);
      logger.debug(`Created URL attachment`);
    } catch (error) {
      logger.error(`Failed to create URL attachment: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async deleteAttachment(brainId: string, attachmentId: string): Promise<void> {
    try {
      logger.debug(`Deleting attachment ${attachmentId}`);
      const api = await this.getApi();
      // The new API might have a different format for attachment IDs
      // In our case, we had "brainId/attachmentId" format, so we extract the actual ID
      const actualAttachmentId = attachmentId.includes('/') ? attachmentId.split('/')[1] : attachmentId;
      
      await api.attachments.deleteAttachment(brainId, actualAttachmentId);
      logger.debug(`Deleted attachment: ${attachmentId}`);
    } catch (error) {
      logger.error(`Failed to delete attachment: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Notes API
  async getNotes(brainId: string, thoughtId: string): Promise<Note> {
    try {
      logger.debug(`Getting notes for thought ${thoughtId}`);
      const api = await this.getApi();
      return await api.notes.getNoteMarkdown(brainId, thoughtId);
    } catch (error) {
      logger.error(`Failed to get notes: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async updateNotes(brainId: string, thoughtId: string, markdown: string): Promise<void> {
    try {
      logger.debug(`Updating notes for thought ${thoughtId}`);
      const api = await this.getApi();
      await api.notes.createOrUpdateNote(brainId, thoughtId, { markdown });
      logger.debug(`Updated notes for thought ${thoughtId}`);
    } catch (error) {
      logger.error(`Failed to update notes: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async appendNotes(brainId: string, thoughtId: string, markdown: string): Promise<void> {
    try {
      logger.debug(`Appending notes for thought ${thoughtId}`);
      const api = await this.getApi();
      await api.notes.appendToNote(brainId, thoughtId, markdown);
      logger.debug(`Appended notes for thought ${thoughtId}`);
    } catch (error) {
      logger.error(`Failed to append notes: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Brains API
  async getBrains(): Promise<Brain[]> {
    try {
      logger.debug('Getting all brains');
      const api = await this.getApi();
      return await api.brains.getBrains();
    } catch (error) {
      logger.error(`Failed to get brains: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getBrain(brainId: string): Promise<Brain> {
    try {
      logger.debug(`Getting brain ${brainId}`);
      const api = await this.getApi();
      return await api.brains.getBrain(brainId);
    } catch (error) {
      logger.error(`Failed to get brain: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getBrainStatistics(brainId: string): Promise<BrainStatistics> {
    try {
      logger.debug(`Getting statistics for brain ${brainId}`);
      const api = await this.getApi();
      return await api.brains.getBrainStats(brainId);
    } catch (error) {
      logger.error(`Failed to get brain statistics: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Search API
  async search(brainId: string, query: string): Promise<SearchResult> {
    try {
      logger.debug(`Searching brain ${brainId} for: ${query}`);
      const api = await this.getApi();
      return await api.search.searchInBrain(brainId, query, { maxResults: 100 });
    } catch (error) {
      logger.error(`Failed to search: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async searchAccessible(query: string): Promise<SearchResult> {
    try {
      logger.debug(`Searching accessible brains for: ${query}`);
      const api = await this.getApi();
      return await api.search.searchAccessible(query, { maxResults: 100 });
    } catch (error) {
      logger.error(`Failed to search accessible: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async searchPublic(query: string): Promise<SearchResult> {
    try {
      logger.debug(`Searching public brains for: ${query}`);
      const api = await this.getApi();
      return await api.search.searchPublic(query, { maxResults: 100 });
    } catch (error) {
      logger.error(`Failed to search public: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Users API (health check)
  async healthCheck(): Promise<boolean> {
    try {
      const api = await this.getApi();
      await api.users.getOrganizationMembers();
      return true;
    } catch (error) {
      logger.error(`Health check failed: ${error}`);
      return false;
    }
  }

  // Additional Brain Management methods
  async createBrain(request: any): Promise<Brain> {
    try {
      logger.debug('Creating new brain', { request });
      const api = await this.getApi();
      return await api.brains.createBrain(request);
    } catch (error) {
      logger.error(`Failed to create brain: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async deleteBrain(brainId: string): Promise<void> {
    try {
      logger.debug(`Deleting brain ${brainId}`);
      const api = await this.getApi();
      await api.brains.deleteBrain(brainId);
    } catch (error) {
      logger.error(`Failed to delete brain: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getBrainModifications(brainId: string): Promise<any[]> {
    try {
      logger.debug(`Getting modifications for brain ${brainId}`);
      const api = await this.getApi();
      return await api.brains.getBrainModifications(brainId);
    } catch (error) {
      logger.error(`Failed to get brain modifications: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Access control
  async getBrainAccess(brainId: string): Promise<any[]> {
    try {
      logger.debug(`Getting access list for brain ${brainId}`);
      const api = await this.getApi();
      return await api.brains.getBrainAccess(brainId);
    } catch (error) {
      logger.error(`Failed to get brain access: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async grantBrainAccess(brainId: string, request: any): Promise<any> {
    try {
      logger.debug(`Granting brain access for ${brainId}`, { request });
      const api = await this.getApi();
      return await api.brains.grantBrainAccess(brainId, request);
    } catch (error) {
      logger.error(`Failed to grant brain access: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async revokeBrainAccess(brainId: string, userId: string): Promise<void> {
    try {
      logger.debug(`Revoking brain access for user ${userId} from brain ${brainId}`);
      const api = await this.getApi();
      await api.brains.revokeBrainAccess(brainId, userId);
    } catch (error) {
      logger.error(`Failed to revoke brain access: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Additional Thought methods
  async getThoughtModifications(brainId: string, thoughtId: string): Promise<any[]> {
    try {
      logger.debug(`Getting modifications for thought ${thoughtId}`);
      const api = await this.getApi();
      return await api.thoughts.getThoughtModifications(brainId, thoughtId);
    } catch (error) {
      logger.error(`Failed to get thought modifications: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async pinThoughts(brainId: string, thoughtIds: string[]): Promise<void> {
    try {
      logger.debug(`Pinning multiple thoughts: ${thoughtIds.join(', ')}`);
      const api = await this.getApi();
      await api.thoughts.pinThoughts(brainId, thoughtIds);
    } catch (error) {
      logger.error(`Failed to pin thoughts: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async unpinThoughts(brainId: string, thoughtIds: string[]): Promise<void> {
    try {
      logger.debug(`Unpinning multiple thoughts: ${thoughtIds.join(', ')}`);
      const api = await this.getApi();
      await api.thoughts.unpinThoughts(brainId, thoughtIds);
    } catch (error) {
      logger.error(`Failed to unpin thoughts: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Link update method
  async updateLink(brainId: string, linkId: string, request: any): Promise<Link> {
    try {
      logger.debug(`Updating link ${linkId} in brain ${brainId}`, { request });
      const api = await this.getApi();
      
      // Transform the request into a JSON-patch document similar to updateThought
      const operations = Object.keys(request).map(key => ({
        op: 'replace',
        path: `/${key}`,
        value: request[key]
      }));
      
      await api.links.updateLink(brainId, linkId, operations);
      
      // The update method doesn't return the link, so we need to fetch it
      return await this.getLink(brainId, linkId);
    } catch (error) {
      logger.error(`Failed to update link: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Additional Attachment methods
  async getAttachmentMetadata(brainId: string, attachmentId: string): Promise<any> {
    try {
      logger.debug(`Getting metadata for attachment ${attachmentId}`);
      const api = await this.getApi();
      return await api.attachments.getAttachmentMetadata(brainId, attachmentId);
    } catch (error) {
      logger.error(`Failed to get attachment metadata: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getAttachmentFileContent(brainId: string, attachmentId: string): Promise<ArrayBuffer> {
    try {
      logger.debug(`Getting file content for attachment ${attachmentId}`);
      const api = await this.getApi();
      return await api.attachments.getAttachmentContent(brainId, attachmentId);
    } catch (error) {
      logger.error(`Failed to get attachment content: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  // Additional Notes methods
  async getNotesText(brainId: string, thoughtId: string): Promise<Note> {
    try {
      logger.debug(`Getting notes text for thought ${thoughtId}`);
      const api = await this.getApi();
      return await api.notes.getNoteText(brainId, thoughtId);
    } catch (error) {
      logger.error(`Failed to get notes text: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getNotesHtml(brainId: string, thoughtId: string): Promise<Note> {
    try {
      logger.debug(`Getting notes HTML for thought ${thoughtId}`);
      const api = await this.getApi();
      return await api.notes.getNoteHtml(brainId, thoughtId);
    } catch (error) {
      logger.error(`Failed to get notes HTML: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getNoteImage(brainId: string, token: string, filename: string): Promise<ArrayBuffer> {
    try {
      logger.debug(`Getting note image ${filename}`);
      const api = await this.getApi();
      return await api.notes.getNoteImage(brainId, token, filename);
    } catch (error) {
      logger.error(`Failed to get note image: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }

  async getNoteImageAsBlob(brainId: string, token: string, filename: string): Promise<Blob> {
    try {
      const buffer = await this.getNoteImage(brainId, token, filename);
      return new Blob([buffer]);
    } catch (error) {
      logger.error(`Failed to get note image as blob: ${error}`);
      throw error;
    }
  }

  async getNoteImageAsBase64(brainId: string, token: string, filename: string): Promise<string> {
    try {
      const buffer = await this.getNoteImage(brainId, token, filename);
      return Buffer.from(buffer).toString('base64');
    } catch (error) {
      logger.error(`Failed to get note image as base64: ${error}`);
      throw error;
    }
  }

  // Utility operations
  async getOrganizationInfo(): Promise<any> {
    try {
      logger.debug('Getting organization info');
      const api = await this.getApi();
      return await api.users.getOrganizationInfo();
    } catch (error) {
      logger.error(`Failed to get organization info: ${error}`);
      if (error instanceof Error && error.message.includes('network')) {
        throw new ServiceUnavailableError('TheBrain API is unavailable');
      }
      throw error;
    }
  }
}